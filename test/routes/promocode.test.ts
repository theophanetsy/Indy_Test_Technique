import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../helper'
import * as promocodeService from '../../src/services/promocodeService'

// Ensure the API key env var is set for all tests (fetch is mocked, key value doesn't matter)
process.env.OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'test-key'


// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Unique name generator — avoids conflicts with the shared in-memory store */
let seq = 0
const uid = (prefix = 'P') => `${prefix}_${++seq}`

async function createPromocode(app: Awaited<ReturnType<typeof build>>, body: object) {
  return app.inject({ method: 'POST', url: '/api/promocode', payload: body })
}

async function applyPromocode(app: Awaited<ReturnType<typeof build>>, body: object) {
  return app.inject({ method: 'POST', url: '/api/promocode/apply', payload: body })
}

/**
 * Returns a fetch mock simulating an OpenWeather API response.
 * weatherMain should match OpenWeather's `weather[0].main` (e.g. "Clear", "Rain").
 * The service calls .toLowerCase() on it, so "Clear" → "clear".
 */
function mockWeatherFetch(weatherMain: string, temp: number): typeof globalThis.fetch {
  return async () => {
    return new Response(JSON.stringify({
      weather: [{ main: weatherMain }],
      main: { temp },
    }))
  }
}

// ─── POST /api/promocode ──────────────────────────────────────────────────────

test('POST /api/promocode — 201: creates a promocode and returns it', async (t) => {
  const app = await build(t)
  const name = uid()

  const res = await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [],
  })

  assert.strictEqual(res.statusCode, 201)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.name, name)
  assert.deepStrictEqual(body.advantage, { percent: 20 })
})

test('POST /api/promocode — 409: duplicate name returns conflict with message', async (t) => {
  const app = await build(t)
  const name = uid()

  await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [] })
  const res = await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [] })

  assert.strictEqual(res.statusCode, 409)
  assert.ok(JSON.parse(res.payload).message, 'expected a message property')
})

test('POST /api/promocode — 400: missing required field "name"', async (t) => {
  const app = await build(t)
  const res = await createPromocode(app, { advantage: { percent: 10 }, restrictions: [] })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /api/promocode — 400: missing required field "advantage"', async (t) => {
  const app = await build(t)
  const res = await createPromocode(app, { name: uid(), restrictions: [] })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /api/promocode — 400: percent above maximum (> 100)', async (t) => {
  const app = await build(t)
  const res = await createPromocode(app, { name: uid(), advantage: { percent: 101 }, restrictions: [] })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /api/promocode — 400: percent below minimum (< 0)', async (t) => {
  const app = await build(t)
  const res = await createPromocode(app, { name: uid(), advantage: { percent: -1 }, restrictions: [] })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /api/promocode — 500: internal server error', async (t) => {
  const app = await build(t)

  t.mock.method(promocodeService, 'addPromocode', () => {
    throw new Error('Database connection failed')
  })

  const res = await createPromocode(app, {
    name: 'AnyName',
    advantage: { percent: 10 },
    restrictions: [],
  })
  assert.strictEqual(res.statusCode, 500)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.message, 'Database connection failed')
})

// ─── POST /api/promocode/apply — validation errors ────────────────────────────

test('POST /api/promocode/apply — 404: unknown promocode name', async (t) => {
  const app = await build(t)
  const res = await applyPromocode(app, {
    promocode_name: `DOES_NOT_EXIST_${Date.now()}`,
    arguments: { age: 25, town: 'Paris' },
  })
  assert.strictEqual(res.statusCode, 404)
})

test('POST /api/promocode/apply — 400: missing "arguments" field', async (t) => {
  const app = await build(t)
  const res = await applyPromocode(app, { promocode_name: 'X' })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /api/promocode/apply — 400: negative age is rejected by schema', async (t) => {
  const app = await build(t)
  const res = await applyPromocode(app, {
    promocode_name: 'X',
    arguments: { age: -1, town: 'Paris' },
  })
  assert.strictEqual(res.statusCode, 400)
})

// ─── POST /api/promocode/apply — no restrictions ──────────────────────────────

test('POST /api/promocode/apply — accepted: no restrictions always passes', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 5 }, restrictions: [] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), {
    promocode_name: name,
    status: 'accepted',
    advantage: { percent: 5 },
  })
})

// ─── POST /api/promocode/apply — age restrictions ─────────────────────────────

test('POST /api/promocode/apply — accepted: age.gt passes (25 > 18)', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 15 }, restrictions: [{ age: { gt: 18 } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), {
    promocode_name: name,
    status: 'accepted',
    advantage: { percent: 15 },
  })
})

test('POST /api/promocode/apply — denied: age.gt fails (15 is not > 18)', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 15 }, restrictions: [{ age: { gt: 18 } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 15, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(Array.isArray(body.reasons) && body.reasons.length > 0)
  assert.ok(body.reasons[0].includes('greater than 18'))
})

