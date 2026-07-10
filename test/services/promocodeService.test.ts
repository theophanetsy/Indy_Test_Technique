import { test } from 'node:test'
import * as assert from 'node:assert'
import { fetchWeather } from '../../src/services/promocodeService'

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

