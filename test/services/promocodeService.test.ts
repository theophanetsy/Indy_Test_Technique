import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  fetchWeather,
  evaluateAgeRestriction,
  evaluateDateRestriction,
  evaluateWeatherRestriction,
  evaluateOrRestriction,
  evaluateAndRestriction,
} from '../../src/services/promocodeService'

// Ensure the API key env var is set for all tests (fetch is mocked, key value doesn't matter)
process.env.OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'test-key'

// ─── Mock helper ──────────────────────────────────────────────────────────────

/** Builds a fetch mock returning an OpenWeather-shaped response. */
function mockWeatherFetch(weatherMain: string, temp: number): typeof globalThis.fetch {
  return async () => new Response(JSON.stringify({
    weather: [{ main: weatherMain }],
    main: { temp },
  }))
}

// ─── fetchWeather — description mapping (weather[0].main lowercased) ──────────

const OPENWEATHER_CASES: Array<{ main: string; description: string }> = [
  { main: 'Clear',        description: 'clear' },
  { main: 'Clouds',       description: 'clouds' },
  { main: 'Rain',         description: 'rain' },
  { main: 'Drizzle',      description: 'drizzle' },
  { main: 'Thunderstorm', description: 'thunderstorm' },
  { main: 'Snow',         description: 'snow' },
  { main: 'Mist',         description: 'mist' },
  { main: 'Fog',          description: 'fog' },
  { main: 'Haze',         description: 'haze' },
]

for (const { main, description } of OPENWEATHER_CASES) {
  test(`fetchWeather — OpenWeather "${main}" maps to "${description}"`, async (t) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockWeatherFetch(main, 20)
    t.after(() => { globalThis.fetch = originalFetch })

    const result = await fetchWeather('Paris')

    assert.strictEqual(result.description, description)
    assert.strictEqual(result.temp, 20)
  })
}

// ─── fetchWeather — temperature is forwarded as-is ───────────────────────────

test('fetchWeather — returns the exact temperature from the API', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Clear', 14.7)
  t.after(() => { globalThis.fetch = originalFetch })

  const result = await fetchWeather('Lyon')

  assert.strictEqual(result.temp, 14.7)
})

// ─── fetchWeather — error paths ───────────────────────────────────────────────

test('fetchWeather — throws when the API returns an HTTP error (e.g. 401 bad key)', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
  t.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(
    () => fetchWeather('Paris'),
    (err: Error) => {
      assert.ok(err.message.includes('Weather API failed'), `unexpected message: ${err.message}`)
      return true
    }
  )
})

test('fetchWeather — throws when the city is not found (404)', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(
    JSON.stringify({ cod: '404', message: 'city not found' }),
    { status: 404, statusText: 'Not Found' }
  )
  t.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(
    () => fetchWeather('NowhereVille'),
    (err: Error) => {
      assert.ok(err.message.includes('Weather API failed'), `unexpected message: ${err.message}`)
      return true
    }
  )
})

test('fetchWeather — throws when the network is unreachable', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Network error') }
  t.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(() => fetchWeather('Lyon'))
})

test('fetchWeather — throws when OPENWEATHER_API_KEY is not set', async (t) => {
  const originalKey = process.env.OPENWEATHER_API_KEY
  process.env.OPENWEATHER_API_KEY = ''
  t.after(() => { process.env.OPENWEATHER_API_KEY = originalKey })

  await assert.rejects(
    () => fetchWeather('Paris'),
    (err: Error) => {
      assert.ok(err.message.includes('OPENWEATHER_API_KEY'), `unexpected message: ${err.message}`)
      return true
    }
  )
})

// ─── evaluateAgeRestriction ───────────────────────────────────────────────────

