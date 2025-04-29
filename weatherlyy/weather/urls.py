from django.urls import path
from . import views

app_name = 'weather'

urlpatterns = [
    # Page URLs
    path('', views.index, name='index'), # Home page remains at the app root
    path('about/', views.about, name='about'), # About page URL
    # NEW: Detail page URL, takes city name
    path('detail/<str:city_name>/', views.weather_detail, name='weather_detail'),
    # NEW: Dedicated login/signup page URLs
    path('login/', views.login_page, name='login_page'),
    path('signup/', views.signup_page, name='signup_page'),
    # NEW: Logout URL (points to the simple logout view) - use POST method in forms/links
    path('logout/', views.logout_view, name='logout'),


    # API URLs (Rename the main one to avoid conflict if needed)
    path('api/weather/', views.get_weather_data_api, name='get_weather_data_api'), # Renamed API endpoint
    # REMOVE or COMMENT OUT old API login/signup if using pages now
    # path('api/signup/', views.signup_view, name='signup_api'), # Example rename if keeping
    # path('api/login/', views.login_view, name='login_api'),    # Example rename if keeping
    path('api/auth_status/', views.check_auth_status, name='auth_status'),
    # Add this to your urlpatterns
    path('test-api/', views.test_api_key, name='test_api_key'),
]
