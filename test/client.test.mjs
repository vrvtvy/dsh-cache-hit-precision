/**
 * Browser-half tests. `client.js` is a `window.__ModuleLoader__.load(...)`
 * registration, so the suite installs a stub facade, captures the factory, and
 * materializes it through a `require` that hands back a minimal React shim.
 * That exercises the same numbers and the same text refinement the page runs.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cacheHitPercent, billedInputTokens } from '../index.js'

const source = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

/**
 * Materialize the client half through a stub module-loader facade.
 * @param {object} [dom] - page globals to inject; omitted, the half loads
 * without a document, as it does before the dock mounts.
 */
function loadClientHalf(dom = {}) {
  let registration
  const window = { __ModuleLoader__: { load: (value) => { registration = value } } }
  const react = {
    createElement: () => null,
    useRef: () => ({ current: null }),
    useLayoutEffect: () => undefined,
  }
  // eslint-disable-next-line no-new-func -- the file is a page script, not a module.
  new Function('window', 'document', 'NodeFilter', 'MutationObserver', source)(
    window, dom.document, dom.NodeFilter, dom.MutationObserver,
  )
  assert.equal(registration.id, 'dsh-cache-hit-precision')
  assert.deepEqual(registration.factory.toString().length > 0, true)
  const exports = registration.factory((specifier) => {
    if (specifier === 'react') return react
    throw new Error(`unexpected require: ${specifier}`)
  })
  return exports
}

const client = loadClientHalf()

test('the client half registers the package id and injects slots', () => {
  assert.deepEqual(client.inject, ['slots'])
  assert.equal(typeof client.apply, 'function')
})