test('evaluateAgeRestriction — passes when age equals eq', () => {
  const reasons = evaluateAgeRestriction({ age: { eq: 40 } }, { age: 40 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateAgeRestriction — fails when age differs from eq', () => {
  const reasons = evaluateAgeRestriction({ age: { eq: 40 } }, { age: 41 })
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('exactly 40'))
})

test('evaluateAgeRestriction — passes when age is strictly greater than gt', () => {
  const reasons = evaluateAgeRestriction({ age: { gt: 18 } }, { age: 19 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateAgeRestriction — fails when age equals gt (boundary: must be strictly greater)', () => {
  const reasons = evaluateAgeRestriction({ age: { gt: 18 } }, { age: 18 })
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('greater than 18'))
})

test('evaluateAgeRestriction — fails when age is below gt', () => {
  const reasons = evaluateAgeRestriction({ age: { gt: 18 } }, { age: 10 })
  assert.strictEqual(reasons.length, 1)
})

test('evaluateAgeRestriction — passes when age is strictly less than lt', () => {
  const reasons = evaluateAgeRestriction({ age: { lt: 30 } }, { age: 29 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateAgeRestriction — fails when age equals lt (boundary: must be strictly less)', () => {
  const reasons = evaluateAgeRestriction({ age: { lt: 30 } }, { age: 30 })
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('less than 30'))
})

test('evaluateAgeRestriction — fails when age is above lt', () => {
  const reasons = evaluateAgeRestriction({ age: { lt: 30 } }, { age: 35 })
  assert.strictEqual(reasons.length, 1)
})

test('evaluateAgeRestriction — passes with combined gt+lt when age is in range', () => {
  // spec example: age > 15 AND age < 30
  const reasons = evaluateAgeRestriction({ age: { gt: 15, lt: 30 } }, { age: 20 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateAgeRestriction — fails both gt and lt when age is out of range on both ends', () => {
  // Age 15 is not > 15 (gt fails) and not a lt issue
  const reasons = evaluateAgeRestriction({ age: { gt: 15, lt: 30 } }, { age: 15 })
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('greater than 15'))
})

test('evaluateAgeRestriction — returns empty reasons when age object has no constraints', () => {
  const reasons = evaluateAgeRestriction({ age: {} }, { age: 99 })
  assert.deepStrictEqual(reasons, [])
})

// ─── evaluateDateRestriction ──────────────────────────────────────────────────

test('evaluateDateRestriction — passes when today is within after/before range', () => {
  const past   = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0]
  const future = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]
  const reasons = evaluateDateRestriction({ date: { after: past, before: future } }, { age: 0 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateDateRestriction — fails when today is before "after" date', () => {
  const reasons = evaluateDateRestriction({ date: { after: '2099-01-01' } }, { age: 0 })
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('not yet valid'))
})

test('evaluateDateRestriction — fails when today is after "before" date', () => {
  const reasons = evaluateDateRestriction({ date: { before: '2019-12-31' } }, { age: 0 })
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('expired'))
})

test('evaluateDateRestriction — passes with only "after" when today is past that date', () => {
  const reasons = evaluateDateRestriction({ date: { after: '2000-01-01' } }, { age: 0 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateDateRestriction — passes with only "before" when today is before that date', () => {
  const reasons = evaluateDateRestriction({ date: { before: '2099-12-31' } }, { age: 0 })
  assert.deepStrictEqual(reasons, [])
})

test('evaluateDateRestriction — collects two reasons when both after and before fail', () => {
  // after in the future AND before in the past → both constraints violated
  const reasons = evaluateDateRestriction(
    { date: { after: '2099-01-01', before: '2019-12-31' } },
    { age: 0 }
  )
  assert.strictEqual(reasons.length, 2)
})

test('evaluateDateRestriction — passes when date object has no constraints', () => {
  const reasons = evaluateDateRestriction({ date: {} }, { age: 0 })
  assert.deepStrictEqual(reasons, [])
})

// ─── evaluateWeatherRestriction ───────────────────────────────────────────────

test('evaluateWeatherRestriction — returns "Weather data unavailable" when ctx.weather is absent', () => {
  const reasons = evaluateWeatherRestriction({ weather: { is: 'clear' } }, { age: 0 })
  assert.deepStrictEqual(reasons, ['Weather data unavailable'])
})

test('evaluateWeatherRestriction — passes when description matches "is"', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { is: 'clear' } },
    { age: 0, weather: { description: 'clear', temp: 20 } }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateWeatherRestriction — fails when description does not match "is"', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { is: 'clear' } },
    { age: 0, weather: { description: 'rain', temp: 20 } }
  )
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('"clear"') && reasons[0].includes('"rain"'))
})

test('evaluateWeatherRestriction — passes when temp is strictly above temp.gt', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { temp: { gt: 15 } } },
    { age: 0, weather: { description: 'clear', temp: 20 } }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateWeatherRestriction — fails when temp equals temp.gt (boundary: must be strictly greater)', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { temp: { gt: 15 } } },
    { age: 0, weather: { description: 'clear', temp: 15 } }
  )
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('> 15'))
})

test('evaluateWeatherRestriction — fails when temp is below temp.gt', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { temp: { gt: 15 } } },
    { age: 0, weather: { description: 'clear', temp: 10 } }
  )
  assert.strictEqual(reasons.length, 1)
})

