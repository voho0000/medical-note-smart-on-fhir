#!/usr/bin/env node
// Cloud-record-shaped revision. The original generator and v1 output remain
// reproducible; only its minimal (no progress-note) base is reused in memory.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { buildSyntheticOncologyBundle, validateBundleReferences, estimateTokens } = require('./generate-oncology-stress-bundle.cjs')

const BASE = 'https://synthetic.example.invalid/fhir'
const V2 = 'http://terminology.hl7.org/CodeSystem/v2-0074'
const dateAt = (offset) => new Date(Date.parse('2018-04-01T08:00:00Z') + offset * 86_400_000).toISOString()
const concept = (code, text) => ({ coding: [{ system: V2, code, display: text }], text })
const titles = {
  CXR: ['Chest X-ray AP portable', 'CXR portable', '胸部Ｘ光（床邊）', 'Chest radiograph AP'],
  CT: ['CT chest abdomen pelvis with contrast', '胸腹骨盆電腦斷層'],
  MRI: ['MRI spine with contrast', '脊椎磁振造影'],
  US: ['Abdominal ultrasound', '腹部超音波'],
  PATH: ['Surgical pathology - biopsy', '病理組織切片報告'],
  IHC: ['Pathology immunohistochemistry addendum', '病理免疫染色補充報告'],
  REVIEW: ['Outside pathology slide review', '外院病理玻片複閱'],
  CYTO: ['Pleural fluid cytopathology', '胸水細胞學報告'],
}

