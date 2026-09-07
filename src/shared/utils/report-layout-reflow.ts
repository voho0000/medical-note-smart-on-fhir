// Restore only explicit layout cues. Never infer a missing measurement or
// split a flattened positional table into guessed clinical columns.
const ECHO_LABELS = [
  'IVSd', 'AO', 'LVPWd', 'LA', 'LVIDd', 'EDV', 'LVIDs', 'ESV',
  'EF(MM)', 'FS%', 'FS％', 'EF(biplane)', 'LV Mass', 'EF(A4C)',
  'Sep e`Vel', 'EF(A2C)', 'Sep a`Vel', 'RVIDd', 'E/Sep e`', 'TAPSE', 'E/Ave e`',
  'MR ERO', 'MV E/A', 'E/A Ratio', 'MV P1/2t', 'MVA P1/2t', 'MVA_Planimetry',
  'TR Vmax', 'TV PressG', 'TV P1/2t', 'TV Area', 'AR P1/2t', 'LVOT Diam',
  'LVOT Vmax', 'AVA(Vmax)', 'AV VmaxPG', 'AV Vmax', 'PV Vmax', 'PV PressG',
  'Spontaneous echo contrast:', 'LV Dias dysfunction:',
  'MR:', 'MS:', 'TR:', 'TS:', 'AR:', 'AS:', 'PR:', 'PS:',
  'ASD', 'PDA', 'VSD', 'TOF', '心跳:', '心律:',
]

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const echoLabelSource = ECHO_LABELS.sort((a, b) => b.length - a.length)
  .map((s) => escapeRegex(s).replaceAll('/', '[/／]')).join('|')
const echoBoundary = new RegExp(`(^|\\s+)(?=(?:${echoLabelSource})(?=\\s|$|[a-z]))`, 'g')
const echoRow = new RegExp(`^(${echoLabelSource})(?=\\s|$|[a-z])\\s*(.*)$`)

export function isDopplerEcho(raw: string): boolean {
  return /DOPPLER\s*[＆&]\s*ECHOCARDIOGRAPHIC REPORT/i.test(raw)
}

export function echoMeasurement(text: string): { label: string; value: string } | undefined {
  const match = echoRow.exec(text)
  return match ? { label: match[1], value: match[2] } : undefined
}

export function isUpperEndoscopyReport(text: string): boolean {
  return /HP FAST\s*[:：]/.test(text) && /Esophagus\s*[:：]/.test(text) &&
    /Stomach\s*[:：]/.test(text) && /Duodenum\s*[:：]/.test(text)
}

function reflowUpperEndoscopy(text: string): string {
  if (!isUpperEndoscopyReport(text)) return text

  return text
    .replace(/[ \t]+(?=[A-Z]\s*[:：]\s*BIOPSY\b)/g, '\n')
    // The source template can glue sentences even when a line wraps mid-word
    // group. Break only after word-ending periods, never inside 0.3CM / 4.58CM.
    .replace(/([a-z]{3,})\.[ \t]*(?=[A-Z])/g, '$1.\n')
    // Restore this unambiguous diagnosis-list template. Unknown diagnosis prose
    // retains its source lines; uppercase words alone do not imply list items.
    .replace(/(Diagnosis\s*[:：][ \t]*)(GU-S)[ \t]+(GASTRITIS)[ \t]+(GERD,\s*LA GRADE [A-D])[ \t]+(DUODENUM POLYP\b)/g,
      '$1\n$2\n$3\n$4\n$5')
}

export function reflowReportLayout(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n')
    .replace(/([-=_]{12,})/g, '\n$1\n')
    .replace(/[ \t]*(?=[●•]\s)/g, '\n')
    .replace(/[ \t]+(?=\d{1,2}[)＞]\s*[A-Za-z一-鿿])/g, '\n')

  if (/Endoscopy\s*[:：]/.test(text) && /(?:Pre-procedure assessment|Findings and interventions)\s*:/.test(text)) {
    text = text.replace(/([:：.])[ \t]+(?=[a-z]\.\s)/g, '$1\n')
  }

  if (isDopplerEcho(text)) {
    // Summary prose repeats these labels: only reflow the measurement section.
    const end = text.search(/\bConclusion\s*[:：]/)
    const body = end < 0 ? text : text.slice(0, end)
    text = body.replace(echoBoundary, '\n')
      .replace(/(二尖瓣|三尖瓣|主動脈瓣|肺動脈瓣|心包膜液|其他發現)\s*/g, '\n$1\n') +
      (end < 0 ? '' : text.slice(end))
  }

  if (/Left kidney size\s*:/i.test(text) && /Right kidney size\s*:/i.test(text)) {
    text = text.replace(/(^|\s+)\.(?=\s+[A-Za-z一-鿿])/g, '$1\n.')
      .replace(/[ \t]+(?=(?:Left|Right) kidney size:|The (?:left|right|cortical|urinary|bladder)\b|There are\b|No urinary\b)/g, '\n')
  }

  // ECG exports use runs of spaces in place of carriage returns. Do not apply
  // this to other reports, whose spaces may carry positional table information.
  if (/^\s*心電圖\s*[:：]/.test(text)) text = text.replace(/[ \t]{3,}/g, '\n')
  if (/Carotid Sonographic Data:/.test(text)) {
    const start = text.indexOf('Carotid Sonographic Data:')
    const end = text.indexOf('Diam:', start)
    const table = text.slice(start, end < 0 ? undefined : end)
      .replace(/[ \t]+(?=(?:Right|Left)\s+Diam|Carotid\s+\(cm\)|CCA (?:Prox|Mid|Dist)\b|(?:BIF|ECA|ICA|SCA|VA|OA)\s{2,})/g, '\n')
    text = text.slice(0, start) + table + (end < 0 ? '' : text.slice(end))
  }
  return reflowUpperEndoscopy(text)
}
