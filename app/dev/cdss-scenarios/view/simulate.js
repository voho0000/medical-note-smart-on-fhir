// Dev harness: a simulated cardiologist on the decision map. Answers the
// every-visit questions the way the scenario says, then presses the primary
// button of every queued row (following each chain to its next step) and
// records what was read and pressed. Exposed as window.__cdssSimulate(visit).
const ANSWER_VALUE = {
  'dyspnoea-trend': { 變差: 'worse', 穩定: 'stable', 進步: 'better' },
  'weight-trend': { 增加: 'up', 不變: 'same', 減少: 'down' },
  'af-symptoms': { 有: 'yes', 無: 'no' },
  bleeding: { 有: 'yes', 無: 'no' },
}
const VISIT_KEY = { dyspnea: 'dyspnoea-trend', weight: 'weight-trend', afSymptoms: 'af-symptoms', bleeding: 'bleeding' }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()

export function installSimulate() {
  window.__cdssSimulate = async (visit = {}) => {
    const screen = () => document.querySelector('[data-testid="cdss-visit-screen"]')
    if (!screen()) return { error: 'map not on screen' }
    const steps = []
    // 1. Every-visit answers.
    for (const [key, label] of Object.entries(visit)) {
      const ask = VISIT_KEY[key]
      const value = ANSWER_VALUE[ask]?.[label]
      if (!ask || !value) continue
      const button = screen().querySelector(`button[data-visit-ask="${ask}"][data-value="${value}"]`)
      if (!button) { steps.push({ kind: 'ask-missing', ask, value }); continue }
      if (button.getAttribute('aria-pressed') === 'true') {
        steps.push({ kind: 'ask-prefilled', ask, value, prefilled: button.dataset.prefilled === 'true' })
        continue
      }
      button.click()
      steps.push({ kind: 'ask', ask, value })
      await sleep(600)
    }
    // 2. The queue, top to bottom, following chains.
    for (let guard = 0; guard < 12; guard += 1) {
      const row = [...screen().querySelectorAll('[data-visit-queue-row]')].find((candidate) => (
        candidate.dataset.decided !== 'true' && candidate.querySelector('[data-visit-primary]')
      ))
      if (!row) break
      const primary = row.querySelector('[data-visit-primary]')
      const headline = clean(row.querySelector('[data-visit-headline]')?.textContent)
      const why = clean(row.querySelector('[data-visit-why]')?.textContent)
      steps.push({
        kind: 'decide',
        dp: row.dataset.visitCurrentDp || row.dataset.visitQueueDp,
        state: row.dataset.visitQueueState,
        headline,
        why,
        primary: clean(primary.textContent),
      })
      primary.click()
      await sleep(700)
    }
    const after = window.__cdssMeasure().visit
    return { steps, after }
  }
}