test('the two halves agree on the billed prompt denominator', () => {
  const cases = [
    { uncachedInputTokens: 10, cacheReadTokens: 90, cacheWriteTokens: 5 },
    { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    {},
    null,
  ]
  for (const usage of cases) {
    assert.equal(client.billedInputTokens(usage), billedInputTokens(usage))
  }
})

test('the two halves agree on the rendered percentage', () => {
  const prompts = [
    [0, 0],
    [1, 1],
    [123, 1123],
    [100, 1000],
    [999_999, 1_000_000],
    [9_999_999, 10_000_000],
    [99_994_949, 100_000_000],
    [1, 1_000_000],
    [9995, 10_000],
  ]
  for (const [read, total] of prompts) {
    assert.equal(
      client.formatCacheHitPercent(read, total),
      cacheHitPercent({ cacheReadTokens: read, uncachedInputTokens: total - read, cacheWriteTokens: 0 }),
      `${read}/${total}`,
    )
  }
})

test('refineReading rewrites both shipped locales and keeps their spacing', () => {
  assert.equal(client.refineReading('缓存命中 98%', '98.460'), '缓存命中 98.460%')
  assert.equal(client.refineReading('Cache hit 98%', '98.460'), 'Cache hit 98.460%')
  // The built-in pill's aria-label joins its readings with a separator.
  assert.equal(client.refineReading('15.7M tok · 缓存命中 98%', '98.460'), '15.7M tok · 缓存命中 98.460%')
  // A reading already at the target precision is not rewritten.
  assert.equal(client.refineReading('缓存命中 98.460%', '98.460'), null)
})

test('refineReading rewrites the six locales 0.2.2 added, keeping each one\'s own padding', () => {
  // 0.2.2 registered ja, es, fr, de, ru and pt beside zh and en. The shipped
  // templates differ by more than the words: four put a colon after the label
  // and French pads the number from the percent sign. Only the digits are this
  // plugin's to change, so every other character must survive verbatim.
  const shipped = [
    ['stats.cacheHit ja', 'キャッシュヒット 98%', 'キャッシュヒット 98.460%'],
    ['stats.cacheHit es', 'Aciertos de caché: 98%', 'Aciertos de caché: 98.460%'],
    ['stats.cacheHit fr', 'Taux de réussite du cache : 98 %', 'Taux de réussite du cache : 98.460 %'],
    ['stats.cacheHit de', 'Cache-Treffer: 98%', 'Cache-Treffer: 98.460%'],
    ['stats.cacheHit ru', 'Попадание в кэш: 98%', 'Попадание в кэш: 98.460%'],
    ['stats.cacheHit pt', 'Acertos no cache: 98%', 'Acertos no cache: 98.460%'],
  ]
  for (const [name, before, after] of shipped) {
    assert.equal(client.refineReading(before, '98.460'), after, name)
  }
  // The composed pill reading carries the label after the separator glyph.
  assert.equal(
    client.refineReading('15.7M tok · Taux de réussite du cache : 98 %', '98.460'),
    '15.7M tok · Taux de réussite du cache : 98.460 %',
  )
  // Already at the target precision: no rewrite in any of them.
  for (const [, , after] of shipped) {
    assert.equal(client.refineReading(after, '98.460'), null, after)
  }
})

test('refineReading ignores values that carry no cache-hit reading', () => {
  assert.equal(client.refineReading('1 轮 100 步 · 224 tok/s', '98.460'), null)
  assert.equal(client.refineReading('15.7M tok', '98.460'), null)
  assert.equal(client.refineReading('', '98.460'), null)
  assert.equal(client.refineReading(undefined, '98.460'), null)
})

test('precisePercent reads the same projection shape DSH serves', () => {
  assert.equal(
    client.precisePercent({ uncachedInputTokens: 100, cacheReadTokens: 400, cacheWriteTokens: 500 }),
    '40.000',
  )
  assert.equal(client.precisePercent(undefined), null)
  assert.equal(client.precisePercent({}), null)
})

/**
 * Build the `<dl>` shape the session usage dialog renders: term/value pairs
 * whose values are `dd` siblings of their `dt`, exactly as StatsPills writes
 * them. `textContent` is a plain field and `set` records assignments, so a
 * write can be told apart from an untouched row.
 */
function usageDialog(rows) {
  const terms = rows.map(([term, value]) => {
    const dd = { tagName: 'DD', textContent: value }
    const dt = {
      tagName: 'DT',
      textContent: term,
      nextElementSibling: dd,
    }
    return dt
  })
  return {
    rows,
    querySelectorAll: (selector) => {
      assert.equal(selector, 'dt')
      return terms
    },
    valueOf: (index) => terms[index].nextElementSibling.textContent,
  }
}

test('patchUsageDialog refines the cache-hit row of the session usage dialog', () => {
  // The row order and labels mirror the shipped dialog in zh.
  const dialog = usageDialog([
    ['缓存命中', '99%'],
    ['未缓存输入', '333,767 tok'],
    ['缓存读取', '50,174,720 tok'],
    ['输出', '401,898 tok'],
  ])
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 1)
  assert.equal(dialog.valueOf(0), '99.339%')
  // Every sibling bucket keeps its exact figure.
  assert.equal(dialog.valueOf(1), '333,767 tok')
  assert.equal(dialog.valueOf(2), '50,174,720 tok')
  assert.equal(dialog.valueOf(3), '401,898 tok')
})

test('patchUsageDialog handles the English labels too', () => {
  const dialog = usageDialog([['Cache hit', '99%'], ['Output', '1,024 tok']])
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 1)
  assert.equal(dialog.valueOf(0), '99.339%')
  assert.equal(dialog.valueOf(1), '1,024 tok')
})

test('patchUsageDialog recognizes the cache-hit term in every shipped locale', () => {
  // 0.2.2 also localized 'message.turnUsage.cacheHit', the term of the dialog's
  // own row. A dialog whose term is not recognized silently keeps the built-in
  // integer while the pill beside it shows the refined reading.
  const terms = [
    '缓存命中', 'Cache hit', 'キャッシュヒット', 'Aciertos de caché',
    'Taux de réussite du cache', 'Cache-Treffer', 'Попадание в кэш', 'Acertos no cache',
  ]
  for (const term of terms) {
    const dialog = usageDialog([[term, '99%'], ['50,174,720 tok', 'x']])
    assert.equal(client.patchUsageDialog(dialog, '99.339'), 1, term)
    assert.equal(dialog.valueOf(0), '99.339%', term)
  }
})

test('patchUsageDialog is a no-op once the row already carries the reading', () => {
  const dialog = usageDialog([['缓存命中', '99.339%']])
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 0)
})

