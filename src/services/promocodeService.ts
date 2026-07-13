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
  description: string // e.g. "clear", "rain", "snow"
  temp: number        // Celsius
}

/**
 * Fetch current weather for a given town using the OpenWeather API.
 * Requires the OPENWEATHER_API_KEY environment variable.
 *
 * Returns a description derived from weather[0].main (lowercased) and the
 * temperature in Celsius.
 *
 * Reference: https://openweathermap.org/current
 */
export async function fetchWeather(town: string): Promise<WeatherData> {
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY environment variable is not set')
  }

  const url =
    `https://api.openweathermap.org/data/2.5/weather` +
    `?q=${encodeURIComponent(town)}&appid=${apiKey}&units=metric`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Weather API failed for town "${town}": ${res.statusText}`)
  }

  const data = await res.json() as {
    weather: Array<{ main: string }>
    main: { temp: number }
  }

  return {
    description: data.weather[0].main.toLowerCase(),
    temp: data.main.temp,
  }
}

// ─── Restriction evaluation ───────────────────────────────────────────────────

interface EvaluationContext {
  age: number
  weather?: WeatherData
}


export function evaluateAgeRestriction(
  restriction: LeafAgeRestriction,
  ctx: EvaluationContext
): string[] {
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

export function evaluateDateRestriction(
  restriction: LeafDateRestriction,
  _ctx: EvaluationContext
): string[] {
  const r = restriction.date
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

export function evaluateWeatherRestriction(
  restriction: LeafWeatherRestriction,
  ctx: EvaluationContext
): string[] {
  if (!ctx.weather) {
    return ['Weather data unavailable']
  }
  const r = restriction.weather
  const reasons: string[] = []
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
    return evaluateAgeRestriction(restriction as LeafAgeRestriction, ctx)
  }

  // --- date ---
  if ('date' in restriction) {
    return evaluateDateRestriction(restriction as LeafDateRestriction, ctx)
  }

  // --- weather ---
  if ('weather' in restriction) {
    return evaluateWeatherRestriction(restriction as LeafWeatherRestriction, ctx)
  }

  // --- or ---
  if ('or' in restriction) {
    const { or } = restriction as OrRestriction
    // At least one branch must pass (return no reasons)
    const branchResults = or.map((r) => evaluateRestriction(r, ctx))
    if (branchResults.some((reasons) => reasons.length === 0)) {
      return [] // at least one branch valid
    }
    // All branches failed — return one labeled reason per branch so the caller
    // can distinguish "or" failures from flat "and" failures
    return branchResults.map((reasons, i) =>
      `or branch ${i + 1} failed: ${reasons.join('; ')}`
    )
  }

  // --- and ---
  if ('and' in restriction) {
    const { and } = restriction as AndRestriction
    // All branches must pass
    return and.flatMap((r) => evaluateRestriction(r, ctx));
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
