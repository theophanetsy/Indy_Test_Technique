// ─── Advantage ───────────────────────────────────────────────────────────────

export interface Advantage {
  percent: number
}

// ─── Restriction rules (recursive tree) ──────────────────────────────────────

export interface AgeRestriction {
  eq?: number
  lt?: number
  gt?: number
}

export interface DateRestriction {
  after?: string  // ISO date string, e.g. "2019-01-01"
  before?: string // ISO date string, e.g. "2020-06-30"
}

export interface WeatherRestriction {
  is?: string               // e.g. "clear"
  temp?: { gt?: number; lt?: number }
}

export interface OrRestriction {
  or: Restriction[]
}

export interface AndRestriction {
  and: Restriction[]
}

export interface LeafAgeRestriction {
  age: AgeRestriction
}

export interface LeafDateRestriction {
  date: DateRestriction
}

export interface LeafWeatherRestriction {
  weather: WeatherRestriction
}

/**
 * A restriction node in the tree. Each node is one of:
 * - { age: AgeRestriction }
 * - { date: DateRestriction }
 * - { weather: WeatherRestriction }
 * - { or: Restriction[] }
 * - { and: Restriction[] }
 */
export type Restriction =
  | LeafAgeRestriction
  | LeafDateRestriction
  | LeafWeatherRestriction
  | OrRestriction
  | AndRestriction

// ─── Promocode model ──────────────────────────────────────────────────────────

export interface Promocode {
  name: string
  advantage: Advantage
  restrictions: Restriction[]
}

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface CreatePromocodeBody {
  name: string
  advantage: Advantage
  restrictions: Restriction[]
}

export interface ApplyPromocodeBody {
  promocode_name: string
  arguments: {
    age: number
    town: string
  }
}

// ─── Validation result ────────────────────────────────────────────────────────

export type ValidationResult =
  | { valid: true; advantage: Advantage }
  | { valid: false; reasons: string[] }