test('patchUsageDialog leaves a dialog without a cache-hit row untouched', () => {
  // A session that never wrote cache drops the row entirely.
  const dialog = usageDialog([['未缓存输入', '10 tok'], ['输出', '5 tok']])
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 0)
  assert.equal(dialog.valueOf(0), '10 tok')
})

test('patchUsageDialog ignores a cache-hit term whose value is not a bare percentage', () => {
  // The guard keeps the plugin from overwriting a value it does not own.
  const dialog = usageDialog([['缓存命中', 'not-a-percentage']])
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 0)
  assert.equal(dialog.valueOf(0), 'not-a-percentage')
})

test('patchUsageDialog writes through the text node React rendered', () => {
  // React keeps its own reference to the row's text node and updates it in
  // place on later renders, so the refinement must write through that node —
  // replacing the row's children would orphan it and freeze the reading.
  const node = { nodeType: 3, nodeValue: '99%' }
  const dd = { tagName: 'DD', textContent: '99%', firstChild: node }
  const dt = { tagName: 'DT', textContent: '缓存命中', nextElementSibling: dd }
  const dialog = {
    querySelectorAll: (selector) => {
      assert.equal(selector, 'dt')
      return [dt]
    },
  }
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 1)
  assert.equal(node.nodeValue, '99.339%')
  // The container is untouched: no child replacement happened.
  assert.equal(dd.textContent, '99%')
})

test('patchUsageDialog falls back to replacing children when the value is not one text node', () => {
  // Shapes without a single leading text node still refine.
  const dd = { tagName: 'DD', textContent: '99%' }
  const dt = { tagName: 'DT', textContent: '缓存命中', nextElementSibling: dd }
  const dialog = { querySelectorAll: () => [dt] }
  assert.equal(client.patchUsageDialog(dialog, '99.339'), 1)
  assert.equal(dd.textContent, '99.339%')
})

test('touchesAnchor classifies anchor work for synchronous refinement', () => {
  // The portaled usage dialog mounting onto document.body.
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 1, matches: () => true }],
  }), true)
  // A wrapper carrying a freshly mounted statistics row.
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => ({}) }],
  }), true)
  // A segment appearing inside an anchor.
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null, closest: () => ({}) }],
  }), true)
  // React rewriting a reading in place: character data under an anchor.
  assert.equal(client.touchesAnchor({
    type: 'characterData',
    target: { parentElement: { closest: () => ({}) } },
  }), true)
  // A bare text node inserted into a dialog row.
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 3, nodeValue: '99%' }],
    target: { closest: () => ({}) },
  }), true)
  // Streaming text elsewhere on the page stays on the debounced path.
  assert.equal(client.touchesAnchor({
    type: 'characterData',
    target: { parentElement: { closest: () => null } },
  }), false)
  assert.equal(client.touchesAnchor({
    type: 'characterData',
    target: {},
  }), false)
  // Removals are not anchor work, wherever they happen.
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [],
    target: { closest: () => ({}) },
  }), false)
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null, closest: () => null }],
  }), false)
})

test('handleMutations refines anchor work synchronously and defers the rest', () => {
  let scans = 0
  let scheduled = 0
  const scan = () => { scans += 1 }
  const schedule = () => { scheduled += 1 }
  const anchorMount = { type: 'childList', addedNodes: [{ nodeType: 1, matches: () => true }] }
  const streamElsewhere = { type: 'characterData', target: { parentElement: { closest: () => null } } }

  // Anchor work refines synchronously, before any paint, and still asks for
  // the settled-burst rescan.
  client.handleMutations([anchorMount], scan, schedule)
  assert.equal(scans, 1)
  assert.equal(scheduled, 1)

  // Unrelated streaming text does not scan synchronously.
  client.handleMutations([streamElsewhere], scan, schedule)
  assert.equal(scans, 1)
  assert.equal(scheduled, 2)

  // One burst with several records refines at most once.
  client.handleMutations([
    { type: 'childList', addedNodes: [] },
    anchorMount,
    anchorMount,
  ], scan, schedule)
  assert.equal(scans, 2)
  assert.equal(scheduled, 3)
})

