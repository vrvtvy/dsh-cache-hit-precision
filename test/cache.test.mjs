import test from 'node:test'
import assert from 'node:assert/strict'
import { cacheHitPercent, formatCacheHitPercent, billedInputTokens } from '../index.js'

test('returns a three-decimal cache-hit percentage', () => {
  const usage = { uncachedInputTokens: 1000, cacheReadTokens: 123, cacheWriteTokens: 0 }
  assert.equal(cacheHitPercent(usage), (123 / 1123 * 100).toFixed(3))
})

test('counts cache-write tokens in the denominator exactly as DSH does', () => {
  const usage = { uncachedInputTokens: 100, cacheReadTokens: 100, cacheWriteTokens: 800 }
  assert.equal(cacheHitPercent(usage), '10.000')
})

test('returns null when no prompt input was billed', () => {
  assert.equal(cacheHitPercent(null), null)
  assert.equal(cacheHitPercent({}), null)
  assert.equal(cacheHitPercent({ uncachedInputTokens: 0, cacheReadTokens: 0 }), null)
})

test('a full hit reads as 100 at every precision', () => {
  const usage = { uncachedInputTokens: 0, cacheReadTokens: 9995, cacheWriteTokens: 0 }
  assert.equal(cacheHitPercent(usage), '100.000')
  assert.equal(cacheHitPercent(usage, 0), '100')
})

test('never rounds a partial hit up to a full one', () => {
  // 999949/1000000 rounds to 99.995 at three places, which is still below 100,
  // so the ordinary precision holds.
  assert.equal(formatCacheHitPercent(99_994_949, 100_000_000), '99.995')
  // 999999/1000000 would round to 100.000 at three places; the readout widens
  // until the miss is visible instead of claiming a full hit.
  assert.equal(formatCacheHitPercent(999_999, 1_000_000), '99.9999')
  assert.equal(formatCacheHitPercent(9_999_999, 10_000_000), '99.99999')
})

test('the escalated reading stays below 100 for a one-token miss', () => {
  const value = formatCacheHitPercent(999_999_999, 1_000_000_000)
  assert.notEqual(value, '100.000')
  assert.ok(Number(value) < 100, `${value} must stay under 100`)
})

test('a negligible hit stays at the ordinary precision rather than escalating', () => {
  // 0.0001% rounds to 0.000 at three places. Unlike the 100% ceiling, a tiny
  // share is not a false claim — it states "under half a thousandth" — so the
  // readout does not widen downward.
  assert.equal(formatCacheHitPercent(1, 1_000_000), '0.000')
  assert.equal(formatCacheHitPercent(1, 100), '1.000')
})

test('digits are clamped to a sane range', () => {
  const usage = { uncachedInputTokens: 3, cacheReadTokens: 1, cacheWriteTokens: 0 }
  assert.equal(cacheHitPercent(usage, 6), '25.000000')
  assert.equal(cacheHitPercent(usage, 0), '25')
  assert.equal(cacheHitPercent(usage, -2), '25')
})

test('malformed usage values degrade to null instead of throwing', () => {
  assert.equal(cacheHitPercent({ cacheReadTokens: 'x', uncachedInputTokens: 'y' }), null)
  assert.equal(cacheHitPercent('nope'), null)
})

test('billedInputTokens sums the three disjoint prompt-side buckets', () => {
  assert.equal(billedInputTokens({ uncachedInputTokens: 10, cacheReadTokens: 90, cacheWriteTokens: 5 }), 105)
  assert.equal(billedInputTokens(null), 0)
})
