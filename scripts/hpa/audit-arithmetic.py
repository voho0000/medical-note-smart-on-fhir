"""Test arithmetic precision hypotheses against saved synthetic responses.

No requests or product edits. Hypotheses are candidates, not known backend
implementation details, and require separate prospective validation.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('r', Path(__file__).with_name('recover-intervals.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--variant', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    rows = r.load_records(True)
    for name in ('precision-1', 'precision-2', 'precision-3', 'validation-1', 'adaptive', 'validation-2', 'validation-3', 'adaptive-htn'):
        rows.extend(json.loads((r.hpa.FIXTURE_DIR / f'hpa-official-{name}-2026-09-16.json').read_text())['records'])
    original_features = r.ratio_fit.ratio_features
    original_interval = r.raw_interval
    original_probability = r.hpa.probability

    def features(row, keys, sex, outcome):
        if args.variant == 'input-float32':
            row = {key: float(np.float32(value)) for key, value in row.items()}
        x = original_features(row, keys, sex, outcome)
        if 'height' in keys and args.variant.startswith('bmi-'):
            meters = row['height'] / 100
            bmi = row['weight'] / meters ** 2
            kind = args.variant.removeprefix('bmi-')
            if kind == 'float32':
                bmi = float(np.float32(bmi))
            elif kind == 'float32-ops':
                meters = np.float32(row['height']) / np.float32(100)
                bmi = float(np.float32(row['weight']) / np.float32(meters * meters))
            elif kind == 'float32-cm':
                height = np.float32(row['height'])
                bmi = float(np.float32(np.float32(row['weight']) / np.float32(height * height)) * np.float32(10000))
            elif kind == 'truncate-4':
                bmi = math.floor(bmi * 10000) / 10000
            else:
                decimals = int(kind)
                bmi = math.floor(bmi * 10 ** decimals + .5) / 10 ** decimals
            x[2] = (bmi - 24.22) / 5
        return x

    def inverse_float32_boundary(percent, factor):
        value = percent / factor
        high = np.float32(value)
        if float(high) < value:
            high = np.nextafter(high, np.float32(np.inf))
        low = np.nextafter(high, np.float32(-np.inf))
        return (float(low) + float(high)) / 2 * factor

    factor = 100 if args.variant == 'probability-float32' else 1
    output_float = args.variant in ('risk-float32', 'probability-float32')

    def interval(record, index, decimals, use_ratios=True):
        low, high = original_interval(record, index, decimals, False)
        if output_float:
            low = inverse_float32_boundary(low, factor) if low > 0 else 0
            high = inverse_float32_boundary(high, factor) if high < 100 else 100
        return low, high

    def probability(x, beta):
        value = original_probability(x, beta)
        return float(np.float32(value / factor)) * factor if output_float else value

    r.ratio_fit.ratio_features = features
    r.raw_interval = interval
    r.hpa.probability = probability
    models, avg, margins, failures = r.recover(rows, 2, False)
    report = {'variant': args.variant, 'calibrationCount': len(rows), 'roundingDecimals': 2,
              'useRatioConstraints': False, 'margins': margins, 'violatedConstraints': failures,
              'calibration': r.evaluate(rows, models, avg, 2),
              'models': {f'{sex}/{outcome}': {'keys': keys, 'beta': beta.tolist()}
                         for (sex, outcome), (keys, beta) in models.items()}}
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'variant': args.variant, 'minimumMargin': min(margins.values()),
                      **report['calibration']['total']}))


if __name__ == '__main__':
    main()