const STATS_SELECTOR = '[data-composer-stats], [data-composer-stat="usage"]'
const USAGE_DIALOG_SELECTOR = '[data-session-stats-usage]'

/**
 * Build the markup the two host versions mount in the composer dock around the
 * reading. Up to 0.2.0 `data-composer-stats` wrapped the whole statistics row;
 * from 0.2.1 each pill is its own dock entry carrying `data-composer-stat`, and
 * `usage` is the entry that holds the cache-hit reading. Either anchor is a
 * pill button whose visible text and `aria-label` carry that reading, exactly
 * as StatsPills renders them.
 * @param attribute - one anchor value of the selector the half queries.
 * @param text - the reading the built-in formatter produced.
 * @returns the anchor row element, its text node, and its labelled control.
 */
function readingRow(attribute, text) {
  const label = { nodeValue: text }
  const control = {
    attributes: { 'aria-label': text },
    getAttribute(name) { return this.attributes[name] ?? null },
    setAttribute(name, value) { this.attributes[name] = value },
  }
  const anchor = {
    attribute,
    querySelectorAll: (selector) => (selector === '[aria-label]' ? [control] : []),
  }
  return { anchor, label, control }
}

/**
 * A page serving the composed rows — and, when open, the portaled usage dialog —
 * to the half's queries, with a text walker over each row's reading node.
 * @param rows - rows from `readingRow`.
 * @param dialogRows - rows for the open usage dialog, or null when it is closed.
 * @returns the stub page document plus the dialog it built.
 */
function readingPage(rows, dialogRows = null) {
  const dialogs = dialogRows === null ? [] : [usageDialog(dialogRows)]
  return {
    document: {
      querySelectorAll(selector) {
        // Match the way a browser does: a row answers only its own attribute,
        // so an `activity` pill stays out of a selector that names `usage`.
        if (selector === STATS_SELECTOR) {
          return rows
            .filter(row => selector.includes(`[${row.anchor.attribute}]`))
            .map(row => row.anchor)
        }
        if (selector === USAGE_DIALOG_SELECTOR) return dialogs
        return []
      },
      createTreeWalker(root) {
        const texts = rows.filter(row => row.anchor === root).map(row => row.label)
        let index = -1
        return { nextNode: () => (index += 1) < texts.length ? texts[index] : null }
      },
    },
    dialog: dialogs[0],
  }
}

test('the reading is anchored in both shipped host markups', () => {
  // 0.2.1 split the statistics row into one dock entry per pill and stamped each
  // entry with `data-composer-stat`; a half anchored only on the pre-0.2.1
  // container silently refines nothing on 0.2.1 and later.
  for (const attribute of ['data-composer-stats', 'data-composer-stat="usage"']) {
    const row = readingRow(attribute, '15.7M tok · 缓存命中 98%')
    const page = readingPage([row])
    const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })
    assert.equal(clientHalf.patchAll('98.460'), 2, attribute)
    assert.equal(row.label.nodeValue, '15.7M tok · 缓存命中 98.460%', attribute)
    assert.equal(row.control.getAttribute('aria-label'), '15.7M tok · 缓存命中 98.460%', attribute)
  }
})

test('one pass refines the pill and the open usage dialog to the same reading', () => {
  // Both live in the same page — the pill in the composer dock, the dialog
  // portaled onto document.body — so a session reading must match in both.
  const row = readingRow('data-composer-stat="usage"', '80.9M tok · 缓存命中 99%')
  const page = readingPage([row], [['缓存命中', '99%'], ['缓存读取', '50,174,720 tok']])
  const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })
  assert.equal(clientHalf.patchAll('99.186'), 3)
  assert.equal(row.label.nodeValue, '80.9M tok · 缓存命中 99.186%')
  assert.equal(page.dialog.valueOf(0), '99.186%')
  // The sibling bucket keeps its exact figure.
  assert.equal(page.dialog.valueOf(1), '50,174,720 tok')
})