test('POST /api/promocode/apply — accepted: age.eq passes (40 === 40)', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [{ age: { eq: 40 } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 40, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — denied: age.eq fails (41 !== 40)', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [{ age: { eq: 40 } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 41, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons[0].includes('exactly 40'))
})

test('POST /api/promocode/apply — accepted: age.lt passes (20 < 30)', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [{ age: { lt: 30 } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 20, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — denied: age.lt fails (35 is not < 30)', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [{ age: { lt: 30 } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 35, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons[0].includes('less than 30'))
})

// ─── POST /api/promocode/apply — date restrictions ────────────────────────────

test('POST /api/promocode/apply — accepted: today is within the valid date range', async (t) => {
  const app = await build(t)
  const name = uid()
  const past = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  await createPromocode(app, { name, advantage: { percent: 10 }, restrictions: [{ date: { after: past, before: future } }] })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — denied: date restriction is expired', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ date: { after: '2019-01-01', before: '2019-12-31' } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons.some((r: string) => r.includes('expired')))
})

test('POST /api/promocode/apply — denied: date restriction has not started yet', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ date: { after: '2099-01-01', before: '2099-12-31' } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons.some((r: string) => r.includes('not yet valid')))
})

// ─── POST /api/promocode/apply — or restrictions ──────────────────────────────

test('POST /api/promocode/apply — accepted: or passes when first branch matches', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ or: [{ age: { eq: 40 } }, { age: { lt: 20 } }] }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 40, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — accepted: or passes when second branch matches', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ or: [{ age: { eq: 40 } }, { age: { lt: 20 } }] }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 15, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — denied: or fails when all branches fail', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ or: [{ age: { eq: 40 } }, { age: { lt: 20 } }] }],
  })

  // age 25: not 40, not < 20 → both branches fail
  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  // Each failed branch gets its own labeled reason so the caller can tell it's an "or" failure
  assert.ok(body.reasons.every((r: string) => r.startsWith('or branch')))
  assert.strictEqual(body.reasons.length, 2) // one reason per branch
})

// ─── POST /api/promocode/apply — and restrictions ─────────────────────────────

test('POST /api/promocode/apply — accepted: and passes when all branches match', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ and: [{ age: { gt: 18 } }, { age: { lt: 40 } }] }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — denied: and fails when one branch fails', async (t) => {
  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 10 },
    restrictions: [{ and: [{ age: { gt: 18 } }, { age: { lt: 40 } }] }],
  })

  // age 45: > 18 ✓ but not < 40 ✗
  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 45, town: 'Paris' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(Array.isArray(body.reasons) && body.reasons.length > 0)
})

// ─── POST /api/promocode/apply — weather restrictions ────────────────────────

test('POST /api/promocode/apply — accepted: weather condition and temperature match', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Clear', 25) // Clear sky, 25°C
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [{ weather: { is: 'clear', temp: { gt: 15 } } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(JSON.parse(res.payload).status, 'accepted')
})

test('POST /api/promocode/apply — denied: weather description does not match', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Rain', 25) // Rain (code 61), 25°C
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [{ weather: { is: 'clear' } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons.some((r: string) => r.includes('"clear"')))
})

test('POST /api/promocode/apply — denied: temperature below temp.gt threshold', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Clear', 10) // Clear sky, 10°C
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [{ weather: { temp: { gt: 15 } } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons.some((r: string) => r.includes('> 15')))
})

test('POST /api/promocode/apply — denied: temperature above temp.lt threshold', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Clear', 35) // Clear sky, 35°C
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [{ weather: { temp: { lt: 30 } } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(body.reasons.some((r: string) => r.includes('< 30')))
})

test('POST /api/promocode/apply — 500: weather service is unreachable', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Network error') }
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid()
  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [{ weather: { is: 'clear' } }],
  })

  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 25, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 500)
  assert.ok(JSON.parse(res.payload).message)
})

// ─── POST /api/promocode/apply — complex spec example ────────────────────────

test('POST /api/promocode/apply — accepted: spec example (date + or[age=40 / and[age+weather]])', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Clear', 20) // Clear sky, 20°C
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid('WeatherCode')
  const past = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [
      { date: { after: past, before: future } },
      {
        or: [
          { age: { eq: 40 } },
          { and: [{ age: { lt: 30, gt: 15 } }, { weather: { is: 'clear', temp: { gt: 15 } } }] },
        ],
      },
    ],
  })

  // age=20 (15 < 20 < 30), clear sky, 20°C > 15 → 2nd or branch passes
  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 20, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), {
    promocode_name: name,
    status: 'accepted',
    advantage: { percent: 20 },
  })
})

test('POST /api/promocode/apply — denied: spec example with wrong age and bad weather', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockWeatherFetch('Rain', 10) // Rain, 10°C
  t.after(() => { globalThis.fetch = originalFetch })

  const app = await build(t)
  const name = uid('WeatherCode')
  const past = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  await createPromocode(app, {
    name,
    advantage: { percent: 20 },
    restrictions: [
      { date: { after: past, before: future } },
      {
        or: [
          { age: { eq: 40 } },
          { and: [{ age: { lt: 30, gt: 15 } }, { weather: { is: 'clear', temp: { gt: 15 } } }] },
        ],
      },
    ],
  })

  // age=20, rain 10°C → neither or branch passes
  const res = await applyPromocode(app, { promocode_name: name, arguments: { age: 20, town: 'Lyon' } })

  assert.strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.payload)
  assert.strictEqual(body.status, 'denied')
  assert.ok(Array.isArray(body.reasons) && body.reasons.length > 0)
})
