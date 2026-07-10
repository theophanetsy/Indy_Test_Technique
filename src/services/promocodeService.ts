import {
  Restriction,
  Promocode,
  LeafAgeRestriction,
  LeafDateRestriction,
  LeafWeatherRestriction,
  OrRestriction,
  AndRestriction,
} from '../types/promocode'

// ─── In-memory store ──────────────────────────────────────────────────────────

const promocodes = new Map<string, Promocode>()

export function addPromocode(promocode: Promocode): Promocode {
  if (promocodes.has(promocode.name)) {
    throw new Error(`Promocode "${promocode.name}" already exists`)
  }
  promocodes.set(promocode.name, promocode)
  return promocode
}

export function getPromocode(name: string): Promocode | undefined {
  return promocodes.get(name)
}

// ─── Weather service ──────────────────────────────────────────────────────────

interface WeatherData {
  description: string // e.g. "clear sky"
  temp: number        // Celsius
}

/**
 * Fetch current weather for a given town using the open-meteo geocoding +
 * weather API (no API key required).
 *
 * Strategy:
 * 1. Geocode the town name → lat/lon
 * 2. Fetch current weather → weather code + temperature
 */
export async function fetchWeather(town: string): Promise<WeatherData> {
  // Step 1 – Geocode
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(town)}&count=1&language=en&format=json`
  const geoRes = await fetch(geoUrl)
  if (!geoRes.ok) {
    throw new Error(`Geocoding failed for town "${town}": ${geoRes.statusText}`)
  }
  const geoData = await geoRes.json() as { results?: Array<{ latitude: number; longitude: number }> }
  if (!geoData.results || geoData.results.length === 0) {
    throw new Error(`Town "${town}" not found`)
  }
  const { latitude, longitude } = geoData.results[0]

  // Step 2 – Weather (WMO weather code + temperature)
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`
  const weatherRes = await fetch(weatherUrl)
  if (!weatherRes.ok) {
    throw new Error(`Weather API failed: ${weatherRes.statusText}`)
  }
  const weatherData = await weatherRes.json() as {
    current: { temperature_2m: number; weather_code: number }
  }

  const { temperature_2m, weather_code } = weatherData.current

  return {
    description: wmoCodeToDescription(weather_code),
    temp: temperature_2m,
  }
}

/**
 * Map a WMO weather code to a simplified description.
 * Reference: https://open-meteo.com/en/docs#weathervariables
 */
function wmoCodeToDescription(code: number): string {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code <= 49) return 'foggy'
  if (code <= 57) return 'drizzle'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'showers'
  if (code <= 86) return 'snow showers'
  if (code <= 99) return 'thunderstorm'
  return 'unknown'
}

// ─── Restriction evaluation ───────────────────────────────────────────────────

interface EvaluationContext {
  age: number
  weather?: WeatherData
}

/**
 * Evaluate a single restriction node.
 * Returns an array of failure reasons (empty = success).
 */
function evaluateRestriction(
  restriction: Restriction,
  ctx: EvaluationContext
): string[] {
  // --- age ---
  if ('age' in restriction) {
    const r = (restriction as LeafAgeRestriction).age
    const reasons: string[] = []
    if (r.eq !== undefined && ctx.age !== r.eq) {
      reasons.push(`Age must be exactly ${r.eq} (got ${ctx.age})`)
    }
    if (r.lt !== undefined && ctx.age >= r.lt) {
      reasons.push(`Age must be less than ${r.lt} (got ${ctx.age})`)
    }
    if (r.gt !== undefined && ctx.age <= r.gt) {
      reasons.push(`Age must be greater than ${r.gt} (got ${ctx.age})`)
    }
    return reasons
  }

  // --- date ---
  if ('date' in restriction) {
    const r = (restriction as LeafDateRestriction).date
    const now = new Date()
    const reasons: string[] = []
    if (r.after !== undefined && now < new Date(r.after)) {
      reasons.push(`Promocode is not yet valid (valid from ${r.after})`)
    }
    if (r.before !== undefined && now > new Date(r.before)) {
      reasons.push(`Promocode has expired (was valid until ${r.before})`)
    }
    return reasons
  }

  // --- weather ---
  if ('weather' in restriction) {
    const r = (restriction as LeafWeatherRestriction).weather
    const reasons: string[] = []
    if (!ctx.weather) {
      return ['Weather data unavailable']
    }
    if (r.is !== undefined && ctx.weather.description !== r.is) {
      reasons.push(`Weather must be "${r.is}" (got "${ctx.weather.description}")`)
    }
    if (r.temp !== undefined) {
      if (r.temp.gt !== undefined && ctx.weather.temp <= r.temp.gt) {
        reasons.push(`Temperature must be > ${r.temp.gt}°C (got ${ctx.weather.temp}°C)`)
      }
      if (r.temp.lt !== undefined && ctx.weather.temp >= r.temp.lt) {
        reasons.push(`Temperature must be < ${r.temp.lt}°C (got ${ctx.weather.temp}°C)`)
      }
    }
    return reasons
  }

  // --- or ---
  if ('or' in restriction) {
    const { or } = restriction as OrRestriction
    // At least one branch must pass (return no reasons)
    const branchResults = or.map((r) => evaluateRestriction(r, ctx))
    if (branchResults.some((reasons) => reasons.length === 0)) {
      return [] // at least one branch valid
    }
    // All branches failed — collect all reasons
    return branchResults.flat()
  }

  // --- and ---
  if ('and' in restriction) {
    const { and } = restriction as AndRestriction
    // All branches must pass
    return and.flatMap((r) => evaluateRestriction(r, ctx))
  }

  return [`Unknown restriction type: ${JSON.stringify(restriction)}`]
}

// ─── Public validate function ─────────────────────────────────────────────────

export async function validatePromocode(
  promocode: Promocode,
  args: { age: number; town: string }
): Promise<{ valid: boolean; reasons?: string[] }> {
  // Fetch weather once if any restriction might need it
  let weather: WeatherData | undefined
  const needsWeather = restrictionsNeedWeather(promocode.restrictions)
  if (needsWeather) {
    weather = await fetchWeather(args.town)
  }

  const ctx: EvaluationContext = { age: args.age, weather }

  const allReasons = promocode.restrictions.flatMap((r) =>
    evaluateRestriction(r, ctx)
  )

  if (allReasons.length === 0) {
    return { valid: true }
  }
  return { valid: false, reasons: allReasons }
}

/** Recursively check if any restriction in the tree needs weather data */
function restrictionsNeedWeather(restrictions: Restriction[]): boolean {
  return restrictions.some((r) => {
    if ('weather' in r) return true
    if ('or' in r) return restrictionsNeedWeather((r as OrRestriction).or)
    if ('and' in r) return restrictionsNeedWeather((r as AndRestriction).and)
    return false
  })
}