test('the activity pill is not a reading anchor', () => {
  // The activity entry carries turns, steps and speed and never a cache-hit
  // reading, so naming only the usage value keeps the walk off it — a bare
  // `[data-composer-stat]` would walk this pill on every mutation burst.
  const row = readingRow('data-composer-stat="activity"', '1 轮 100 步 · 224 tok/s')
  const page = readingPage([row])
  const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })
  assert.equal(clientHalf.patchAll('98.460'), 0)
  assert.equal(row.label.nodeValue, '1 轮 100 步 · 224 tok/s')
  assert.equal(row.control.getAttribute('aria-label'), '1 轮 100 步 · 224 tok/s')
})

const TOOLTIP_SELECTOR = '[data-portal][role="tooltip"]'

/**
 * Build the bubble shell the built-in `Tooltip` portals onto `document.body`:
 * a label span inside a `role="tooltip"` span, addressed by its own anchor.
 * @param text - the full reading the bubble repeats.
 * @returns the bubble's anchor element and its text node.
 */
function tooltipBubble(text) {
  const label = { nodeValue: text }
  return { label, anchor: { querySelectorAll: () => [] } }
}

/**
 * A page serving the composed rows and the full-reading bubbles, with a text
 * walker over each anchor's nodes.
 * @param rows - rows from `readingRow`.
 * @param bubbles - bubbles from `tooltipBubble`.
 * @returns the stub page document.
 */
function tooltipPage(rows, bubbles) {
  return {
    document: {
      querySelectorAll(selector) {
        if (selector === STATS_SELECTOR) {
          return rows
            .filter(row => selector.includes(`[${row.anchor.attribute}]`))
            .map(row => row.anchor)
        }
        if (selector === TOOLTIP_SELECTOR) return bubbles.map(bubble => bubble.anchor)
        return []
      },
      createTreeWalker(root) {
        const texts = [
          ...rows.filter(row => row.anchor === root).map(row => row.label),
          ...bubbles.filter(bubble => bubble.anchor === root).map(bubble => bubble.label),
        ]
        let index = -1
        return { nextNode: () => (index += 1) < texts.length ? texts[index] : null }
      },
    },
  }
}

test('the full-reading tooltip 0.2.2 portals is refined alongside the pill', () => {
  // 0.2.2 wraps a clipped pill's label in a tooltip carrying the whole reading
  // built from the same built-in numbers. It lives on document.body, outside
  // the pill, so a sweep that knows only the row leaves it announcing the
  // un-refined integer after the pill advanced.
  const row = readingRow('data-composer-stat="usage"', '80.9M tok · 缓存命中 99%')
  const bubble = tooltipBubble('80.9M tok · 缓存命中 99%')
  const page = tooltipPage([row], [bubble])
  const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })
  assert.equal(clientHalf.patchAll('99.186'), 3)
  assert.equal(row.label.nodeValue, '80.9M tok · 缓存命中 99.186%')
  assert.equal(bubble.label.nodeValue, '80.9M tok · 缓存命中 99.186%')
})

test('a tooltip that describes another surface is never rewritten', () => {
  // Only the reading itself is this plugin's to change: a bubble with no
  // cache-hit reading in it must come out byte-identical, or the content gate
  // would be rewriting unrelated host copy.
  const row = readingRow('data-composer-stat="usage"', '80.9M tok · Cache hit 99%')
  const unrelated = tooltipBubble('1 turns 1 steps · 20 tok/s')
  const page = tooltipPage([row], [unrelated])
  const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })
  assert.equal(clientHalf.patchAll('99.186'), 2)
  assert.equal(row.label.nodeValue, '80.9M tok · Cache hit 99.186%')
  assert.equal(unrelated.label.nodeValue, '1 turns 1 steps · 20 tok/s')
})

test('a 0.2.1 page keeps refining: two locales, no tooltip bubble', () => {
  // The host corridor this plugin must not regress: 0.2.1 registered only zh
  // and en and raised no full-reading tooltip, so the widened label set and the
  // added bubble sweep have to leave that page byte-compatible.
  const row = readingRow('data-composer-stat="usage"', '15.7M tok · Cache hit 98%')
  const page = readingPage([row], [['Cache hit', '98%'], ['Cache read', '9,004 tok']])
  const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })
  assert.equal(clientHalf.patchAll('98.460'), 3)
  assert.equal(row.label.nodeValue, '15.7M tok · Cache hit 98.460%')
  assert.equal(row.control.getAttribute('aria-label'), '15.7M tok · Cache hit 98.460%')
  assert.equal(page.dialog.valueOf(0), '98.460%')
  // The third value is the pill's accessible label; the surviving bucket keeps
  // its exact figure, exactly as it did before the 0.2.2 work.
  assert.equal(page.dialog.valueOf(1), '9,004 tok')
})

