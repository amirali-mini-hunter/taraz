/**
 * Weather Widget integration using Open-Meteo API
 */

// Default coordinates (Tehran)
const DEFAULT_LAT = 35.6892;
const DEFAULT_LON = 51.3890;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache

// Mapping WMO Weather Codes to Persian descriptions & styles
function getWeatherDescription(code, temp) {
  let desc = "صاف";
  let comment = "هوای خوبیه برای قدم زدن!";

  if (code === 0) {
    desc = "صاف و آفتابی";
    comment = temp > 30 ? "گرم است، آب زیاد بنوشید!" : "هوا عالی و صاف است.";
  } else if (code >= 1 && code <= 3) {
    desc = code === 1 ? "عمدتاً صاف" : code === 2 ? "نیمه ابری" : "ابری";
    comment = "امروز آسمان زیبایی داریم.";
  } else if (code === 45 || code === 48) {
    desc = "مه‌آلود";
    comment = "مراقب رانندگی در مه باشید.";
  } else if (code >= 51 && code <= 55) {
    desc = "باران نم‌نم";
    comment = "کمی باران می‌بارد.";
  } else if (code >= 61 && code <= 65) {
    desc = "بارانی";
    comment = "یک فنجان چای داغ در هوای بارانی می‌چسبد!";
  } else if (code >= 71 && code <= 75) {
    desc = "برفی";
    comment = "برف می‌بارد، لباس گرم بپوشید!";
  } else if (code >= 80 && code <= 82) {
    desc = "رگبار باران";
    comment = "چتر همراه خود داشته باشید.";
  } else if (code >= 95 && code <= 99) {
    desc = "رعد و برق";
    comment = "آسمان غرش می‌کند، در خانه بمانید.";
  } else {
    desc = "نیمه ابری";
    comment = "روز خوبی داشته باشید!";
  }

  return { desc, comment };
}

