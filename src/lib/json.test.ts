import { describe, expect, it } from 'vitest'
import { parseJson } from './json'

const FALLBACK = { fellBack: true } as const

const quoted = {
  question: 'Did NASA say "we are go"?',
  resolution_quote: 'Orion "splashed down" safely',
  yes_pool: 100,
}

const plain = { question: 'Did it rain?', yes_pool: 1 }

describe('parseJson', () => {
  it('decodes a single-encoded payload', () => {
    expect(parseJson(JSON.stringify(plain), FALLBACK)).toEqual(plain)
  })

  it('decodes a double-encoded payload', () => {
    const wire = JSON.stringify(JSON.stringify(plain))
    expect(parseJson(wire, FALLBACK)).toEqual(plain)
  })

  it('keeps double quotes inside a payload', () => {
    // The regression. A verbatim quote lifted from an official page routinely
    // contains a double quote; the old implementation lost the whole payload.
    expect(parseJson(JSON.stringify(quoted), FALLBACK)).toEqual(quoted)
  })

  it('keeps double quotes inside a double-encoded payload', () => {
    const wire = JSON.stringify(JSON.stringify(quoted))
    expect(parseJson(wire, FALLBACK)).toEqual(quoted)
  })

  it('does not lose a whole market list to one quoted market', () => {
    // get_all_markets returns every market in one string, so a single bad
    // market used to empty the entire Explore panel.
    const markets = { a: plain, b: quoted, c: plain }
    const decoded = parseJson<Record<string, unknown>>(
      JSON.stringify(markets),
      {},
    )
    expect(Object.keys(decoded)).toEqual(['a', 'b', 'c'])
    expect(decoded.b).toEqual(quoted)
  })

  it('preserves backslashes and newlines in a quote', () => {
    const gnarly = { resolution_quote: 'line one\nC:\\path "quoted"\ttab' }
    expect(parseJson(JSON.stringify(gnarly), FALLBACK)).toEqual(gnarly)
  })

  it('preserves non-ascii text', () => {
    const unicode = { question: 'Did “Artemis” return? 🚀 déjà vu' }
    expect(parseJson(JSON.stringify(unicode), FALLBACK)).toEqual(unicode)
  })

  it('passes an already-decoded object straight through', () => {
    expect(parseJson(quoted, FALLBACK)).toEqual(quoted)
  })

  it('falls back on malformed input', () => {
    expect(parseJson('{not json', FALLBACK)).toEqual(FALLBACK)
  })

  it('falls back on null and undefined', () => {
    expect(parseJson(null, FALLBACK)).toEqual(FALLBACK)
    expect(parseJson(undefined, FALLBACK)).toEqual(FALLBACK)
  })

  it('falls back rather than returning a bare string as an object', () => {
    // Object.keys('abc') is ['0','1','2'], which would read as a real market.
    expect(parseJson(JSON.stringify('abc'), FALLBACK)).toEqual(FALLBACK)
  })

  it('decodes an empty market map', () => {
    expect(parseJson('{}', FALLBACK)).toEqual({})
  })
})
