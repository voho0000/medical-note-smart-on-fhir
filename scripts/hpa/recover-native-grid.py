"""Test native four-decimal coefficient precision as an explicit hypothesis.

The original paper publishes four-decimal slopes. A lattice-constrained fit is
not proof of the backend coefficients; it must pass new, separately collected
validation and is rejected if any calibration interval becomes infeasible.
"""
import argparse
import importlib.util
import json
import itertools
import math
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

spec = importlib.util.spec_from_file_location('native', Path(__file__).with_name('check-native-precision.py'))
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)
r = n.r


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extra', type=Path, action='append', default=[])
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--free-age', action='store_true', help='Leave log-age continuous; test four-decimal precision only for other slopes')
    parser.add_argument('--input-precision', choices=['double', 'float32'], default='double')
    parser.add_argument('--bmi-precision', choices=['double', 'float32', 'float32-height'], default='double')
    parser.add_argument('--ratio-precision', choices=['double', 'float32'], default='double')
    parser.add_argument('--risk-only', action='store_true')
    args = parser.parse_args()
    original_features = r.ratio_fit.ratio_features

    def precision_features(row, keys, sex, outcome):
        if args.input_precision == 'float32':
            row = {key: float(np.float32(value)) for key, value in row.items()}
        features = original_features(row, keys, sex, outcome)
        if 'height' in keys and args.bmi_precision != 'double':
            assert keys[:3] == ['age', 'height', 'weight']
            meters = row['height'] / 100
            if args.bmi_precision == 'float32-height':
                meters = float(np.float32(meters))
            bmi = row['weight'] / meters ** 2
            if args.bmi_precision == 'float32':
                bmi = float(np.float32(bmi))
            features[2] = (bmi - 24.22) / 5
        if sex == 'female' and outcome in ('chd', 'mace') and args.ratio_precision == 'float32':
            features[4] = float(np.float32(row['chol'] / row['hdlc'])) - 3.6
        return features

    r.ratio_fit.ratio_features = precision_features
    rows = r.load_records(True)
    for path in args.extra:
        rows.extend(json.loads(path.read_text())['records'])
    models, avg, _, _ = r.recover(rows, 2, not args.risk_only)
    margins, native_slopes, feasible_counts = {}, {}, {}
    for (sex, outcome), (keys, beta) in models.items():
        a, b, _ = r.constraints(rows, sex, outcome, keys, 2, not args.risk_only)
        scales = n.native_scales(keys, sex, outcome) * .0001
        scales[0] = 1
        count = len(beta)
        lo, hi = [], []
        for j in range(count):
            objective = np.eye(count)[j]
            options = {'dual_feasibility_tolerance': 1e-9, 'primal_feasibility_tolerance': 1e-9}
            lower = linprog(objective, A_ub=a, b_ub=b, bounds=[(None, None)] * count, options=options)
            upper = linprog(-objective, A_ub=a, b_ub=b, bounds=[(None, None)] * count, options=options)
            if not lower.success or not upper.success:
                raise ValueError(f'Inconsistent calibration: {sex}/{outcome}')
            lo.append(lower.fun / scales[j] - 1e-5)
            hi.append(-upper.fun / scales[j] + 1e-5)
        # Once continuous probes narrow each slope, enumerate the finite grid.
        # Avoid MILP presolve tolerances on tiny margins and large integer age
        # coefficients. Each candidate's intercept bounds are exact affine
        # inequalities because the intercept column consists only of ±1.
        first_fixed = 2 if args.free_age else 1
        choices = [range(math.ceil(lo[j]), math.floor(hi[j]) + 1) for j in range(first_fixed, count)]
        combinations = math.prod(len(values) for values in choices)
        if combinations > 1000000:
            raise ValueError(f'Grid remains too wide for {sex}/{outcome}: {combinations} candidates')
        feasible = []
        for slopes in itertools.product(*choices):
            fitted = np.r_[np.zeros(first_fixed), np.array(slopes) * scales[first_fixed:]]
            residual = b - a @ fitted
            if args.free_age:
                solution = linprog([0, 0, -1], A_ub=np.c_[a[:, :2], np.ones(len(b))], b_ub=residual,
                                   bounds=[(None, None)] * 3, options=options)
                if not solution.success:
                    continue
                margin = solution.x[-1]
                fitted[:2] = solution.x[:2]
            else:
                intercept_lo = np.max(-residual[a[:, 0] < 0])
                intercept_hi = np.min(residual[a[:, 0] > 0])
                margin = (intercept_hi - intercept_lo) / 2
                fitted[0] = (intercept_lo + intercept_hi) / 2
            if margin > 0:
                feasible.append((margin, fitted, slopes))
        if not feasible:
            raise ValueError(f'Native four-decimal grid does not fit {sex}/{outcome}')
        _, fitted, slopes = max(feasible, key=lambda item: item[0])
        models[sex, outcome] = (keys, fitted)
        margins[f'{sex}/{outcome}'] = float(np.min(b - a @ fitted))
        native_slopes[f'{sex}/{outcome}'] = (fitted[1:] / n.native_scales(keys, sex, outcome)[1:]).tolist()
        feasible_counts[f'{sex}/{outcome}'] = len(feasible)
        print(f'{sex}/{outcome}: {len(feasible)} feasible grids, margin={margins[f"{sex}/{outcome}"]:.8g}, native slopes={native_slopes[f"{sex}/{outcome}"]}')
    report = {'calibrationCount': len(rows), 'roundingDecimals': 2, 'nativeSlopeDecimals': 4, 'continuousLogAge': args.free_age,
              'inputPrecision': args.input_precision, 'bmiPrecision': args.bmi_precision, 'ratioPrecision': args.ratio_precision,
              'useRatioConstraints': not args.risk_only, 'margins': margins, 'nativeSlopes': native_slopes, 'feasibleGridCounts': feasible_counts,
              'calibration': r.evaluate(rows, models, avg, 2),
              'models': {f'{sex}/{outcome}': {'keys': keys, 'beta': beta.tolist()}
                         for (sex, outcome), (keys, beta) in models.items()}}
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report['calibration']['total']))


if __name__ == '__main__':
    main()
