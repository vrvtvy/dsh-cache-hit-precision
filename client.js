/* dsh-cache-hit-precision client half — precise in-place cache-hit readout.
 *
 * DSH 0.2 renders the composer statistics row through StatsPills, which mounts
 * on `conversation.composer.dock` and marks its container with
 * `data-composer-stats`. That attribute is this plugin's anchor: it reads the
 * same `tokenUsage` projection the built-in pill reads, then refines only the
 * cache-hit reading inside that row. Every other figure (turns, steps,
 * throughput, totals) and both built-in dialogs stay untouched, and the plugin
 * changes no geometry.
 *
 * The built-in formatter deliberately refuses to round a partial hit up to
 * 100%: it prints an integer until that would collapse, then widens the
 * precision until the miss is visible. This readout keeps that promise from a
 * three-decimal base rather than an integer one, so the shipped guarantee
 * survives at higher resolution instead of being traded away for it.
 *
 * Refinement latency is part of the contract: a freshly mounted anchor —
 * the portaled token-usage dialog above all — is refined inside the mutation
 * observer's own microtask, which runs after React's commit but before the
 * browser paints, so the built-in low-precision first frame is never seen.
 * Everything else settles through one debounced rescan per mutation burst.
 */

window.__ModuleLoader__.load({
  id: 'dsh-cache-hit-precision',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    /** Ordinary-ratio precision of the readout. */
    var DIGITS = 3
    /** Widest precision the escalation may reach before it settles. */
    var MAX_DIGITS = 9
    /** The container attribute StatsPills stamps on the statistics row. */
    var STATS_SELECTOR = '[data-composer-stats]'
    /** A cache-hit reading in either shipped locale, with its number captured. */
    var CACHE_HIT_TEXT = /(缓存命中|Cache hit)(\s+)(\d+(?:\.\d+)?)%/
    /**
     * The session token-usage dialog's row list. That dialog shares the pill's
     * own session aggregate, so both must read the same number — but React
     * portals it onto `document.body`, outside the dock row, so it needs its own
     * anchor: the built-in `data-session-stats-usage` attribute on its `<dl>`.
     * The per-turn panel carries `data-turn-usage-details` instead and is
     * deliberately left alone: its reading is a different aggregate.
     */
    var USAGE_DIALOG_SELECTOR = '[data-session-stats-usage]'
    /** Both anchors as one selector list, for recognizing anchor work. */
    var ANCHOR_SELECTOR = STATS_SELECTOR + ', ' + USAGE_DIALOG_SELECTOR
    /** The cache-hit row's term, in either shipped locale — the label alone, no number. */
    var CACHE_HIT_LABEL = /^(?:缓存命中|Cache hit)$/
    /** A row value that is nothing but a percentage: the only shape this plugin owns. */
    var PERCENT_VALUE = /^\d+(?:\.\d+)?%$/

    /**
     * Sum the three disjoint prompt-side billing buckets — the denominator
     * DSH's own cache-hit reading uses.
     * @param usage - the `tokenUsage` projection value.
     * @returns billed prompt tokens.
     */
    function billedInputTokens(usage) {
      if (!usage || typeof usage !== 'object') return 0
      return (Number(usage.uncachedInputTokens) || 0) +
        (Number(usage.cacheReadTokens) || 0) +
        (Number(usage.cacheWriteTokens) || 0)
    }

    /**
     * Half-up rounding of `numerator / denominator * 10^digits` in exact
     * integer arithmetic, so the readout never inherits float drift.
     * @param numerator - exact numerator.
     * @param denominator - exact positive denominator.
     * @param digits - decimal places to keep.
     * @returns the rounded value in units of `10^-digits`.
     */
    function roundedUnits(numerator, denominator, digits) {
      var scale = 10n ** BigInt(digits)
      var scaled = numerator * scale
      // Half-up is floor((2·scaled + denominator) / (2·denominator)).
      return (scaled * 2n + denominator) / (denominator * 2n)
    }

    /** Render integer units as a fixed-precision decimal string. */
    function renderUnits(units, digits) {
      var scale = 10n ** BigInt(digits)
      var whole = units / scale
      if (digits === 0) return String(whole)
      return String(whole) + '.' + String(units % scale).padStart(digits, '0')
    }

    /**
     * Display-ready cache-hit percentage at {@link DIGITS} places, never
     * rounding a partial hit up to a full one.
     * @param cacheReadTokens - exact prompt tokens served from cache.
     * @param promptTokens - exact aggregate prompt tokens.
     * @returns percentage text, or null when there was no prompt input.
     */
    function formatCacheHitPercent(cacheReadTokens, promptTokens) {
      var read = BigInt(Math.max(0, Math.trunc(Number(cacheReadTokens) || 0)))
      var total = BigInt(Math.max(0, Math.trunc(Number(promptTokens) || 0)))
      if (total <= 0n) return null
      // A full hit is exactly 100, so it reads as 100 at every precision.
      if (read >= total) return renderUnits(100n * 10n ** BigInt(DIGITS), DIGITS)
      for (var places = DIGITS; places <= MAX_DIGITS; places += 1) {
        var units = roundedUnits(read * 100n, total, places)
        if (units < 100n * 10n ** BigInt(places)) return renderUnits(units, places)
      }
      // Unreachable for integer token counts: one miss in 10^9 is already
      // distinct at nine places. The widest honest form stands in regardless.
      return '99.999999999'
    }

    /**
     * The precise reading for one `tokenUsage` value.
     * @param usage - the `tokenUsage` projection value.
     * @returns percentage text, or null when no prompt input was billed.
     */
    function precisePercent(usage) {
      if (!usage || typeof usage !== 'object') return null
      return formatCacheHitPercent(Number(usage.cacheReadTokens) || 0, billedInputTokens(usage))
    }

    /**
     * Replace the cache-hit reading inside one text value. The built-in pill
     * builds its `aria-label` from the same numbers as its visible text, so
     * refining only the DOM text would leave assistive technology announcing
     * the un-refined integer.
     * @param text - the current text or `aria-label` value.
     * @param percent - the precise percentage text.
     * @returns the refined value, or null when it carries no cache-hit reading.
     */
    function refineReading(text, percent) {
      if (typeof text !== 'string' || text === '' || text.indexOf('%') < 0) return null
      if (!CACHE_HIT_TEXT.test(text)) return null
      var next = text.replace(CACHE_HIT_TEXT, '$1$2' + percent + '%')
      return next === text ? null : next
    }

    /**
     * Refine the statistics row under `root`: its cache-hit text node and the
     * accessible label of the pill that owns it.
     * @param root - the statistics row element.
     * @param percent - the precise percentage text.
     * @returns how many values were rewritten.
     */
    function patchRow(root, percent) {
      var changed = 0
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      var node
      while ((node = walker.nextNode())) {
        var next = refineReading(node.nodeValue, percent)
        if (next === null) continue
        node.nodeValue = next
        changed += 1
      }
      var labelled = root.querySelectorAll('[aria-label]')
      for (var index = 0; index < labelled.length; index += 1) {
        var control = labelled[index]
        var refined = refineReading(control.getAttribute('aria-label'), percent)
        if (refined === null) continue
        control.setAttribute('aria-label', refined)
        changed += 1
      }
      return changed
    }

    /**
     * Refine the cache-hit row of the session token-usage dialog. The dialog is
     * portaled onto `document.body`, so it is addressed by its own anchor and
     * walked as a definition list rather than by text substitution: the row is
     * `dt` = the cache-hit label, `dd` = a bare percentage. Only that pair is
     * touched, so the sibling bucket rows (uncached input, cache read, cache
     * write, output) keep their exact figures.
     * @param root - the dialog's row list element.
     * @param percent - the precise percentage text.
     * @returns how many values were rewritten.
     */
    function patchUsageDialog(root, percent) {
      var changed = 0
      var terms = root.querySelectorAll('dt')
      for (var index = 0; index < terms.length; index += 1) {
        var term = terms[index]
        if (!CACHE_HIT_LABEL.test((term.textContent || '').trim())) continue
        var value = term.nextElementSibling
        if (!value || value.tagName !== 'DD') continue
        var text = value.textContent || ''
        if (!PERCENT_VALUE.test(text)) continue
        var next = percent + '%'
        if (text === next) continue
        // Write through the text node React rendered rather than replacing
        // the row's children: React keeps its own reference to that node and
        // updates it in place on later renders, so a swapped child would
        // orphan it — React would write the next reading into a detached
        // node and this row would go stale until the dialog remounted.
        var node = value.firstChild
        if (node && node.nodeType === 3 /* Node.TEXT_NODE */ && node.nodeValue === text) node.nodeValue = next
        else value.textContent = next
        changed += 1
      }
      return changed
    }

    /**
     * Whether one mutation record asks for the synchronous refinement pass:
     * an anchor freshly mounted (the portaled usage dialog arriving on
     * `document.body`, a statistics row remounting in the dock, a segment
     * appearing inside one), or a text write landing inside an anchor (React
     * updating a reading in place). Both must be refined inside the observer's
     * own microtask — it runs after React's commit but before the browser
     * paints, so the built-in low-precision reading never reaches a first
     * frame. Anything else — streaming text elsewhere on the page, removals —
     * classifies as false and is left to the settled-burst rescan.
     * @param record - MutationRecord-shaped `{ type, target, addedNodes }`.
     * @returns whether the record touches an anchor.
     */
    function touchesAnchor(record) {
      if (record.type === 'characterData') {
        var host = record.target ? record.target.parentElement : null
        return host !== null && host !== undefined &&
          typeof host.closest === 'function' && host.closest(ANCHOR_SELECTOR) !== null
      }
      if (record.type !== 'childList') return false
      var nodes = record.addedNodes || []
      for (var index = 0; index < nodes.length; index += 1) {
        var node = nodes[index]
        if (!node || node.nodeType !== 1) continue
        if (node.matches(ANCHOR_SELECTOR)) return true
        if (node.querySelector(ANCHOR_SELECTOR) !== null) return true
        if (typeof node.closest === 'function' && node.closest(ANCHOR_SELECTOR) !== null) return true
      }
      // A bare insertion whose target sits inside an anchor — a fresh text
      // node under a dialog row — is anchor work too; only removals fall out.
      if (nodes.length === 0) return false
      var parent = record.target
      return parent !== null && parent !== undefined &&
        typeof parent.closest === 'function' && parent.closest(ANCHOR_SELECTOR) !== null
    }

    /**
     * One observer callback, factored out so the wiring is testable without a
     * DOM: anchor work refines synchronously, everything else waits for the
     * settled-burst rescan that `schedule` dedupes to one per burst.
     * @param records - the observer's mutation records.
     * @param scan - refine every mounted anchor now.
     * @param schedule - schedule the settled-burst rescan.
     */
    function handleMutations(records, scan, schedule) {
      for (var index = 0; index < records.length; index += 1) {
        if (touchesAnchor(records[index])) {
          scan()
          break
        }
      }
      schedule()
    }

    /**
     * Refine every mounted statistics row.
     * @param percent - the precise percentage text.
     * @returns how many values were rewritten.
     */
    function patchAll(percent) {
      if (typeof document === 'undefined') return 0
      var changed = 0
      var rows = document.querySelectorAll(STATS_SELECTOR)
      for (var index = 0; index < rows.length; index += 1) {
        changed += patchRow(rows[index], percent)
      }
      var dialogs = document.querySelectorAll(USAGE_DIALOG_SELECTOR)
      for (var dialog = 0; dialog < dialogs.length; dialog += 1) {
        changed += patchUsageDialog(dialogs[dialog], percent)
      }
      return changed
    }

    /**
     * The invisible dock entry. It claims a seat in the composer dock so React
     * hands it the session's `useProjection`, then reconciles the DOM whenever
     * the reading or a re-render changes it.
     * @param props - the dock entry's standard props.
     * @returns null — this entry draws nothing.
     */
    function CachePrecisionEntry(props) {
      var useProjection = props.useProjection
      var usage = useProjection ? useProjection('tokenUsage') : undefined
      var percent = precisePercent(usage)

      React.useLayoutEffect(function () {
        if (percent === null) return undefined
        var timer = null

        function scan() {
          patchAll(percent)
        }

        scan()
        if (typeof MutationObserver === 'undefined') return undefined

        // One rescan per burst as the settle pass: anything the per-record
        // pass missed is corrected once the burst ends. A write of ours is
        // itself a DOM mutation, so the observer sees it and schedules one
        // more scan; that scan finds every reading already at the target
        // precision and writes nothing, so the loop settles instead of
        // sustaining itself.
        function scheduleSettledScan() {
          if (timer !== null) return
          timer = setTimeout(function () {
            timer = null
            scan()
          }, 100)
        }

        var observer = new MutationObserver(function (records) {
          handleMutations(records, scan, scheduleSettledScan)
        })
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })

        return function () {
          if (timer !== null) clearTimeout(timer)
          observer.disconnect()
        }
      }, [percent])

      return null
    }

    function apply(ctx) {
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
        { name: 'conversation.composer.dock', id: 'cache-precision', order: 99 },
        CachePrecisionEntry,
      ))
    }

    exports.apply = apply
    exports.inject = ['slots']
    // Surfaced so the package's own suite can hold this half and the host half
    // to the same numbers without a browser.
    exports.formatCacheHitPercent = formatCacheHitPercent
    exports.precisePercent = precisePercent
    exports.billedInputTokens = billedInputTokens
    exports.refineReading = refineReading
    exports.patchUsageDialog = patchUsageDialog
    exports.touchesAnchor = touchesAnchor
    exports.handleMutations = handleMutations
    exports.patchAll = patchAll
    return module.exports
  },
})
