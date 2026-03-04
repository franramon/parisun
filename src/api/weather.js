const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';

// Paris coordinates
const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;

/**
 * Fetch weather forecast for Paris
 * @returns {Promise<Object>} - Weather data with hourly forecast
 */
export async function fetchWeatherForecast() {
  try {
    const url = `${WEATHER_API_URL}?latitude=${PARIS_LAT}&longitude=${PARIS_LNG}&hourly=temperature_2m,weather_code,cloud_cover&timezone=Europe/Paris&forecast_days=7`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('✓ Weather data loaded');
    return data;

  } catch (error) {
    console.error('Error fetching weather:', error);
    throw error;
  }
}

/**
 * Get weather info for a specific date and hour
 * @param {Object} weatherData - Full weather data from API
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {number} hour - Hour (0-23)
 * @returns {Object|null} - Weather info or null if not found
 */
export function getWeatherForTime(weatherData, dateStr, hour) {
  if (!weatherData || !weatherData.hourly) return null;

  const targetDateTime = `${dateStr}T${String(hour).padStart(2, '0')}:00`;
  const index = weatherData.hourly.time.findIndex(t => t.startsWith(targetDateTime));

  if (index === -1) return null;

  const temperature = weatherData.hourly.temperature_2m[index];
  const weatherCode = weatherData.hourly.weather_code[index];
  const cloudCover = weatherData.hourly.cloud_cover[index];

  const weatherInfo = getWeatherInfo(weatherCode);

  // Calculate weather factor for sun score
  let weatherFactor;
  if (weatherInfo.sunny) {
    // Clear to partly cloudy: 0.5 to 1.0
    weatherFactor = 1.0 - (cloudCover / 200);
  } else {
    // Cloudy/rainy: 0.1 to 0.5
    weatherFactor = Math.max(0.1, 0.5 - (cloudCover / 200));
  }

  return {
    temperature,
    weatherCode,
    cloudCover,
    icon: weatherInfo.icon,
    label: weatherInfo.label,
    sunny: weatherInfo.sunny,
    weatherFactor
  };
}

/**
 * Convert WMO weather code to icon and label
 * @param {number} code - WMO weather code
 * @returns {Object} - Icon, label, and sunny flag
 */
function getWeatherInfo(code) {
  // WMO Weather interpretation codes
  // https://open-meteo.com/en/docs
  if (code === 0) return { icon: '☀️', label: 'Ensoleillé', sunny: true };
  if (code <= 3) return { icon: '🌤️', label: 'Peu nuageux', sunny: true };
  if (code <= 48) return { icon: '☁️', label: 'Nuageux', sunny: false };
  if (code <= 67) return { icon: '🌧️', label: 'Pluvieux', sunny: false };
  if (code <= 77) return { icon: '🌨️', label: 'Neige', sunny: false };
  if (code <= 82) return { icon: '🌦️', label: 'Averses', sunny: false };
  if (code <= 99) return { icon: '⛈️', label: 'Orage', sunny: false };
  return { icon: '☁️', label: 'Variable', sunny: false };
}