// Return SVG string based on weather code
function getWeatherIconSvg(code) {
  // Clear sky
  if (code === 0) {
    return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#ffb300" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>`;
  }
  // Clouds (1, 2, 3)
  if (code >= 1 && code <= 3) {
    return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#90caf9" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10h-.01c.01-.11.01-.22.01-.33a5.5 5.5 0 0 0-10.74-1.92A4 4 0 0 0 6 15.5h12a3.5 3.5 0 0 0 0-7z"></path>
    </svg>`;
  }
  // Fog (45, 48)
  if (code === 45 || code === 48) {
    return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#b0bec5" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <line x1="5" y1="9" x2="19" y2="9"></line>
      <line x1="3" y1="13" x2="21" y2="13"></line>
      <line x1="7" y1="17" x2="17" y2="17"></line>
    </svg>`;
  }
  // Rain / Drizzle (51-55, 61-65, 80-82)
  if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65) || (code >= 80 && code <= 82)) {
    return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#42a5f5" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="18" x2="12" y2="22"></line>
      <line x1="8" y1="17" x2="8" y2="21"></line>
      <line x1="16" y1="17" x2="16" y2="21"></line>
      <path d="M18 10h-.01c.01-.11.01-.22.01-.33a5.5 5.5 0 0 0-10.74-1.92A4 4 0 0 0 6 15.5h12a3.5 3.5 0 0 0 0-7z"></path>
    </svg>`;
  }
  // Snow (71-75)
  if (code >= 71 && code <= 75) {
    return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#e0f7fa" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="2" x2="12" y2="22"></line>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <line x1="12" y1="12" x2="4" y2="4"></line>
      <line x1="12" y1="12" x2="20" y2="20"></line>
      <line x1="12" y1="12" x2="4" y2="20"></line>
      <line x1="12" y1="12" x2="20" y2="4"></line>
    </svg>`;
  }
  // Thunderstorm (95-99)
  if (code >= 95 && code <= 99) {
    return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#ffeb3b" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 11h-6V3l-7 10h6v8l7-10z"></path>
    </svg>`;
  }
  // General Fallback (Cloudy Sun)
  return `<svg viewBox="0 0 24 24" width="44" height="44" stroke="#ffca28" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v2"></path>
    <path d="M12 20v2"></path>
    <path d="M4.93 4.93l1.41 1.41"></path>
    <path d="M17.66 17.66l1.41 1.41"></path>
    <path d="M2 12h2"></path>
    <path d="M20 12h2"></path>
    <path d="M6.34 17.66l-1.41 1.41"></path>
    <path d="M19.07 4.93l-1.41 1.41"></path>
    <path d="M18.36 12A6 6 0 1 1 12 5.64a6.5 6.5 0 0 1 6.36 6.36z"></path>
  </svg>`;
}

// Fetch weather coordinates from user settings or defaults
async function loadWeather(customCity = null) {
  const tempVal = document.getElementById("weather-temp-val");
  const descText = document.getElementById("weather-desc");
  const cityText = document.getElementById("weather-city");
  const iconContainer = document.getElementById("weather-icon-container");

  // Read storage (handles extension storage and local storage fallbacks)
  let storageData = {};
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    storageData = await new Promise(resolve => {
      chrome.storage.local.get(['weather_cache', 'settings_city'], resolve);
    });
  } else {
    storageData.weather_cache = JSON.parse(localStorage.getItem('weather_cache') || 'null');
    storageData.settings_city = localStorage.getItem('settings_city') || 'تهران';
  }

  const city = customCity || storageData.settings_city || 'تهران';
  cityText.innerText = city;

  // Check cache validity
  const cache = storageData.weather_cache;
  const now = Date.now();
  if (cache && cache.city === city && (now - cache.timestamp < CACHE_DURATION)) {
    // Render from cache
    tempVal.innerText = toPersianDigits(Math.round(cache.temp));
    const info = getWeatherDescription(cache.code, cache.temp);
    descText.innerText = `${info.desc} • ${info.comment}`;
    iconContainer.innerHTML = getWeatherIconSvg(cache.code);
    return;
  }

  // Lat and Lon determination
  let lat = DEFAULT_LAT;
  let lon = DEFAULT_LON;

  // Simple city lookup table for Persian users
  const cityCoordinates = {
    'tehran': { lat: 35.6892, lon: 51.3890 },
    'تهران': { lat: 35.6892, lon: 51.3890 },
    'mashhad': { lat: 36.2972, lon: 59.6067 },
    'مشهد': { lat: 36.2972, lon: 59.6067 },
    'isfahan': { lat: 32.6546, lon: 51.6680 },
    'اصفهان': { lat: 32.6546, lon: 51.6680 },
    'tabriz': { lat: 38.0800, lon: 46.2919 },
    'تبریز': { lat: 38.0800, lon: 46.2919 },
    'shiraz': { lat: 29.5926, lon: 52.5836 },
    'شیراز': { lat: 29.5926, lon: 52.5836 },
    'karaj': { lat: 35.8081, lon: 50.9485 },
    'کرج': { lat: 35.8081, lon: 50.9485 },
    'qom': { lat: 34.6399, lon: 50.8759 },
    'قم': { lat: 34.6399, lon: 50.8759 },
    'ahvaz': { lat: 31.3183, lon: 48.6706 },
    'اهواز': { lat: 31.3183, lon: 48.6706 },
  };

  const cleanCity = city.trim().toLowerCase();
  if (cityCoordinates[cleanCity]) {
    lat = cityCoordinates[cleanCity].lat;
    lon = cityCoordinates[cleanCity].lon;
  } else {
    // If not in static lookup, try using geolocation if permission is granted
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 1500 });
      });
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
      cityText.innerText = "موقعیت فعلی شما";
    } catch (e) {
      // Geolocation failed or denied, default to Tehran coordinates
      lat = DEFAULT_LAT;
      lon = DEFAULT_LON;
    }
  }

  // Fetch weather data from Open-Meteo
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather API error");
    const data = await response.json();
    const current = data.current_weather;
    
    const temp = current.temperature;
    const code = current.weathercode;
    
    // Save to Cache
    const newCache = {
      temp,
      code,
      city,
      timestamp: Date.now()
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ 'weather_cache': newCache });
    } else {
      localStorage.setItem('weather_cache', JSON.stringify(newCache));
    }

    // Render weather details
    tempVal.innerText = toPersianDigits(Math.round(temp));
    const info = getWeatherDescription(code, temp);
    descText.innerText = `${info.desc} • ${info.comment}`;
    iconContainer.innerHTML = getWeatherIconSvg(code);

  } catch (error) {
    // Show error message or reuse old cache if available
    if (cache) {
      tempVal.innerText = toPersianDigits(Math.round(cache.temp));
      const info = getWeatherDescription(cache.code, cache.temp);
      descText.innerText = `${info.desc} • ${info.comment} (بروزرسانی ناموفق)`;
      iconContainer.innerHTML = getWeatherIconSvg(cache.code);
    } else {
      descText.innerText = "بروزرسانی آب و هوا ناموفق بود";
    }
  }
}
