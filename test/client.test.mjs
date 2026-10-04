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

/** Materialize the client half through a stub module-loader facade. */
function loadClientHalf() {
  let registration
  const window = { __ModuleLoader__: { load: (value) => { registration = value } } }
  const react = {
    createElement: () => null,
    useRef: () => ({ current: null }),
    useLayoutEffect: () => undefined,
  }
  // eslint-disable-next-line no-new-func -- the file is a page script, not a module.
  new Function('window', 'document', 'NodeFilter', 'MutationObserver', source)(
    window, undefined, undefined, undefined,
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