function reportBody(type, admission, serial, examDate) {
  const stage = admission < 40 ? 'bone' : admission < 70 ? 'bone and liver' : 'bone, liver and pleural'
  const accession = `SYN-${type}-${admission}-${serial}`
  const size = (12 + admission * 0.3 + (serial % 5)).toFixed(1)
  const previous = (Number(size) - (admission % 4 === 0 ? 2 : 0)).toFixed(1)
  const header = `SYNTHETIC TEST REPORT; no real patient. Accession ${accession}. Examination ${examDate.slice(0, 10)}.`
  if (type === 'CXR') {
    const finding = ['No significant interval change.', 'Minimal bibasal linear atelectasis, unchanged.',
      'Small left pleural effusion with adjacent basal opacity.', 'Mild interval improvement of left basal opacity.',
      'Low lung volume with crowding of basal markings.', 'No new focal air-space consolidation.',
      'Stable mild interstitial prominence.', 'Slightly increased left basilar opacity.'][((admission * 3) + serial) % 8]
    return [header, 'INDICATION: inpatient chest follow-up; serial comparison during acute illness.',
      'TECHNIQUE: portable AP chest radiograph. Mild rotation and limited inspiration reduce assessment of the lung bases.',
      'COMPARISON: preceding chest radiograph in this admission. Differences in positioning limit direct comparison.',
      `FINDINGS: ${finding} Cardiomediastinal silhouette is unchanged allowing for AP magnification. Central venous access tip projects over the lower superior vena cava. No visible pneumothorax. No new gross change of the visualized osseous structures.`,
      `IMPRESSION: ${finding} Stable line position. Portable radiography has limited sensitivity for small pulmonary nodules and subtle pleural disease.`].join('\n')
  }
  if (type === 'CT') return [header,
    `CLINICAL INFORMATION: breast malignancy with known ${stage} involvement; comparison during a subsequent treatment interval.`,
    'TECHNIQUE: volumetric examination of chest, abdomen and pelvis with multiplanar reconstructions. Venous-phase abdominal images are available. Respiratory motion and streak artifact from the implanted access device mildly reduce local assessment. This is a synthetic text report with no associated real images.',
    'COMPARISON: prior cross-sectional examination and intervening chest radiographs. Differences in slice thickness, respiratory phase and enhancement timing are noted. Measurements below describe individual indexed findings rather than a calculated response category.',
    `LUNGS AND AIRWAYS: mild dependent linear atelectatic change. A right middle-lobe perifissural density is unchanged. No new lobar collapse. The central airways remain patent. Several tiny subpleural nodules remain too small for confident characterization. The radiographic basal opacity is partly related to dependent atelectasis.`,
    `PLEURA AND MEDIASTINUM: ${admission < 70 ? 'No pleural nodularity or measurable pleural lesion. Trace dependent fluid may fluctuate between examinations.' : 'Small left pleural effusion with irregular pleural thickening, similar in distribution to the recent comparison study.'} No pericardial effusion. Small mediastinal nodes remain below conventional enlargement criteria. Port catheter terminates in the lower superior vena cava.`,
    `LIVER AND BILIARY TREE: ${admission < 40 ? 'No definite focal hepatic metastatic lesion. A small low-density cyst remains unchanged.' : `Indexed segment VI lesion measures ${size} mm, previously ${previous} mm. Additional smaller low-attenuation foci are similar in distribution. No acute hemorrhage within the indexed lesion.`} No intrahepatic biliary dilatation. Gallbladder is not distended. A small dependent gallstone is again seen without surrounding inflammatory change.`,
    'PANCREAS, SPLEEN AND ADRENALS: no focal pancreatic abnormality or duct dilatation. Spleen is not enlarged. Mild nodular adrenal thickening is stable. These incidental observations are described separately from the known sites of metastatic disease.',
    'KIDNEYS AND URINARY TRACT: symmetric enhancement. Small cortical cysts remain unchanged. No hydronephrosis, obstructing calculus or perinephric collection. Urinary bladder is partially distended; wall assessment is limited by underdistention. No new retroperitoneal soft-tissue mass.',
    'BOWEL AND PERITONEUM: moderate colonic stool burden without bowel obstruction. No free air. No rim-enhancing intra-abdominal collection. Scattered small mesenteric nodes remain nonspecific. No definite new peritoneal implant. Trace pelvic fluid is variable across the available examinations.',
    `BONES AND SOFT TISSUES: multifocal mixed sclerotic osseous lesions in the thoracolumbar spine and pelvis. Indexed iliac lesion measures ${size} mm, previously ${previous} mm using the same plane. No new displaced fracture. Degenerative changes and a stable mild vertebral wedge deformity are present. Prior breast surgery changes remain unchanged without a new chest-wall mass.`,
    `IMPRESSION: known ${stage} abnormalities with the above serial measurements. No new acute obstructive or perforating abdominal process. Dependent lung changes and incidental findings remain relevant limitations when comparing reports. Lesion measurements form an artificial stress-test series and do not establish a validated RECIST response.`].join('\n')
  if (type === 'MRI') return [header,
    'CLINICAL INFORMATION: known osseous metastatic disease; reassessment of back pain and vertebral lesions.',
    'TECHNIQUE: sagittal and axial T1, T2 and fluid-sensitive sequences with postcontrast imaging. Motion artifact is present on several axial slices. Coverage is of the thoracolumbar spine; structures outside this field are not evaluated.',
    `MARROW: multifocal abnormal marrow signal corresponds to previously described osseous lesions. An indexed vertebral focus measures ${size} mm, previously ${previous} mm on the corresponding plane. Heterogeneous background marrow signal reduces lesion conspicuity. No new diffuse vertebral body collapse is identified.`,
    'ALIGNMENT AND VERTEBRAL HEIGHT: preserved overall alignment. A mild chronic anterior wedge deformity is stable. No retropulsed bone fragment. Small endplate degenerative signal changes are present at the lower lumbar levels and are distinct from the more focal marrow abnormalities.',
    'CANAL AND CORD: no definite epidural soft-tissue mass on the available sequences. Spinal cord and conus show no focal signal abnormality. No new high-grade canal compromise. Assessment of tiny intradural lesions is limited by motion and the coverage of this examination.',
    'DISCS AND NEURAL FORAMINA: multilevel disc desiccation with broad-based lower lumbar disc bulges. Mild bilateral foraminal narrowing is unchanged. Facet arthropathy contributes to the degenerative narrowing. These findings are longstanding and need to be distinguished from the malignant marrow process.',
    'PARASPINAL SOFT TISSUES: no drainable paraspinal collection or bulky soft-tissue component. Mild muscle volume loss. Partially visualized upper abdominal structures are incompletely assessed and are better described in the dedicated cross-sectional report.',
    'COMPARISON LIMITATIONS: differences in field of view, slice angle and marrow background signal affect the apparent size of small lesions. The report retains the individual measurements and technical limitations without assigning a whole-patient response category.',
    'IMPRESSION: multifocal marrow lesions with no new pathologic collapse or definite epidural extension in this synthetic examination. Stable degenerative disc and facet changes. No new high-grade canal narrowing. This text is fabricated and is not an interpretation of actual MRI images.'].join('\n')
  if (type === 'US') return [header,
    'INDICATION: abnormal liver chemistry and abdominal discomfort. TECHNIQUE: grayscale and color Doppler abdominal ultrasound. Bowel gas and body habitus limit portions of the pancreas and the deep liver dome.',
    `LIVER: ${admission < 40 ? 'mild heterogeneous echotexture without a definite focal solid lesion in the visualized portions.' : `several hypoechoic lesions; an indexed right-lobe focus measures ${size} mm. Direct comparison with CT is limited by scan plane and lesion visibility.`}`,
    'BILIARY TREE: no intrahepatic duct dilatation. A small gallstone is again noted; no pericholecystic fluid. KIDNEYS: no hydronephrosis; small simple cortical cysts. SPLEEN: no splenomegaly. No large-volume ascites.',
    'IMPRESSION: limited serial study with the above findings. No biliary obstruction or hydronephrosis. Portions obscured by bowel gas are not characterized.'].join('\n')
  if (type === 'CYTO') return [header,
    'SPECIMEN: left pleural fluid. Preparations include direct smears and a cell block. This is a fabricated specimen; accession numbers have no connection to any clinical laboratory.',
    `ADEQUACY: ${serial % 3 === 0 ? 'paucicellular preparation with scant material remaining in the cell block.' : 'satisfactory cellularity for morphologic assessment.'}`,
    `MICROSCOPY: mesothelial cells, macrophages and a mixed inflammatory background. ${admission < 70 ? 'No definite malignant epithelial population is identified in the examined preparations.' : 'Small cohesive groups of atypical epithelial cells with irregular nuclei and focal gland-like architecture are identified.'}`,
    `INTERPRETATION: ${admission < 70 ? 'Negative for malignant cells in this sample. A negative fluid sample does not characterize unsampled pleural tissue.' : 'Malignant cells present, morphologically compatible with the known breast primary in this synthetic case.'}`,
    'COMMENT: fluid cellularity, processing and sampling affect sensitivity. The cytology interpretation is separate from the radiologic finding of pleural fluid. Comparison with prior tissue morphology is documented under the corresponding histology accession.'].join('\n')
  const site = admission < 40 ? 'iliac bone core biopsy' : admission < 70 ? 'liver core biopsy' : 'pleural tissue biopsy'
  const sharedPathology = [header, `SPECIMEN: ${site}; tissue accession SYN-TISSUE-${admission}. Related reports retain this accession across histology, immunostain addendum and slide review.`,
    'CLINICAL INFORMATION: previous breast carcinoma with metastatic recurrence. Relevant prior morphology and the supplied radiology summary are available for comparison. The tissue represents one sampled site and is not a survey of all radiologic abnormalities.',
    'GROSS DESCRIPTION: multiple tan-white tissue fragments submitted in labeled cassettes. Representative tissue is processed for routine sections. The sample is fragmented; orientation and excision margins cannot be assessed. No grossly intact resection specimen is provided.',
    'MICROSCOPIC DESCRIPTION: infiltrating malignant epithelial cells arranged in irregular nests and small gland-like groups within fibrous stroma. The nuclei show moderate pleomorphism and visible nucleoli. Focal crush artifact limits evaluation in a small portion of the specimen. Viable tissue is present for the selected immunostains. No separate primary tumor architecture is identified within the sampled fragments.',
    `TUMOR EXTENT: invasive carcinoma is present within the submitted ${site}. The sampled tissue cannot establish the overall size of the radiologic lesion. Lymphovascular spaces are not adequately represented for a confident assessment. No surgical margin status or lymph-node count is assigned to this core biopsy.`,
    'IMMUNOPHENOTYPE: staining is interpreted in conjunction with morphology and the known history. In the fabricated panel, tumor cells express epithelial markers and a breast-lineage marker. Estrogen receptor staining is retained; progesterone receptor staining is heterogeneous. HER2 immunohistochemistry is scored 1+ in the viable sampled tumor. Internal controls are satisfactory. These are invented test observations, not a validated biomarker assay.',
    'LIMITATIONS: fixation, tissue processing, scant tumor and intratumoral heterogeneity may affect comparisons between samples. Bone samples have additional decalcification-related limitations. Different anatomical sites and different assay runs are not interchangeable. A change in staining intensity alone is not reported as proof of a new tumor lineage.',
    'DIAGNOSIS: metastatic carcinoma, compatible with the documented breast primary in the supplied synthetic clinical setting. The diagnosis applies to this accession and sampled site. Correlation with independently dated imaging and previous tissue reports is recorded without assigning an imaging response category.',
    'MATERIAL AND REVIEW: representative slides are retained under the synthetic accession. No germline result is provided. The report contains no actionable systemic treatment recommendation. Additional morphology or ancillary-test findings, when represented, remain in a separately dated addendum with the same specimen identifier.']
  if (type === 'IHC') sharedPathology.splice(2, 0, 'ADDENDUM: additional immunostains are now available for the existing tissue accession. This is not a new biopsy or new metastatic event. The original morphologic diagnosis is unchanged. Receptor results are reported with the tissue-specific limitations below.')
  if (type === 'REVIEW') sharedPathology.splice(2, 0, 'OUTSIDE SLIDE REVIEW: submitted slides from the referring synthetic hospital were reviewed. No additional tissue was collected for this report. Findings are concordant with the original diagnosis; variations in descriptive wording do not represent a separate tumor specimen.')
  return sharedPathology.join('\n')
}

