// Dev harness: what a physician sees in the CDSS panel. Exposed as window.__cdssMeasure().

// The decision map (layout `map`): the queue rows, the every-visit asks, the
// map cells and the plan, read from the data-visit-* / data-dp attributes the
// screen carries for exactly this. Null when the map is not on screen.
function measureVisit(panel, clean) {
  const screen = panel.querySelector('[data-testid="cdss-visit-screen"]')
  if (!screen) return null
  const y = (el) => Math.round(el.getBoundingClientRect().top + window.scrollY)
  const queue = [...screen.querySelectorAll('[data-visit-queue-row]')].map((row) => {
    const primary = row.querySelector('[data-visit-primary]')
    return {
      dp: row.dataset.visitQueueDp,
      currentDp: row.dataset.visitCurrentDp || null,
      state: row.dataset.visitQueueState,
      decided: row.dataset.decided === 'true',
      primary: primary ? clean(primary.textContent) : null,
      headline: clean(row.querySelector('[data-visit-headline]')?.textContent) || null,
      why: clean(row.querySelector('[data-visit-why]')?.textContent) || null,
      decidedText: clean(row.querySelector('[data-visit-decided]')?.textContent) || null,
      y: y(row),
    }
  })
  const asks = [...screen.querySelectorAll('button[data-visit-ask]')].map((button) => ({
    ask: button.dataset.visitAsk,
    value: button.dataset.value,
    label: clean(button.textContent),
    pressed: button.getAttribute('aria-pressed') === 'true',
    prefilled: button.dataset.prefilled === 'true',
    y: y(button),
  }))
  const cells = [...screen.querySelectorAll('[data-testid="cdss-visit-map"] button[data-dp]')].map((cell) => ({
    dp: cell.dataset.dp,
    state: cell.dataset.state,
    source: cell.dataset.source,
    decided: cell.dataset.decided === 'true',
    inQueue: cell.dataset.inQueue === 'true',
    block: cell.closest('[data-block]')?.dataset.block ?? null,
    text: clean(cell.textContent).slice(0, 120),
  }))
  const plan = screen.querySelector('[data-testid="cdss-visit-plan"]')
  const asksDetail = screen.querySelector('[data-testid="cdss-visit-asks-detail"]')
  return {
    stage: screen.dataset.stage,
    pack: screen.dataset.pack,
    headline: clean(screen.querySelector('#cdss-visit-headline')?.textContent),
    triggers: [...screen.querySelectorAll('[data-trigger]')].map((el) => clean(el.textContent)),
    progress: clean(screen.querySelector('[data-testid="cdss-visit-progress"]')?.textContent) || null,
    queue,
    asks,
    cells,
    foldedColumns: [...screen.querySelectorAll('[data-block][data-folded="true"]')].map((el) => el.dataset.block),
    // DP-03's fuller questions under the asks: whether they opened, and why.
    asksDetail: asksDetail ? {
      open: asksDetail.open,
      label: clean(asksDetail.querySelector('summary')?.textContent),
      reason: clean(asksDetail.querySelector('[data-testid="cdss-visit-asks-detail-reason"]')?.textContent) || null,
      y: y(asksDetail),
    } : null,
    plan: plan ? {
      returnVisit: clean(plan.querySelector('[data-testid="cdss-visit-plan-return"]')?.textContent) || null,
      items: [...plan.querySelectorAll('[data-plan-item]')].map((el) => ({ dp: el.dataset.dp, text: clean(el.textContent) })),
    } : null,
    timings: typeof window.__cdssDecisionTimings === 'function' ? window.__cdssDecisionTimings() : [],
  }
}

export function installMeasure() {
  window.__cdssMeasure = () => {
    const panel = document.querySelector('[data-testid="sim-right-panel"]') || document.body
    const DECISION = /^(已開立|劑量調整|已調整劑量|禁忌|有禁忌|暫緩|病人意願|依病人意願|已開單|已評估|已安排檢查|已處理)/
    const all = [...panel.querySelectorAll('details')]
    const detailsId = (d) => d.dataset.testid || d.id || `details#${all.indexOf(d)}`
    const closedChain = (el) => {
      const chain = []
      for (let p = el.parentElement; p && p !== panel; p = p.parentElement) {
        if (p.tagName === 'DETAILS' && !p.open) {
          const summary = p.querySelector(':scope > summary')
          if (!summary || !summary.contains(el)) chain.unshift(detailsId(p))
        }
      }
      return chain
    }
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
    const visibleText = clean(panel.innerText)
    const nodes = [...panel.querySelectorAll('[data-testid^="cdss-section-module-"], [data-testid^="cdss-hf-action-"], [id^="cdss-hf-action-"], [id^="af-action-"], [data-testid^="af-action-"]')]
    const seen = new Set()
    const modules = []
    for (const m of nodes) {
      const id = (m.dataset.testid || m.id).replace(/^(cdss-section-module-|cdss-hf-action-|af-action-)/, '')
      if (seen.has(id)) continue
      seen.add(id)
      const summary = m.tagName === 'DETAILS' ? m.querySelector(':scope > summary') : m
      const buttons = [...m.querySelectorAll('button')].map((b) => clean(b.textContent)).filter((t) => DECISION.test(t))
      const own = m.tagName === 'DETAILS' && !m.open ? [detailsId(m)] : []
      modules.push({
        id,
        behind: closedChain(m),
        open: own,
        y: Math.round(m.getBoundingClientRect().top + window.scrollY),
        summary: clean(summary && summary.textContent).slice(0, 160),
        summaryChars: clean(summary && summary.textContent).length,
        detailChars: clean(m.textContent).length,
        decisionButtons: [...new Set(buttons)].join('/'),
      })
    }
    const words = visibleText.match(/可立即處理|需處理|需臨床確認|需確認|需先補資料|需補資料|優先安全處理|目前無需處理|已處理|待處理/g) || []
    const tally = words.reduce((a, w) => { a[w] = (a[w] || 0) + 1; return a }, {})
    const ASK = /^(惡化|變差|穩定|進步|增加|不變|減少|是|否|有|無|暫不確認)$/
    const askSeen = new Set()
    const asks = []
    for (const b of panel.querySelectorAll('button')) {
      const t = clean(b.textContent)
      if (!ASK.test(t)) continue
      const chain = closedChain(b)
      const key = chain.join('>') + '|' + t
      if (askSeen.has(key)) continue
      askSeen.add(key)
      asks.push({ text: t, behind: chain, y: Math.round(b.getBoundingClientRect().top + window.scrollY) })
    }
    const summaries = [...panel.querySelectorAll('details > summary')].filter((sm) => closedChain(sm).length === 0).map((sm) => clean(sm.textContent).slice(0, 120))
    return { asks, summaries, firstPaintChars: visibleText.length, panelHeight: Math.round(panel.scrollHeight), statusTally: tally, header: visibleText.slice(0, 400), modules, visit: measureVisit(panel, clean) }
  }
}