test('a mounted tooltip bubble counts as anchor work', () => {
  // The bubble appears on hover, well after the burst that painted the row, so
  // it has to trigger the synchronous pass instead of waiting for the settled
  // one. A node that answers only the bubble's own anchor proves the composed
  // anchor selector carries it.
  const isBubble = (selector) => selector.includes('[data-portal][role="tooltip"]')
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 1, matches: isBubble, querySelector: () => null, closest: () => null }],
  }), true)
  // A write inside an already-mounted bubble is anchor work too.
  assert.equal(client.touchesAnchor({
    type: 'characterData',
    target: { parentElement: { closest: (selector) => (isBubble(selector) ? {} : null) } },
  }), true)
  // And a bubble's own insertion under an anchor-less body target still counts.
  assert.equal(client.touchesAnchor({
    type: 'childList',
    addedNodes: [{ nodeType: 3, nodeValue: '99%' }],
    target: { closest: (selector) => (isBubble(selector) ? {} : null) },
  }), true)
})

/**
 * A reading row that knows which conversation pane owns it.
 * @param {string} sessionId - the pane's session id.
 * @param {string} text - the built-in reading.
 * @returns a stub row with a session root behind `closest`.
 */
function sessionRow(sessionId, text) {
  const row = readingRow('data-composer-stat="usage"', text)
  row.anchor.closest = (selector) => selector.includes('data-conversation-session')
    ? { getAttribute: (name) => (name === 'data-conversation-session' ? sessionId : null) }
    : null
  return row
}

test('sessionIdOf resolves both shipped session-root attributes', () => {
  const conversation = { getAttribute: (name) => (name === 'data-conversation-session' ? 'session-a' : null) }
  const rightbar = { getAttribute: (name) => (name === 'data-sidebar-right-session' ? 'session-b' : null) }
  assert.equal(client.sessionIdOf({
    closest: (selector) => (selector.includes('data-conversation-session') ? conversation : null),
  }), 'session-a')
  assert.equal(client.sessionIdOf({
    closest: (selector) => (selector.includes('data-sidebar-right-session') ? rightbar : null),
  }), 'session-b')
  assert.equal(client.sessionIdOf(null), null)
})

test('sessionIdOf traces a portaled dialog and tooltip back through their trigger', () => {
  const conversation = { getAttribute: (name) => (name === 'data-conversation-session' ? 'session-a' : null) }
  const trigger = {
    style: { anchorName: '--dsh-stat-abc' },
    closest: (selector) => (selector.includes('data-conversation-session') ? conversation : null),
  }
  // The usage `<dl>` sits inside the portaled panel that carries the anchor.
  const panel = { style: { positionAnchor: '--dsh-stat-abc' } }
  const dialog = { parentElement: panel }
  const bubble = { getAttribute: (name) => (name === 'id' ? 'tip-1' : null) }
  const described = {
    getAttribute: (name) => (name === 'aria-describedby' ? 'tip-1' : null),
    closest: (selector) => (selector.includes('data-conversation-session') ? conversation : null),
  }
  const clientHalf = loadClientHalf({
    document: { querySelectorAll: (selector) => (selector === '[style]' ? [trigger, dialog] : selector === '[aria-describedby]' ? [described] : []) },
    NodeFilter: { SHOW_TEXT: 4 },
  })
  assert.equal(clientHalf.sessionIdOf(dialog), 'session-a')
  assert.equal(clientHalf.sessionIdOf(bubble), 'session-a')
})