function buildCloudOncologyBundle({ targetTokens = 1_100_000 } = {}) {
  if (!Number.isInteger(targetTokens) || targetTokens < 1 || targetTokens > 4_000_000) throw new Error('Invalid targetTokens (1..4000000)')
  const base = buildSyntheticOncologyBundle({ targetTokens: 1 })
  const bundle = base.bundle
  bundle.id = 'synthetic-cloud-oncology-v2'
  bundle.entry = bundle.entry.filter(({ resource }) => resource.resourceType !== 'DiagnosticReport'
    && resource.resourceType !== 'CarePlan'
    && !resource.id.startsWith('synthetic-progress-')
    && !(resource.category ?? []).some?.(category => category.coding?.some(coding => coding.code === 'vital-signs')))
  // Remove references in the inherited discharge narrative to data absent from
  // this cloud-shaped revision. No patient data is read or persisted as input.
  const clean = text => text.replaceAll('The latest temperature observations and dated blood counts', 'The dated blood counts')
    .replaceAll('Transfer summaries and outpatient notes', 'Discharge summaries and outpatient encounter records')
  for (const { resource } of bundle.entry) {
    for (const section of resource.section ?? []) if (section.text?.div) section.text.div = clean(section.text.div)
    for (const content of resource.content ?? []) {
      const attachment = content.attachment
      if (!attachment?.data) continue
      const bytes = Buffer.from(clean(Buffer.from(attachment.data, 'base64').toString('utf8')), 'utf8')
      attachment.data = bytes.toString('base64'); attachment.size = bytes.length
    }
  }
  const reportCounts = Object.fromEntries(Object.keys(titles).map(type => [type, 0]))
  let reportTokens = 0
  const addReport = (type, a, serial, offset, outpatient = null) => {
    const examDate = dateAt(a * 32 + offset)
    const body = reportBody(type, a, serial, examDate)
    const category = ['PATH', 'IHC', 'REVIEW'].includes(type) ? 'SP' : type === 'CYTO' ? 'CP' : 'RAD'
    const id = `synthetic-cloud-${type.toLowerCase()}-${a}-${serial}`
    const resource = { resourceType: 'DiagnosticReport', id, status: type === 'IHC' ? 'appended' : 'final',
      meta: bundle.meta, category: [concept(category, category === 'RAD' ? 'Radiology' : 'Pathology')],
      identifier: [{ system: `${BASE}/report-accession`, value: `SYN-${type}-${a}-${serial}` }],
      code: { coding: [{ system: `${BASE}/report-type`, code: type }], text: titles[type][a % titles[type].length] },
      subject: { reference: `Patient/${base.bundle.entry[0].resource.id}` },
      encounter: { reference: outpatient === null ? `Encounter/synthetic-admission-${a}` : `Encounter/synthetic-outpatient-${a}-${outpatient}` },
      effectiveDateTime: examDate, issued: examDate, performer: [{ reference: `Organization/synthetic-org-${a % 3}` }],
    }
    // Some cloud exports carry inline report attachments. Keep the body in one
    // place per report, rather than duplicating it in conclusion + attachment.
    if (serial % 5 === 0) {
      resource.presentedForm = [{ contentType: 'text/plain', title: `${type} complete report`, data: Buffer.from(body, 'utf8').toString('base64') }]
    } else resource.conclusion = body
    if (['PATH', 'IHC', 'REVIEW', 'CYTO'].includes(type)) {
      const tissueType = type === 'CYTO' ? 'fluid' : 'tissue'
      resource.specimen = [{ reference: `Specimen/synthetic-${tissueType}-${a}` }]
    }
    reportTokens += estimateTokens(body)
    reportCounts[type]++
    bundle.entry.push({ fullUrl: `${BASE}/DiagnosticReport/${id}`, resource })
  }
  for (let a = 0; a < 96; a++) {
    // Daily inpatient CXR makes a large, mostly low-information comparison
    // series. These are short reports, with stable titles for latest-by-name.
    for (let d = 0; d < 14; d++) addReport('CXR', a, d, d)
    for (let r = 0; r < 4; r++) addReport('CT', a, r, 1 + r * 3)
    for (let r = 0; r < 2; r++) {
      addReport('MRI', a, r, 3 + r * 6)
      addReport('US', a, r, 2 + r * 6)
    }
    if (a % 2 === 0) {
      const subject = { reference: `Patient/${base.bundle.entry[0].resource.id}` }
      for (const type of ['tissue', 'fluid']) {
        if (type === 'fluid' && a < 70) continue
        const id = `synthetic-${type}-${a}`
        const resource = { resourceType: 'Specimen', id, meta: bundle.meta, status: 'available', subject,
          identifier: [{ system: `${BASE}/specimen-accession`, value: `SYN-${type.toUpperCase()}-${a}` }],
          type: { text: type === 'fluid' ? 'Pleural fluid' : a < 40 ? 'Bone core tissue' : a < 70 ? 'Liver core tissue' : 'Pleural tissue' },
          collection: { collectedDateTime: dateAt(a * 32 + 3) } }
        bundle.entry.push({ fullUrl: `${BASE}/Specimen/${id}`, resource })
      }
      addReport('PATH', a, 0, 5)
      addReport('IHC', a, 0, 8)
      addReport('REVIEW', a, 0, 11)
      if (a >= 70) addReport('CYTO', a, 0, 7)
    }
  }
  // Re-measure cleaned document bodies without relying on the old fixture's
  // rounded count. The app integration test measures its real formatted view.
  let documentTokens = 0
  for (const { resource } of bundle.entry) {
    const html = resource.resourceType === 'Composition'
      ? (resource.section ?? []).map(s => s.text?.div ?? '').join('\n')
      : resource.resourceType === 'DocumentReference'
        ? (resource.content ?? []).map(c => Buffer.from(c.attachment?.data ?? '', 'base64').toString('utf8')).join('\n') : ''
    if (html) documentTokens += estimateTokens(html.replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').trim())
  }
  // Reach the requested uncompressed load with additional dated outpatient
  // cross-sectional report series, never progress notes or oversized CXR text.
  for (let round = 0; reportTokens + documentTokens < targetTokens && round < 30; round++) {
    for (let a = 0; a < 96 && reportTokens + documentTokens < targetTokens; a++) {
      const visit = round % 3
      addReport(round % 2 === 0 ? 'CT' : 'MRI', a, 100 + round, 18 + visit * 4, visit)
    }
  }
  if (reportTokens + documentTokens < targetTokens) throw new Error('Target exceeds bounded report capacity')
  const resourceCounts = bundle.entry.reduce((counts, { resource }) => { counts[resource.resourceType] = (counts[resource.resourceType] ?? 0) + 1; return counts }, {})
  return { bundle, manifest: { generatorVersion: 2, variant: 'cloud-record-report-heavy', asOf: bundle.timestamp, syntheticOnly: true,
    targetNarrativeTokens: targetTokens, estimatedReportBodyTokens: reportTokens, estimatedDocumentBodyTokens: documentTokens,
    estimatedNarrativeTokens: documentTokens + reportTokens, reportCounts, resourceCounts,
    progressNotes: 0, vitalSigns: 0, dischargeSummaries: 96, newestDocumentId: 'synthetic-newest-non-discharge', latestDischargeId: 'synthetic-discharge-95',
    tokenMetric: 'MediPrisma heuristic on decoded report and discharge narrative; before filtering/fitting, not JSON bytes or model-specific exact tokens.',
    limitations: ['Fully fabricated. No real patient or demo chart input. Not for clinical decisions.',
      'Extreme stress fixture with intentionally inflated examination frequency; not a representative patient or recommended imaging schedule.',
      'Repeated short CXR reports are low-information noise. Histology/addendum/review share a specimen and are not three new biopsy events.',
      'Body text occurs only once per DiagnosticReport; some reports use base64 presentedForm.',
      'No progress notes, vital-sign resources, image binaries or full HL7 validator certification.'] } }
}

if (require.main === module) {
  const targetTokens = process.argv[2] === undefined ? 1_100_000 : Number(process.argv[2])
  const { bundle, manifest } = buildCloudOncologyBundle({ targetTokens })
  manifest.referenceValidation = validateBundleReferences(bundle)
  const json = JSON.stringify(bundle, null, 2) + '\n'
  manifest.jsonBytes = Buffer.byteLength(json)
  manifest.sha256 = createHash('sha256').update(json).digest('hex')
  const directory = path.resolve(__dirname, '..', 'artifacts', 'synthetic-oncology')
  fs.mkdirSync(directory, { recursive: true })
  const output = path.join(directory, `synthetic-cloud-oncology-v2-${targetTokens}-tokens.fhir.json`)
  if (fs.existsSync(output) && fs.readFileSync(output, 'utf8') !== json) throw new Error(`Refusing to overwrite different fixture: ${output}`)
  fs.writeFileSync(output, json)
  fs.writeFileSync(output.replace('.fhir.json', '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...manifest }, null, 2))
}

module.exports = { buildCloudOncologyBundle, reportBody }
