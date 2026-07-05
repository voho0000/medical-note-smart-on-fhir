import type { CalculatorDef, L } from '../types'
import { yesNoQuestionnaire, scoredQuestionnaire, PHQ_SCALE } from './_shared'

export const MENTAL: CalculatorDef[] = [
  // ── GDS-15 (Geriatric Depression Scale) — patient self-report ───────────
    yesNoQuestionnaire({
      id: 'gds-15',
      name: { en: 'Geriatric Depression Scale (GDS-15)', zh: '老年憂鬱量表 (GDS-15)' },
      category: 'mental',
      audience: 'both',
      blurb: { en: 'Depression screen; can be self-completed.', zh: '憂鬱篩檢；可由本人自填。' },
      items: [
        { key: 'q1', scoreOn: 'no', label: { en: 'Are you basically satisfied with your life?', zh: '您對生活大致上滿意嗎？' } },
        { key: 'q2', scoreOn: 'yes', label: { en: 'Have you dropped many of your activities and interests?', zh: '您是否減少了很多活動和興趣？' } },
        { key: 'q3', scoreOn: 'yes', label: { en: 'Do you feel that your life is empty?', zh: '您是否覺得生活空虛？' } },
        { key: 'q4', scoreOn: 'yes', label: { en: 'Do you often get bored?', zh: '您是否常常感到無聊？' } },
        { key: 'q5', scoreOn: 'no', label: { en: 'Are you in good spirits most of the time?', zh: '您大部分時間精神都很好嗎？' } },
        { key: 'q6', scoreOn: 'yes', label: { en: 'Are you afraid something bad will happen to you?', zh: '您是否害怕會有不好的事情發生在自己身上？' } },
        { key: 'q7', scoreOn: 'no', label: { en: 'Do you feel happy most of the time?', zh: '您大部分時間感到快樂嗎？' } },
        { key: 'q8', scoreOn: 'yes', label: { en: 'Do you often feel helpless?', zh: '您是否常常感到無助？' } },
        { key: 'q9', scoreOn: 'yes', label: { en: 'Do you prefer to stay home rather than going out?', zh: '您是否寧願待在家裡，而不願外出？' } },
        { key: 'q10', scoreOn: 'yes', label: { en: 'Do you feel you have more memory problems than most?', zh: '您是否覺得記憶力比大多數人差？' } },
        { key: 'q11', scoreOn: 'no', label: { en: 'Do you think it is wonderful to be alive now?', zh: '您是否覺得現在能活著是很美好的事？' } },
        { key: 'q12', scoreOn: 'yes', label: { en: 'Do you feel pretty worthless the way you are now?', zh: '您是否覺得自己現在活得沒有價值？' } },
        { key: 'q13', scoreOn: 'no', label: { en: 'Do you feel full of energy?', zh: '您是否覺得精力充沛？' } },
        { key: 'q14', scoreOn: 'yes', label: { en: 'Do you feel that your situation is hopeless?', zh: '您是否覺得自己的處境沒有希望？' } },
        { key: 'q15', scoreOn: 'yes', label: { en: 'Do you think most people are better off than you are?', zh: '您是否覺得大部分人都過得比您好？' } },
      ],
      interpret: (score) => {
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (score <= 4) { interp = { en: 'Normal (0–4)', zh: '正常（0–4）' }; severity = 'normal' }
        else if (score <= 8) { interp = { en: 'Suggests mild depression (5–8)', zh: '疑似輕度憂鬱（5–8）' }; severity = 'moderate' }
        else if (score <= 11) { interp = { en: 'Suggests moderate depression (9–11)', zh: '疑似中度憂鬱（9–11）' }; severity = 'high' }
        else { interp = { en: 'Suggests severe depression (12–15)', zh: '疑似重度憂鬱（12–15）' }; severity = 'high' }
        return { value: `${score} / 15`, interpretation: interp, severity }
      },
      reference: 'Sheikh & Yesavage 1986. ≥ 5 suggests depression — a screen, not a diagnosis; discuss with a clinician.',
    }),

  // ── PHQ-9 (depression) — patient self-report ────────────────────────────
    scoredQuestionnaire({
      id: 'phq-9',
      name: { en: 'PHQ-9 (Depression)', zh: 'PHQ-9 憂鬱症篩檢' },
      category: 'mental',
      audience: 'both',
      blurb: { en: 'Depression severity; self-reported.', zh: '憂鬱嚴重度；可自填。' },
      scale: PHQ_SCALE,
      items: [
        { key: 'q1', label: { en: 'Little interest or pleasure in doing things', zh: '做事沒興趣或沒樂趣' } },
        { key: 'q2', label: { en: 'Feeling down, depressed, or hopeless', zh: '心情低落、沮喪或絕望' } },
        { key: 'q3', label: { en: 'Trouble sleeping, or sleeping too much', zh: '難入睡、易醒或睡太多' } },
        { key: 'q4', label: { en: 'Feeling tired or having little energy', zh: '疲倦或沒有精力' } },
        { key: 'q5', label: { en: 'Poor appetite or overeating', zh: '食慾不振或吃太多' } },
        { key: 'q6', label: { en: 'Feeling bad about yourself or like a failure', zh: '覺得自己很糟或很失敗' } },
        { key: 'q7', label: { en: 'Trouble concentrating', zh: '注意力難以集中' } },
        { key: 'q8', label: { en: 'Moving/speaking slowly, or being restless', zh: '動作或說話變慢，或坐立不安' } },
        { key: 'q9', label: { en: 'Thoughts of being better off dead or self-harm', zh: '覺得死了較好或想傷害自己' } },
      ],
      interpret: (s) => {
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (s <= 4) { interp = { en: '0–4 minimal', zh: '0–4 極輕微' }; severity = 'normal' }
        else if (s <= 9) { interp = { en: '5–9 mild', zh: '5–9 輕度' }; severity = 'moderate' }
        else if (s <= 14) { interp = { en: '10–14 moderate', zh: '10–14 中度' }; severity = 'high' }
        else if (s <= 19) { interp = { en: '15–19 moderately severe', zh: '15–19 中重度' }; severity = 'high' }
        else { interp = { en: '20–27 severe', zh: '20–27 重度' }; severity = 'high' }
        return { value: `${s} / 27`, interpretation: interp, severity }
      },
      reference: 'Kroenke K, et al. 2001. ≥ 10 suggests major depression; if Q9 > 0, assess safety.',
    }),

  // ── GAD-7 (anxiety) — patient self-report ───────────────────────────────
    scoredQuestionnaire({
      id: 'gad-7',
      name: { en: 'GAD-7 (Anxiety)', zh: 'GAD-7 焦慮症篩檢' },
      category: 'mental',
      audience: 'both',
      blurb: { en: 'Anxiety severity; self-reported.', zh: '焦慮嚴重度；可自填。' },
      scale: PHQ_SCALE,
      items: [
        { key: 'q1', label: { en: 'Feeling nervous, anxious, or on edge', zh: '感到緊張、焦慮或坐立不安' } },
        { key: 'q2', label: { en: 'Not being able to stop or control worrying', zh: '無法停止或控制擔憂' } },
        { key: 'q3', label: { en: 'Worrying too much about different things', zh: '對很多事情過度擔心' } },
        { key: 'q4', label: { en: 'Trouble relaxing', zh: '難以放鬆' } },
        { key: 'q5', label: { en: 'Being so restless it is hard to sit still', zh: '坐立難安' } },
        { key: 'q6', label: { en: 'Becoming easily annoyed or irritable', zh: '容易生氣或易怒' } },
        { key: 'q7', label: { en: 'Feeling afraid as if something awful might happen', zh: '害怕好像會有可怕的事發生' } },
      ],
      interpret: (s) => {
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (s <= 4) { interp = { en: '0–4 minimal', zh: '0–4 極輕微' }; severity = 'normal' }
        else if (s <= 9) { interp = { en: '5–9 mild', zh: '5–9 輕度' }; severity = 'moderate' }
        else if (s <= 14) { interp = { en: '10–14 moderate', zh: '10–14 中度' }; severity = 'high' }
        else { interp = { en: '15–21 severe', zh: '15–21 重度' }; severity = 'high' }
        return { value: `${s} / 21`, interpretation: interp, severity }
      },
      reference: 'Spitzer RL, et al. 2006. ≥ 10 warrants further evaluation.',
    }),

  // ── CAGE (alcohol) — patient self-report ────────────────────────────────
    yesNoQuestionnaire({
      id: 'cage',
      name: { en: 'CAGE (Alcohol)', zh: 'CAGE 酒精篩檢' },
      category: 'mental',
      audience: 'both',
      blurb: { en: 'Brief alcohol-use screen.', zh: '簡短飲酒問題篩檢。' },
      items: [
        { key: 'c', scoreOn: 'yes', label: { en: 'Felt you should Cut down on drinking?', zh: '曾覺得應該減少飲酒？' } },
        { key: 'a', scoreOn: 'yes', label: { en: 'Been Annoyed by criticism of your drinking?', zh: '別人批評你喝酒讓你不悅？' } },
        { key: 'g', scoreOn: 'yes', label: { en: 'Felt Guilty about drinking?', zh: '曾對飲酒感到愧疚？' } },
        { key: 'e', scoreOn: 'yes', label: { en: 'Had a morning drink (Eye-opener)?', zh: '早上需喝酒才能提神（醒酒）？' } },
      ],
      interpret: (s) => ({
        value: `${s} / 4`,
        interpretation: s >= 2
          ? { en: '≥ 2 — clinically significant; assess further', zh: '≥ 2 — 有臨床意義，需進一步評估' }
          : { en: 'Low concern', zh: '較無疑慮' },
        severity: s >= 2 ? 'high' : s === 1 ? 'moderate' : 'normal',
      }),
      reference: 'Ewing 1984. ≥ 2 is clinically significant for alcohol use disorder.',
    }),

  // ── AUDIT-C (alcohol) — patient self-report ─────────────────────────────
    scoredQuestionnaire({
      id: 'audit-c',
      name: { en: 'AUDIT-C (Alcohol)', zh: 'AUDIT-C 飲酒篩檢' },
      category: 'mental',
      audience: 'both',
      blurb: { en: 'Alcohol consumption screen.', zh: '飲酒量篩檢。' },
      items: [
        { key: 'freq', label: { en: 'How often do you have a drink containing alcohol?', zh: '您多常喝含酒精的飲料？' }, options: [
          { label: { en: 'Never', zh: '從不' }, points: 0 },
          { label: { en: 'Monthly or less', zh: '每月一次或更少' }, points: 1 },
          { label: { en: '2–4 times a month', zh: '每月 2–4 次' }, points: 2 },
          { label: { en: '2–3 times a week', zh: '每週 2–3 次' }, points: 3 },
          { label: { en: '≥ 4 times a week', zh: '每週 ≥ 4 次' }, points: 4 },
        ] },
        { key: 'amount', label: { en: 'How many drinks on a typical drinking day?', zh: '喝酒的日子通常喝幾杯？' }, options: [
          { label: { en: '1–2', zh: '1–2' }, points: 0 },
          { label: { en: '3–4', zh: '3–4' }, points: 1 },
          { label: { en: '5–6', zh: '5–6' }, points: 2 },
          { label: { en: '7–9', zh: '7–9' }, points: 3 },
          { label: { en: '≥ 10', zh: '≥ 10' }, points: 4 },
        ] },
        { key: 'binge', label: { en: 'How often do you have ≥ 6 drinks on one occasion?', zh: '多常一次喝 ≥ 6 杯？' }, options: [
          { label: { en: 'Never', zh: '從不' }, points: 0 },
          { label: { en: 'Less than monthly', zh: '少於每月一次' }, points: 1 },
          { label: { en: 'Monthly', zh: '每月' }, points: 2 },
          { label: { en: 'Weekly', zh: '每週' }, points: 3 },
          { label: { en: 'Daily or almost daily', zh: '每天或幾乎每天' }, points: 4 },
        ] },
      ],
      interpret: (s) => ({
        value: `${s} / 12`,
        interpretation: s >= 4
          ? { en: '≥ 4 (M) / ≥ 3 (F) suggests hazardous drinking', zh: '≥ 4（男）/ ≥ 3（女）疑似危害性飲酒' }
          : { en: 'Low risk', zh: '低風險' },
        severity: s >= 4 ? 'high' : s >= 3 ? 'moderate' : 'normal',
      }),
      reference: 'Bush K, et al. 1998. Positive: ≥ 4 (men) / ≥ 3 (women).',
    }),
]