test('a scoped pass refines only its own session; another session keeps its reading', () => {
  // Two side-by-side panes each mount a dock entry. Without scoping the last
  // entry to re-render writes its percentage into both panes' pills.
  const first = sessionRow('session-a', '22.3K tok · 缓存命中 95%')
  const second = sessionRow('session-b', '3.4M tok · 缓存命中 98%')
  const page = readingPage([first, second])
  const clientHalf = loadClientHalf({ document: page.document, NodeFilter: { SHOW_TEXT: 4 } })

  assert.equal(clientHalf.patchAll('95.873', 'session-a'), 2)
  assert.equal(first.label.nodeValue, '22.3K tok · 缓存命中 95.873%')
  assert.equal(second.label.nodeValue, '3.4M tok · 缓存命中 98%')

  assert.equal(clientHalf.patchAll('99.186', 'session-b'), 2)
  assert.equal(first.label.nodeValue, '22.3K tok · 缓存命中 95.873%')
  assert.equal(second.label.nodeValue, '3.4M tok · 缓存命中 99.186%')
})

test('a scoped pass leaves another session\'s portaled dialog and tooltip untouched', () => {
  const conversation = (id) => ({ getAttribute: (name) => (name === 'data-conversation-session' ? id : null) })
  const other = conversation('session-b')
  const dialog = usageDialog([['缓存命中', '99%']])
  dialog.style = { positionAnchor: '--dsh-stat-other' }
  const bubble = tooltipBubble('80.9M tok · 缓存命中 99%')
  bubble.anchor.style = {}
  bubble.anchor.getAttribute = (name) => (name === 'id' ? 'tip-other' : null)
  const trigger = { style: { anchorName: '--dsh-stat-other' }, closest: () => other }
  const described = { getAttribute: (name) => (name === 'aria-describedby' ? 'tip-other' : null), closest: () => other }
  const page = tooltipPage([], [bubble])
  const documentStub = {
    querySelectorAll: (selector) => {
      if (selector === USAGE_DIALOG_SELECTOR) return [dialog]
      if (selector === '[style]') return [trigger, dialog]
      if (selector === '[aria-describedby]') return [described]
      return page.document.querySelectorAll(selector)
    },
    createTreeWalker: page.document.createTreeWalker,
  }
  const clientHalf = loadClientHalf({ document: documentStub, NodeFilter: { SHOW_TEXT: 4 } })
  assert.equal(clientHalf.patchAll('98.460', 'session-a'), 0)
  assert.equal(dialog.valueOf(0), '99%')
  assert.equal(bubble.label.nodeValue, '80.9M tok · 缓存命中 99%')
})

test('withObserverPaused suspends observation across a DOM rewrite', () => {
  // A refinement writes text nodes while the observer watches the same subtree;
  // without a paused window those writes re-enter the callback and spin the
  // renderer. The rewrite must see a disconnected observer and a resumed one
  // with the same options afterwards.
  const calls = []
  const observer = {
    disconnect: () => calls.push('disconnect'),
    observe: (target, options) => calls.push({ target, options }),
  }
  const doc = { marker: 'body' }
  const clientHalf = loadClientHalf({ document: { body: doc } })
  const options = { childList: true, subtree: true, characterData: true }
  let sawDisconnected = false
  const result = clientHalf.withObserverPaused(observer, options, () => {
    sawDisconnected = calls.length === 1 && calls[0] === 'disconnect'
    return 'rewritten'
  })
  assert.equal(result, 'rewritten')
  assert.equal(sawDisconnected, true)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].target, doc)
  assert.deepEqual(calls[1].options, options)
})

test('withObserverPaused resumes observation when the rewrite throws', () => {
  const calls = []
  const observer = {
    disconnect: () => calls.push('disconnect'),
    observe: () => calls.push('observe'),
  }
  const clientHalf = loadClientHalf({ document: {} })
  assert.throws(
    () => clientHalf.withObserverPaused(observer, {}, () => { throw new Error('rewrite failed') }),
    /rewrite failed/,
  )
  assert.deepEqual(calls, ['disconnect', 'observe'])
})

test('withObserverPaused writes directly before an observer exists', () => {
  // The mount-time scan runs before MutationObserver is constructed, so it has
  // nothing to suspend and must still refine the readings.
  const clientHalf = loadClientHalf()
  assert.equal(clientHalf.withObserverPaused(null, {}, () => 42), 42)
})
