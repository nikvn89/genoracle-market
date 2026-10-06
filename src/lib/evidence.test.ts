import { describe, expect, it } from 'vitest'
import vectors from '../../tests/vectors/evidence-identity.json'
import { attemptsLeft, canonicalEvidenceUrl, duplicateOf } from './evidence'

describe('canonicalEvidenceUrl matches the contract', () => {
  for (const row of vectors.cases as { url: string; recorded_as: string }[]) {
    it(JSON.stringify(row.url), () => {
      expect(canonicalEvidenceUrl(row.url)).toBe(row.recorded_as)
    })
  }
})

describe('duplicate warning', () => {
  const market = {
    evidence: [{ url: 'https://nasa.gov/report', normalized_url: 'nasa.gov/report', submitter: '0x1', submitted_at: 0 }],
  }
  it('flags the www, query, fragment and case variants of a submitted page', () => {
    for (const v of ['https://www.nasa.gov/report', 'https://nasa.gov/report?v=2', 'https://NASA.gov/report/#x']) {
      expect(duplicateOf(v, market)).toBe('https://nasa.gov/report')
    }
  })
  it('lets a different page through', () => {
    expect(duplicateOf('https://nasa.gov/report-2', market)).toBeNull()
    expect(duplicateOf('   ', market)).toBeNull()
  })
})

describe('attempt budget', () => {
  it('counts down to zero and never below', () => {
    expect(attemptsLeft({ resolution_attempts: 0 }, 3)).toBe(3)
    expect(attemptsLeft({ resolution_attempts: 2 }, 3)).toBe(1)
    expect(attemptsLeft({ resolution_attempts: 5 }, 3)).toBe(0)
  })
})
