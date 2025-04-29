document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const searchInput = document.getElementById('city-search');
    const searchButton = document.getElementById('search-button');
    const searchError = document.getElementById('search-error');
    const loadingSpinner = document.getElementById('loading-spinner'); // Keep for text spinner
    const weatherContent = document.getElementById('weather-content');
    const cityNameEl = document.getElementById('city-name');
    const weatherDescEl = document.getElementById('weather-description');
    const currentTempEl = document.getElementById('current-temp');
    const humidityEl = document.getElementById('humidity');
    const windSpeedEl = document.getElementById('wind-speed');
    const forecastCardsContainer = document.getElementById('forecast-cards');
    const weatherIconImg = document.getElementById('weather-icon-img'); // Get the img tag
    const weatherOverlay = document.getElementById('weather-overlay'); // For rain/snow effects
    const tempChartCanvas = document.getElementById('tempChart');
    const currentWeatherCard = document.getElementById('current-weather-card'); // Card itself for click event
    const mapContainer = document.getElementById('map');
    const mapErrorEl = document.getElementById('map-error');

    // --- State Variables ---
    let weatherChart = null; // Chart.js instance
    let debounceTimer;       // Timer for debouncing search (if implemented later)
    let lastSearchedCity = localStorage.getItem('lastCity') || 'London'; // Default city or last searched
    let map = null; // Leaflet map instance
    let currentMarker = null; // Leaflet marker instance

    // --- Lottie Code Removed ---

    // --- API Call to Backend (Unchanged) ---
    async function fetchWeatherData(city) {
        showLoading();
        searchError.textContent = '';
        mapErrorEl.textContent = '';

        try {
            const url = new URL(WEATHER_API_URL, window.location.origin);
            url.searchParams.append('city', city);
            const response = await fetch(url);

            if (!response.ok) {
                let errorMsg = `HTTP Error: ${response.status} ${response.statusText}`;
                try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (e) { /* Ignore */ }
                throw new Error(errorMsg);
            }
            const data = await response.json();
            if (data.error) { throw new Error(data.error); }
            if (data.warning) { searchError.textContent = `Warning: ${data.warning}`; }

            localStorage.setItem('lastCity', city);
            updateUI(data, city);

        } catch (error) {
            console.error('Fetch weather error:', error);
            searchError.textContent = `Failed to load weather: ${error.message}. Please try again.`;
            hideLoading(false);
            if (map) { map.remove(); map = null; currentMarker = null; }
            if (mapContainer) mapContainer.style.display = 'none';
            mapErrorEl.textContent = 'Map unavailable due to weather data error.';
        }
    }

    // --- UI Update Functions ---
    function showLoading() {
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        if (weatherContent) weatherContent.classList.add('hidden');
    }

    function hideLoading(showContent = true) {
        if (loadingSpinner) loadingSpinner.classList.add('hidden');
        if (showContent && weatherContent) {
            weatherContent.classList.remove('hidden');
        }
    }

    function updateUI(data, searchedCity) {
        if (!data || (!data.current && !data.forecast)) {
            searchError.textContent = 'No weather data received.';
            hideLoading(false);
            return;
        }

        // Update Current Weather
        const currentData = data.current;
        let currentCityName = searchedCity;
        if (currentData) {
            currentCityName = currentData.name || searchedCity;
            cityNameEl.textContent = currentCityName;
            weatherDescEl.textContent = currentData.weather[0]?.description || 'N/A';
            currentTempEl.textContent = `${Math.round(currentData.main?.temp ?? '--')}°`;
            humidityEl.textContent = currentData.main?.humidity ?? '--';
            windSpeedEl.textContent = currentData.wind?.speed ?? '--';
            updateBackgroundAndEffects(currentData.weather[0]); // Pass weather object
        } else {
            cityNameEl.textContent = searchedCity;
            weatherDescEl.textContent = 'Current data unavailable';
            currentTempEl.textContent = '--°';
            humidityEl.textContent = '--';
            windSpeedEl.textContent = '--';
            updateBackgroundAndEffects(null); // Use default appearance (will hide icon)
        }
        if (currentWeatherCard) currentWeatherCard.dataset.city = currentCityName;

        // Update Forecast
        forecastCardsContainer.innerHTML = '';
        if (data.forecast && data.forecast.length > 0) {
            data.forecast.forEach(day => {
                const card = createForecastCard(day, currentCityName);
                forecastCardsContainer.appendChild(card);
            });
            updateTemperatureChart(data.forecast);
            if (tempChartCanvas) tempChartCanvas.style.display = 'block';
        } else {
            forecastCardsContainer.innerHTML = '<p class="text-white/70 col-span-full text-center">Forecast data unavailable.</p>';
            if (weatherChart) { weatherChart.destroy(); weatherChart = null; }
            if (tempChartCanvas) tempChartCanvas.style.display = 'none';
        }

        // Update Map
        const cityInfo = data.city_info;
        if (mapContainer && cityInfo && cityInfo.lat !== undefined && cityInfo.lon !== undefined) {
            mapContainer.style.display = 'block';
            mapErrorEl.textContent = '';
            initializeMap(cityInfo.lat, cityInfo.lon, cityInfo.name || currentCityName);
        } else {
            if (map) { map.remove(); map = null; currentMarker = null; }
            if (mapContainer) mapContainer.style.display = 'none';
            mapErrorEl.textContent = 'Map location data unavailable for this city.';
            console.warn("Coordinates missing, cannot display map.");
        }

        hideLoading();
    }

    // --- Helper Functions for Appearance ---
    function updateBackgroundAndEffects(weather) {
        const body = document.body;
        body.classList.remove('bg-sunny', 'bg-rainy', 'bg-snowy', 'bg-cloudy', 'bg-default');
        if (weatherOverlay) weatherOverlay.innerHTML = '';

        let backgroundClass = 'bg-default';
        let effectType = null;
        let iconSrc = ''; // URL for the static weather icon

        if (weather && weather.main && weather.icon) {
            const condition = weather.main.toLowerCase();
            const iconCode = weather.icon;
            // Use OpenWeatherMap static icons (larger size like @4x)
            iconSrc = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;

            if (condition.includes('snow')) { backgroundClass = 'bg-snowy'; effectType = 'snow'; }
            else if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunderstorm')) { backgroundClass = 'bg-rainy'; effectType = 'rain'; }
            else if (iconCode.startsWith('01')) { backgroundClass = 'bg-sunny'; }
            else if (iconCode.startsWith('02') || iconCode.startsWith('03') || iconCode.startsWith('04')) { backgroundClass = 'bg-cloudy'; }
            else if (condition.includes('clear')) { backgroundClass = 'bg-sunny'; }
            else if (condition.includes('cloud')) { backgroundClass = 'bg-cloudy'; }
            else if (['mist', 'smoke', 'haze', 'dust', 'fog', 'sand', 'ash', 'squall', 'tornado'].includes(condition)) { backgroundClass = 'bg-cloudy'; }
        }

        body.classList.add(backgroundClass);

        // Update the static image tag
        if (weatherIconImg) {
            if (iconSrc) {
                weatherIconImg.src = iconSrc;
                weatherIconImg.alt = weather ? weather.description : 'Weather Icon';
                weatherIconImg.classList.remove('opacity-0'); // Make visible
            } else {
                weatherIconImg.src = ''; // Clear src if no icon
                weatherIconImg.alt = '';
                weatherIconImg.classList.add('opacity-0'); // Hide if no icon
            }
        }

        if (effectType) {
            createWeatherEffect(effectType === 'rain' ? 'raindrop' : 'snowflake', 50);
        }
    }

    function createWeatherEffect(className, count) {
        if (!weatherOverlay) return;
        weatherOverlay.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const effect = document.createElement('div');
            effect.className = className;
            effect.style.left = `${Math.random() * 100}vw`;
            const duration = Math.random() * 3 + 2;
            const delay = Math.random() * 5;
            effect.style.animationDuration = `${duration}s`;
            effect.style.animationDelay = `${delay}s`;
            if (className === 'snowflake') {
                const size = Math.random() * 6 + 4;
                effect.style.width = `${size}px`;
                effect.style.height = `${size}px`;
            }
            weatherOverlay.appendChild(effect);
        }
    }

    // --- Forecast Card Creation (Unchanged) ---
    function getDayName(dateString) {
         const date = new Date(dateString);
         const userTimezoneOffset = date.getTimezoneOffset() * 60000;
         const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
         return adjustedDate.toLocaleDateString('en-US', { weekday: 'short' });
    }

    function createForecastCard(dayData, cityName) {
        const card = document.createElement('div');
        card.dataset.city = cityName;
        card.className = 'forecast-card p-4 rounded-lg shadow backdrop-blur-md bg-white/10 text-white text-center transition transform hover:scale-105 hover:bg-white/20 cursor-pointer';

        const dayName = getDayName(dayData.date);
        const iconCode = dayData.icon || '01d';
        const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;

        card.innerHTML = `
            <div class="pointer-events-none">
                 <p class="font-semibold text-lg">${dayName}</p>
                 <img src="${iconUrl}" alt="${dayData.description}" class="w-12 h-12 mx-auto my-1">
                 <p class="text-xs capitalize mb-1">${dayData.description}</p>
                 <p class="text-sm">
                    <span class="font-bold">H:</span> ${Math.round(dayData.temp_max)}°
                    <span class="font-bold ml-2">L:</span> ${Math.round(dayData.temp_min)}°
                 </p>
             </div>
        `;
        return card;
    }

     // --- Chart.js Update Function (Unchanged) ---
     function updateTemperatureChart(forecastData) {
    if (!tempChartCanvas) return;

    if (!forecastData || forecastData.length === 0) {
        if (weatherChart) { weatherChart.destroy(); weatherChart = null; }
        tempChartCanvas.style.display = 'none';
        return;
    }

    tempChartCanvas.style.display = 'block';

    const labels = forecastData.map(day => {
        const date = new Date(day.date);
        return date.toLocaleDateString('en-US', { weekday: 'short' }); // e.g., Mon, Tue
    });
    const maxTemps = forecastData.map(day => day.temp_max);

    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Max Temperature (°C)', // Chart legend
            data: maxTemps,
            borderColor: '#3b82f6',        // Tailwind blue-500
            backgroundColor: '#93c5fd',    // Tailwind blue-300
            fill: true,
            tension: 0.4,                  // Smooth curve
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#ffffff',
            pointHoverBackgroundColor: '#2563eb',
            pointHoverBorderColor: '#ffffff',
        }]
    };

    const config = {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: 'white',
                        font: { size: 14 }
                    }
                },
            },
            scales: {
                x: {
                    ticks: { color: 'white' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                y: {
                    ticks: { color: 'white' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    };

    if (weatherChart) weatherChart.destroy();
    weatherChart = new Chart(tempChartCanvas, config);
}


    // --- Map Initialization/Update Function (Modified) ---
    function initializeMap(lat, lon, cityName) {
        if (typeof L === 'undefined' || !mapContainer) {
            console.error("Leaflet library not loaded or map container not found.");
            mapErrorEl.textContent = "Map library failed to load.";
            if(mapContainer) mapContainer.style.display = 'none'; return;
        }
        try {
            if (map) { 
                map.setView([lat, lon], 11); 
            }
            else {
                map = L.map(mapContainer, { center: [lat, lon], zoom: 11 });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);
                
                // Add click event handler to the map
                map.on('click', async function(e) {
                    const { lat, lng } = e.latlng;
                    try {
                        showLoading();
                        const locationName = await reverseGeocode(lat, lng);
                        if (locationName) {
                            // Update marker position
                            if (currentMarker) {
                                currentMarker.setLatLng([lat, lng]);
                                currentMarker.setPopupContent(`<b>${locationName}</b>`);
                                currentMarker.openPopup();
                            } else {
                                currentMarker = L.marker([lat, lng])
                                    .addTo(map)
                                    .bindPopup(`<b>${locationName}</b>`)
                                    .openPopup();
                            }
                            // Fetch weather for the clicked location
                            await fetchWeatherData(locationName);
                        }
                    } catch (error) {
                        console.error('Error handling map click:', error);
                        searchError.textContent = 'Failed to get weather for the selected location.';
                        hideLoading(false);
                    }
                });
            }
            const popupContent = `<b>${cityName || 'Selected Location'}</b>`;
            if (currentMarker) { currentMarker.setLatLng([lat, lon]).setPopupContent(popupContent); }
            else { currentMarker = L.marker([lat, lon]).addTo(map).bindPopup(popupContent); }
            currentMarker.openPopup();
            setTimeout(() => { if (map) map.invalidateSize(); }, 200);
        } catch (error) {
            console.error("Leaflet map initialization/update error:", error);
            mapErrorEl.textContent = "Failed to display map.";
            if(mapContainer) mapContainer.style.display = 'none';
            if (map) { map.remove(); map = null; currentMarker = null; }
        }
    }
    
    // Add this new function for reverse geocoding
    async function reverseGeocode(lat, lng) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
            if (!response.ok) throw new Error('Geocoding failed');
            const data = await response.json();
            
            // Extract city name from the response
            const city = data.address.city || 
                        data.address.town || 
                        data.address.village || 
                        data.address.suburb ||
                        data.address.county ||
                        data.address.state;
            
            return city || null;
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            throw error;
        }
    }

    // --- Authentication Status Check (Unchanged) ---
    async function checkInitialAuthStatus() {
        if (typeof AUTH_STATUS_URL === 'undefined') return;
        try {
            const response = await fetch(AUTH_STATUS_URL);
            if (!response.ok) return;
            const data = await response.json();
            console.log("User Auth Status:", data);
        } catch (error) { console.warn('Could not check initial auth status:', error); }
    }

    // --- Event Listener Setup ---
    if (searchButton) {
        searchButton.addEventListener('click', () => {
            const city = searchInput.value.trim();
            if (city) fetchWeatherData(city);
            else searchError.textContent = 'Please enter a city name.';
        });
    }
    if (searchInput) {
        searchInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                const city = searchInput.value.trim();
                if (city) fetchWeatherData(city);
                else searchError.textContent = 'Please enter a city name.';
            }
        });
    }

    // Click handler for navigating to detail page (Unchanged)
    function handleWeatherCardClick(event) {
        const card = event.target.closest('[data-city]');
        if (card && card.dataset.city && typeof DETAIL_PAGE_URL_BASE !== 'undefined') {
            const city = card.dataset.city;
            const detailUrl = DETAIL_PAGE_URL_BASE.replace('CITY_PLACEHOLDER', encodeURIComponent(city));
            window.location.href = detailUrl;
        } else if (!card?.dataset?.city) { console.warn("Clicked card missing 'data-city'."); }
        else if (typeof DETAIL_PAGE_URL_BASE === 'undefined') { console.error("DETAIL_PAGE_URL_BASE not defined."); }
    }

    if (currentWeatherCard) {
        currentWeatherCard.addEventListener('click', handleWeatherCardClick);
    }
    if (forecastCardsContainer) {
        forecastCardsContainer.addEventListener('click', handleWeatherCardClick);
    }

    // --- Initial Page Load Logic ---
    checkInitialAuthStatus();
    if (searchInput) searchInput.value = lastSearchedCity;
    fetchWeatherData(lastSearchedCity);

}); // End DOMContentLoaded