test('evaluateWeatherRestriction — passes when temp is strictly below temp.lt', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { temp: { lt: 30 } } },
    { age: 0, weather: { description: 'clear', temp: 25 } }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateWeatherRestriction — fails when temp equals temp.lt (boundary: must be strictly less)', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { temp: { lt: 30 } } },
    { age: 0, weather: { description: 'clear', temp: 30 } }
  )
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('< 30'))
})

test('evaluateWeatherRestriction — fails when temp is above temp.lt', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { temp: { lt: 30 } } },
    { age: 0, weather: { description: 'clear', temp: 35 } }
  )
  assert.strictEqual(reasons.length, 1)
})

test('evaluateWeatherRestriction — passes with both "is" and "temp" matching', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { is: 'clear', temp: { gt: 15, lt: 35 } } },
    { age: 0, weather: { description: 'clear', temp: 25 } }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateWeatherRestriction — collects two reasons when both "is" and "temp.gt" fail', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: { is: 'clear', temp: { gt: 15 } } },
    { age: 0, weather: { description: 'rain', temp: 10 } }
  )
  assert.strictEqual(reasons.length, 2)
})

test('evaluateWeatherRestriction — passes when restriction has no "is" or "temp"', () => {
  const reasons = evaluateWeatherRestriction(
    { weather: {} },
    { age: 0, weather: { description: 'fog', temp: 5 } }
  )
  assert.deepStrictEqual(reasons, [])
})

// ─── evaluateOrRestriction ────────────────────────────────────────────────────

test('evaluateOrRestriction — passes when the first branch matches', () => {
  const reasons = evaluateOrRestriction(
    { or: [{ age: { eq: 40 } }, { age: { lt: 20 } }] },
    { age: 40 }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateOrRestriction — passes when the second branch matches', () => {
  const reasons = evaluateOrRestriction(
    { or: [{ age: { eq: 40 } }, { age: { lt: 20 } }] },
    { age: 15 }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateOrRestriction — fails with one labeled reason per branch when all branches fail', () => {
  // age 25: not eq 40, not < 20 → both branches fail
  const reasons = evaluateOrRestriction(
    { or: [{ age: { eq: 40 } }, { age: { lt: 20 } }] },
    { age: 25 }
  )
  assert.strictEqual(reasons.length, 2)
  assert.ok(reasons.every((r) => r.startsWith('or branch')))
  assert.ok(reasons[0].includes('or branch 1 failed'))
  assert.ok(reasons[1].includes('or branch 2 failed'))
})

// ─── evaluateAndRestriction ───────────────────────────────────────────────────

test('evaluateAndRestriction — passes when all branches match', () => {
  const reasons = evaluateAndRestriction(
    { and: [{ age: { gt: 18 } }, { age: { lt: 40 } }] },
    { age: 25 }
  )
  assert.deepStrictEqual(reasons, [])
})

test('evaluateAndRestriction — fails and collects reasons from every failing branch', () => {
  // age 45: > 18 ✓ but not < 40 ✗
  const reasons = evaluateAndRestriction(
    { and: [{ age: { gt: 18 } }, { age: { lt: 40 } }] },
    { age: 45 }
  )
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].includes('less than 40'))
})

test('evaluateAndRestriction — collects reasons from multiple failing branches', () => {
  // age 10: not > 18 AND not < 9 (impossible constraint to show multi-fail)
  const reasons = evaluateAndRestriction(
    { and: [{ age: { gt: 18 } }, { age: { gt: 20 } }] },
    { age: 10 }
  )
  assert.strictEqual(reasons.length, 2)
})

// ─── evaluateRestriction — unknown restriction type (fallback) ────────────────

test('evaluateOrRestriction — unknown restriction type in branch returns labeled fallback message', () => {
  // Inject an unrecognised restriction shape inside an `or` so that the
  // private evaluateRestriction hits its final fallback return on line 178-180.
  // We cast to `any` because TypeScript would otherwise reject the shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unknown = { unknownKey: 'boom' } as any
  const reasons = evaluateOrRestriction(
    { or: [unknown] },
    { age: 0 }
  )
  // The branch fails (unknown → 1 reason) so or returns a labeled message
  assert.strictEqual(reasons.length, 1)
  assert.ok(reasons[0].startsWith('or branch 1 failed'))
  assert.ok(reasons[0].includes('Unknown restriction type'))
})
