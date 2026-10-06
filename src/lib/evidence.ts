// Mirrors the contract's evidence identity (contracts/market.py `_normalize_url`, V8):
// lower case, fragment and query dropped, scheme and a leading `www.` removed,
// trailing slashes removed. The contract is authoritative; this only lets the UI
// show "Recorded as …" and warn about a duplicate before a transaction is sent.
// Golden vectors produced by the contract itself: tests/vectors/evidence-identity.json.

import type { Market } from './genlayer'

// Python str.strip() whitespace (JS trim() differs on U+001C–U+001F, U+0085, U+FEFF).
const PY_WS = new Set([
  '\t', '\n', '\x0b', '\x0c', '\r', '\x1c', '\x1d', '\x1e', '\x1f', ' ', '\x85', '\xa0', ' ',
  ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  ' ', ' ', ' ', ' ', ' ', '　',
])

export function pyStrip(value: string): string {
  const chars = Array.from(value)
  let start = 0
  let end = chars.length
  while (start < end && PY_WS.has(chars[start])) start++
  while (end > start && PY_WS.has(chars[end - 1])) end--
  return chars.slice(start, end).join('')
}

export function canonicalEvidenceUrl(url: string): string {
  let value = pyStrip(url).toLowerCase()
  value = value.split('#')[0].split('?')[0]
  if (value.startsWith('https://')) value = value.slice(8)
  else if (value.startsWith('http://')) value = value.slice(7)
  if (value.startsWith('www.')) value = value.slice(4)
  while (value.endsWith('/')) value = value.slice(0, -1)
  return value
}

export function duplicateOf(url: string, market: Pick<Market, 'evidence'>): string | null {
  const key = canonicalEvidenceUrl(url)
  if (!key) return null
  for (const item of market.evidence ?? []) {
    const existing = item.normalized_url ?? canonicalEvidenceUrl(item.url)
    if (existing === key) return item.url
  }
  return null
}

export function attemptsLeft(market: Pick<Market, 'resolution_attempts'>, maxAttempts: number): number {
  return Math.max(0, maxAttempts - (market.resolution_attempts ?? 0))
}
