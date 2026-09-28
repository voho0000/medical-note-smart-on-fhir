"""Recover coefficient intervals from synthetic, quantized HPA responses.

Requires numpy/scipy. This research tool never queries a network and does not
modify the application. Historical holdouts may be used as calibration only
when explicitly selected; a later independent validation batch is required.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('ratio_fit', HERE / 'fit-ratio.py')
ratio_fit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ratio_fit)
hpa = ratio_fit.hpa
LP_SCALE = 1e6
BASE_FEATURES = ratio_fit.ratio_features


def set_bmi_precision(decimals=None):
    """Select preprocessing explicitly; old frozen candidates remain replayable."""
    def features(row, keys, sex, outcome):
        result = BASE_FEATURES(row, keys, sex, outcome)
        if decimals is not None and 'height' in keys:
            assert keys[:3] == ['age', 'height', 'weight']
            bmi = row['weight'] / (row['height'] / 100) ** 2
            rounded = math.floor(bmi * 10 ** decimals + .5) / 10 ** decimals
            center, scale = hpa.CENTERS['bmi']
            result[2] = (rounded - center) / scale
        return result
    ratio_fit.ratio_features = features


def load_records(all_known=False):
    research = json.loads((hpa.FIXTURE_DIR / 'hpa-official-research-2026-09-16.json').read_text())['records']
    if not all_known:
        return [r for r in research if r['kind'] != 'fresh-holdout']
    original = json.loads((hpa.FIXTURE_DIR / 'hpa-official-holdout.json').read_text())
    historical_blind = json.loads((hpa.FIXTURE_DIR / 'hpa-official-blind-2026-09-16.json').read_text())['records']
    return research + original + historical_blind


def raw_interval(record, index, decimals, use_ratios=True):
    # A displayed integer k constrains the raw risk. Compare direct floor to
    # rounding to a fixed precision followed by floor; do not add case offsets.
    k = record['official'][index]
    half_unit = 0 if decimals is None else .5 * 10 ** -decimals
    low = max(0, k - half_unit)
    high = min(100, k + 1 - half_unit)
    if use_ratios and 'populationAvg' in record:
        a = record['populationAvg'][index]
        r = record['multipleDiff'][index]
        # The ratio may use the two-decimal risk rather than the continuous
        # model risk. Keep its ±0.005 numerator uncertainty as well as both
        # published quantities' uncertainty; integer-only fits independently
        # test the final risk quantization hypothesis.
        low = max(low, max(0, r - .005) * max(0, a - .005) - .005)
        high = min(high, (r + .005) * (a + .005) + .005)
    return low, high


def eta(percent):
    return math.log(-math.log1p(-percent / 100))


def constraints(records, sex, outcome, keys, decimals, use_ratios=True):
    matrix, bounds, labels = [], [], []
    index = hpa.OUTCOMES.index(outcome)
    for number, record in enumerate(records):
        row = record['input']
        if row['gender'] != int(sex == 'male'):
            continue
        if outcome == 'diabetes' and row['diabetes'] or outcome == 'hypertension' and row['hbp']:
            continue
        x = np.array(ratio_fit.ratio_features(row, keys, sex, outcome))
        lo, hi = raw_interval(record, index, decimals, use_ratios)
        if 0 < lo < 100:
            matrix.append(-x)
            bounds.append(-eta(lo))
            labels.append((number, 'lower', lo, record['official'][index]))
        elif lo >= 100:
            # Finite eta cannot reach exactly 100; explicitly expose this case.
            matrix.append(-x)
            bounds.append(-eta(100 - 1e-12))
            labels.append((number, 'saturated', lo, record['official'][index]))
        if 0 < hi < 100:
            matrix.append(x)
            bounds.append(eta(hi))
            labels.append((number, 'upper', hi, record['official'][index]))
    return np.stack(matrix), np.array(bounds), labels


def recover(records, decimals, use_ratios=True):
    current, avg = hpa.parse_model()
    models, margins, failures = {}, {}, {}
    for (sex, outcome), (keys, previous) in current.items():
        a, b, labels = constraints(records, sex, outcome, keys, decimals, use_ratios)
        n = len(previous)
        # Maximize the smallest strict interior margin in the transformed
        # probability intervals. A negative optimum identifies inconsistency.
        # Active probes can narrow eta intervals below an LP solver's default
        # absolute feasibility tolerance. Scale constraints and margin units;
        # do not loosen/round the observed output intervals to hide a mismatch.
        result = linprog(np.r_[np.zeros(n), -1], A_ub=np.c_[a * LP_SCALE, np.ones(len(b))], b_ub=b * LP_SCALE,
                         bounds=[(None, None)] * n + [(-10 * LP_SCALE, LP_SCALE)], method='highs',
                         options={'dual_feasibility_tolerance': 1e-9,
                                  'primal_feasibility_tolerance': 1e-9})
        if not result.success:
            raise RuntimeError(f'{sex}/{outcome}: {result.message}')
        beta = result.x[:n]
        models[sex, outcome] = (keys, beta)
        margins[f'{sex}/{outcome}'] = float(result.x[-1] / LP_SCALE)
        violations = [(float(gap), labels[i]) for i, gap in enumerate(a @ beta - b) if gap > 1e-12]
        failures[f'{sex}/{outcome}'] = sorted(violations, reverse=True)[:5]
    return models, avg, margins, failures


def evaluate(records, models, avg, decimals):
    summary = {outcome: {'eligible': 0, 'exact': 0, 'levels': 0} for outcome in hpa.OUTCOMES}
    mismatches = []
    for i, record in enumerate(records):
        row = record['input']
        sex = 'male' if row['gender'] else 'female'
        for j, outcome in enumerate(hpa.OUTCOMES):
            if outcome == 'diabetes' and row['diabetes'] or outcome == 'hypertension' and row['hbp']:
                continue
            keys, beta = models[sex, outcome]
            x = np.array(ratio_fit.ratio_features(row, keys, sex, outcome))
            raw = float(hpa.probability(x, beta))
            rounded = raw if decimals is None else math.floor(raw * 10 ** decimals + .5) / 10 ** decimals
            displayed = math.floor(rounded)
            official = record['official'][j]
            if outcome == 'hypertension':
                multiple = math.floor(rounded / avg[sex][row['age'] - 35] * 100 + .5) / 100
                expected_multiple = record['multipleDiff'][j] if 'multipleDiff' in record else record['hypertensionMultipleDiff']
                predicted_level = 0 if multiple < .75 else 2 if multiple > 1.25 else 1
                actual_level = 0 if expected_multiple < .75 else 2 if expected_multiple > 1.25 else 1
            else:
                predicted_level = 0 if displayed < 10 else 1 if displayed < 20 else 2
                actual_level = 0 if official < 10 else 1 if official < 20 else 2
            entry = summary[outcome]
            entry['eligible'] += 1
            entry['exact'] += int(displayed == official)
            entry['levels'] += int(predicted_level == actual_level)
            if displayed != official or predicted_level != actual_level:
                mismatches.append({'record': i, 'sex': sex, 'outcome': outcome, 'raw': raw,
                                   'displayed': displayed, 'official': official,
                                   'level': predicted_level, 'officialLevel': actual_level})
    total = {key: sum(row[key] for row in summary.values()) for key in ['eligible', 'exact', 'levels']}
    return {'total': total, 'byOutcome': summary, 'mismatches': mismatches}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all-known', action='store_true')
    parser.add_argument('--decimals', type=int)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--extra', type=Path, action='append', default=[])
    parser.add_argument('--risk-only', action='store_true', help='Do not infer extra bounds from rounded ratios')
    parser.add_argument('--bmi-decimals', type=int, help='Explicit BMI rounding before risk features; omit for historical continuous-BMI fits')
    args = parser.parse_args()
    set_bmi_precision(args.bmi_decimals)
    calibration = load_records(args.all_known)
    for path in args.extra:
        calibration.extend(json.loads(path.read_text())['records'])
    models, avg, margins, failures = recover(calibration, args.decimals, not args.risk_only)
    report = {'calibrationCount': len(calibration), 'roundingDecimals': args.decimals, 'bmiDecimals': args.bmi_decimals,
              'useRatioConstraints': not args.risk_only, 'constraintScale': LP_SCALE,
              'margins': margins, 'violatedConstraints': failures,
              'allHistorical': evaluate(load_records(True), models, avg, args.decimals),
              'calibration': evaluate(calibration, models, avg, args.decimals),
              'models': {f'{sex}/{outcome}': {'keys': keys, 'beta': beta.tolist()}
                         for (sex, outcome), (keys, beta) in models.items()}}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
