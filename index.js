/**
 * Host half of the dsh-cache-hit-precision bundle; the Client module owns the
 * readout itself. The row exists so `dsh plugin add` records the package in the
 * profile bundle roster and the Web surface mounts `client.js`.
 *
 * The formatter below is the reference implementation the browser half mirrors;
 * `test/cache.test.mjs` holds both to the same numbers.
 */

export const name = 'dsh-cache-hit-precision'

/**
 * Half-up rounding of `numerator / denominator * 10^digits` in exact integer
 * arithmetic, so a percentage never inherits the drift of a float division.
 * @param {bigint} numerator - exact numerator.
 * @param {bigint} denominator - exact positive denominator.
 * @param {number} digits - decimal places to keep.
 * @returns {bigint} the rounded value in units of `10^-digits`.
 */
function roundedUnits(numerator, denominator, digits) {
  const scale = 10n ** BigInt(digits)
  const scaled = numerator * scale
  // Half-up is floor((2·scaled + denominator) / (2·denominator)).
  return (scaled * 2n + denominator) / (denominator * 2n)
}

/**
 * Render integer units as a fixed-precision decimal string.
 * @param {bigint} units - value in units of `10^-digits`.
 * @param {number} digits - decimal places to render.
 * @returns {string} the decimal text.
 */
function renderUnits(units, digits) {
  const scale = 10n ** BigInt(digits)
  const whole = units / scale
  if (digits === 0) return String(whole)
  return `${whole}.${String(units % scale).padStart(digits, '0')}`
}

/**
 * Prompt-side denominator DSH bills against: uncached input + cache reads +
 * cache writes. The three buckets are disjoint, so the cache-read share of
 * their sum is the cache-hit rate.
 * @param {unknown} usage - the `tokenUsage` projection value.
 * @returns {number} billed prompt tokens, or 0 when the value carries none.
 */
export function billedInputTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0
  return (Number(usage.uncachedInputTokens) || 0) +
    (Number(usage.cacheReadTokens) || 0) +
    (Number(usage.cacheWriteTokens) || 0)
}

/**
 * Display-ready cache-hit percentage at a readable precision, never rounding a
 * partial hit up to a full one.
 *
 * DSH's own formatter keeps that promise by widening the precision only once an
 * integer reading would collapse to 100%. This readout starts at three
 * decimals, so the escalation continues from there: a value that would render
 * as `100.000` while cache reads still fall short of the billed input gains
 * further places until the miss becomes visible.
 * @param {number} cacheReadTokens - exact prompt tokens served from cache.
 * @param {number} promptTokens - exact aggregate prompt tokens.
 * @param {number} [digits] - ordinary-ratio precision; defaults to three.
 * @returns {string|null} percentage text, or null when there was no prompt input.
 */
export function formatCacheHitPercent(cacheReadTokens, promptTokens, digits = 3) {
  const read = BigInt(Math.max(0, Math.trunc(Number(cacheReadTokens) || 0)))
  const total = BigInt(Math.max(0, Math.trunc(Number(promptTokens) || 0)))
  if (total <= 0n) return null
  const precision = Math.max(0, Math.min(9, Math.trunc(Number(digits)) || 0))
  // A full hit is exactly 100, so it reads as 100 at every precision.
  if (read >= total) return renderUnits(100n * 10n ** BigInt(precision), precision)
  for (let places = precision; places <= 9; places += 1) {
    const units = roundedUnits(read * 100n, total, places)
    if (units < 100n * 10n ** BigInt(places)) return renderUnits(units, places)
  }
  // Unreachable for integer token counts: one miss in 10^9 is already distinct
  // at nine places. The widest honest form stands in regardless.
  return '99.999999999'
}

/**
 * Cache-hit percentage for a `tokenUsage` projection value.
 * @param {unknown} usage - the `tokenUsage` projection value.
 * @param {number} [digits] - ordinary-ratio precision; defaults to three.
 * @returns {string|null} percentage text, or null when no prompt input was billed.
 */
export function cacheHitPercent(usage, digits = 3) {
  if (!usage || typeof usage !== 'object') return null
  return formatCacheHitPercent(Number(usage.cacheReadTokens) || 0, billedInputTokens(usage), digits)
}

export function apply() {
  // Client-only plugin: the readout lives in the browser half.
}
