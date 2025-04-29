# weather/views.py

# --- Standard Library Imports ---
import json
import os
from datetime import datetime

# --- Third-Party Imports ---
import requests

# --- Django Imports ---
from django.conf import settings# To access settings like LOGOUT_REDIRECT_URL

# Add this temporary test function
def test_api_key(request):
    api_key = os.getenv('OPENWEATHERMAP_API_KEY')
    from django.http import JsonResponse
    return JsonResponse({
        'api_key_set': bool(api_key),
        'api_key_value': api_key[:5] + '...' if api_key else None,
        'env_file_loaded': True
    })
from django.contrib import messages                      # For flash messages
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout # Core auth functions
from django.contrib.auth.decorators import login_required  # Optional decorator for views
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm # Standard auth forms
from django.http import Http404, JsonResponse            # HTTP responses
from django.middleware.csrf import get_token             # For passing CSRF token if needed by JS
from django.shortcuts import get_object_or_404, redirect, render # Common shortcuts
from django.views.decorators.http import require_http_methods, require_POST # View decorators
# --- Constants (Keep these) ---
API_KEY = os.getenv('OPENWEATHERMAP_API_KEY')
CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather?q={}&appid={}&units=metric"
FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast?q={}&appid={}&units=metric&cnt=40"

# --- Helper Function (Optional but useful) ---
def _get_weather_for_city(city):
    """Helper to fetch both current and forecast data."""
    if not API_KEY:
        return {'error': 'API Key not configured'}

    weather_data = {'current': None, 'forecast': None, 'city_info': None}
    api_error = None

    # Fetch Current Weather (includes coordinates needed for map/detail)
    try:
        current_response = requests.get(CURRENT_WEATHER_URL.format(city, API_KEY))
        current_response.raise_for_status()
        current_json = current_response.json()
        weather_data['current'] = current_json
        # Store city info including coordinates if available
        if 'coord' in current_json and 'name' in current_json:
             weather_data['city_info'] = {
                 'name': current_json['name'],
                 'lat': current_json['coord']['lat'],
                 'lon': current_json['coord']['lon']
            }

    except requests.exceptions.RequestException as e:
        # Handle errors gracefully
        status_code = e.response.status_code if hasattr(e, 'response') and e.response is not None else 500
        try:
             error_detail = e.response.json().get('message', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        except json.JSONDecodeError:
             error_detail = str(e)
        api_error = f"Error fetching current weather for {city}: {error_detail} ({status_code})"
        weather_data['current'] = None

    # Fetch 5-Day Forecast
    try:
        forecast_response = requests.get(FORECAST_URL.format(city, API_KEY))
        forecast_response.raise_for_status()
        full_forecast = forecast_response.json()
        daily_forecast = {}
        if 'list' in full_forecast:
            for item in full_forecast['list']:
                # Get date part (YYYY-MM-DD)
                day = item['dt_txt'].split(' ')[0]
                # Simple daily aggregation (example: take first entry's details, update min/max)
                if day not in daily_forecast:
                    daily_forecast[day] = {
                        'date': day,
                        'temp_min': item['main']['temp_min'],
                        'temp_max': item['main']['temp_max'],
                        'description': item['weather'][0]['description'],
                        'icon': item['weather'][0]['icon'],
                        'details': [] # Store hourly details for this day if needed
                    }
                else:
                    daily_forecast[day]['temp_min'] = min(daily_forecast[day]['temp_min'], item['main']['temp_min'])
                    daily_forecast[day]['temp_max'] = max(daily_forecast[day]['temp_max'], item['main']['temp_max'])
                # Add hourly detail (optional, useful for detail page)
                daily_forecast[day]['details'].append({
                    'time': item['dt_txt'].split(' ')[1][:5], # HH:MM
                    'temp': item['main']['temp'],
                    'icon': item['weather'][0]['icon'],
                    'description': item['weather'][0]['description']
                })

            weather_data['forecast'] = list(daily_forecast.values())[:5] # Get max 5 days
        else:
             weather_data['forecast'] = []
             if not api_error: api_error = "Forecast data format unexpected."

    except requests.exceptions.RequestException as e:
        if not api_error: # Don't overwrite current weather error
            status_code = e.response.status_code if hasattr(e, 'response') and e.response is not None else 500
            try:
                 error_detail = e.response.json().get('message', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
            except json.JSONDecodeError:
                 error_detail = str(e)
            api_error = f"Error fetching forecast for {city}: {error_detail} ({status_code})"
        weather_data['forecast'] = []

    if api_error and not (weather_data['current'] or weather_data['forecast']):
         weather_data['error'] = api_error

    # Add the top-level error if one occurred but some data was fetched
    elif api_error:
        weather_data['warning'] = api_error # Use 'warning' if partial data exists

    return weather_data


# --- Page Views ---
@login_required
def index(request):
    """Renders the main index.html page (home page). Requires login."""
    # We'll fetch initial weather via JS now to keep page load fast
    # Or pass a default city's data if desired
    context = {'csrf_token': get_token(request)}
    return render(request, 'weather/index.html', context)

def about(request):
    """Renders the about page."""
    context = {
        'current_year': datetime.now().year # For footer
    }
    return render(request, 'weather/about.html', context)

# @login_required # Optional: uncomment if details should be private
def weather_detail(request, city_name):
    """Renders the weather detail page for a specific city."""
    # Fetch comprehensive data for the detail view
    weather_info = _get_weather_for_city(city_name)

    if weather_info.get('error'):
        # Handle critical errors (like API key issue)
        messages.error(request, weather_info['error'])
        # Redirect or render an error template might be better
        raise Http404(weather_info['error']) # Or redirect to index
    elif not weather_info.get('current') and not weather_info.get('forecast'):
        # Handle case where city wasn't found or both fetches failed
        messages.warning(request, f"Could not retrieve weather data for {city_name}.")
        raise Http404(f"Weather data not found for {city_name}") # Or redirect

    context = {
        'city_name': city_name, # Pass the requested city name
        'weather': weather_info,
        'current_year': datetime.now().year # For footer
    }
    return render(request, 'weather/detail.html', context)


def login_page(request):
    """Handles GET and POST for the dedicated login page."""
    if request.user.is_authenticated:
        return redirect('weather:index') # Already logged in

    if request.method == 'POST':
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(username=username, password=password)
            if user is not None:
                auth_login(request, user)
                messages.success(request, f"Welcome back, {username}!")
                # Redirect to LOGIN_REDIRECT_URL (or a specific page)
                next_url = request.POST.get('next', None)
                return redirect(next_url or 'weather:index')
            else:
                messages.error(request, "Invalid username or password.")
        else:
            messages.error(request, "Invalid username or password.")
    else:
        form = AuthenticationForm()

    context = {
        'form': form,
        'current_year': datetime.now().year # For footer
    }
    return render(request, 'weather/login.html', context)

def signup_page(request):
    """Handles GET and POST for the dedicated signup page."""
    if request.user.is_authenticated:
        return redirect('weather:index') # Already logged in

    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            # auth_login(request, user) # Optional: log in user immediately
            username = form.cleaned_data.get('username')
            messages.success(request, f"Account created for {username}! You can now log in.")
            return redirect('weather:login_page') # Redirect to login page after signup
        else:
             # Errors will be bound to the form and displayed in the template
             messages.error(request, "Please correct the errors below.")
    else:
        form = UserCreationForm()

    context = {
        'form': form,
        'current_year': datetime.now().year # For footer
    }
    return render(request, 'weather/signup.html', context)

# weather/views.py -> logout_view function

def logout_view(request):
    """Logs the user out and redirects."""
    if request.method == 'POST': # Ensure logout is via POST
        auth_logout(request)
        messages.info(request, "You have been successfully logged out.")
    # CHANGE THIS LINE: Access the setting via the 'settings' object
    return redirect(settings.LOGOUT_REDIRECT_URL or 'weather:index')


# --- API Views (Still needed for home page dynamic updates) ---
@require_http_methods(["GET"])
def get_weather_data_api(request):
    """API endpoint to fetch weather data (primarily for home page JS)."""
    city = request.GET.get('city')
    if not city:
        return JsonResponse({'error': 'City parameter is required'}, status=400)

    weather_info = _get_weather_for_city(city)

    if 'error' in weather_info or (not weather_info.get('current') and not weather_info.get('forecast')):
         # Return an error structure compatible with the frontend JS error handling
        error_msg = weather_info.get('error', weather_info.get('warning', 'Failed to retrieve data'))
        return JsonResponse({'error': error_msg }, status=404 if not weather_info.get('current') else 500)

    # Return data suitable for the home page display (current, forecast, coords)
    return JsonResponse({
        'current': weather_info.get('current'),
        'forecast': weather_info.get('forecast'),
        'city_info': weather_info.get('city_info'), # Include coordinates for map
        'warning': weather_info.get('warning') # Pass along non-critical warnings
    })
# --- Authentication API Views (No longer needed if using dedicated pages/forms) ---
# You can COMMENT OUT or DELETE the old signup_view, login_view API endpoints
# as the new pages handle this via standard Django form processing.
# Keep check_auth_status if the home page JS still needs it.

# @require_POST
# def signup_view(request): ... (DELETE or COMMENT OUT)

# @require_POST
# def login_view(request): ... (DELETE or COMMENT OUT)

@require_http_methods(["GET"])
def check_auth_status(request):
    """API endpoint to check if user is currently logged in (for JS)."""
    if request.user.is_authenticated:
        return JsonResponse({'is_authenticated': True, 'username': request.user.username})
    else:
        return JsonResponse({'is_authenticated': False})