"""Predeclare fresh synthetic validation, with a hash of the frozen candidate.

No official responses are read. All generated inputs are synthetic. The plan
contains broad integer/fractional profiles and hypertension grade boundaries.
If results inform another fit, that batch must be relabeled calibration.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import random
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('precision', Path(__file__).with_name('plan-precision.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
r = p.r


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=9261691)
    parser.add_argument('--random-count', type=int, default=240)
    parser.add_argument('--grade-offset', type=float, default=.02)
    parser.add_argument('--anchors', action='store_true', help='Repeat two known baseline profiles to check drift')
    args = parser.parse_args()
    model_text = args.model.read_bytes()
    candidate = json.loads(model_text)
    models = candidate['models']
    r.set_bmi_precision(candidate.get('bmiDecimals'))
    _, averages = r.hpa.parse_model()
    rng = random.Random(args.seed)
    records = []
    if args.anchors:
        for gender in (0, 1):
            records.append({'kind': 'repeated-drift-anchor', 'input': {
                'gender': gender, 'age': 50, 'height': 170, 'weight': 70, 'waist': 85,
                'sbp': 120, 'glu': 90, 'chol': 180, 'tg': 100, 'ldlc': 100, 'hdlc': 50,
                'diabetes': 0, 'hbp': 0, 'smoke': 0}})

    def profile(sex, fractional=False):
        row = {key: (round(rng.uniform(low, high), 2) if fractional and key not in ('age', 'sbp')
                     else rng.randint(low, high)) for key, (low, high) in p.RANGES.items()}
        row.update(gender=int(sex == 'male'), diabetes=int(rng.random() < .12),
                   hbp=int(rng.random() < .16), smoke=int(rng.random() < .3))
        return row

    for i in range(args.random_count):
        sex = 'male' if i % 2 else 'female'
        row = profile(sex, i % 3 == 0)
        row['age'] = 35 + (i // 2) % 36
        records.append({'kind': 'fresh-validation-random', 'input': row})

    # Every age/sex cohort, near both boundaries, when reachable inside the
    # local supported range. Perturbation is in percentage points, not ratio.
    for sex in ('female', 'male'):
        model = models[f'{sex}/hypertension']
        keys, beta = model['keys'], np.array(model['beta'])
        for age in range(35, 71):
            for target_ratio in (.745, 1.255):
                # The ratio uses the two-decimal numerator, so its boundary
                # lies on that numerator's cent grid before final rounding.
                target = math.ceil(averages[sex][age - 35] * target_ratio * 100 - 1e-9) / 100 - .005
                for attempt in range(500):
                    row = {**profile(sex), 'age': age, 'hbp': 0, 'diabetes': 0}

                    def probability(weight):
                        x = r.ratio_fit.ratio_features({**row, 'weight': weight}, keys, sex, 'hypertension')
                        return float(r.hpa.probability(np.array(x), beta))

                    if probability(45) < target - args.grade_offset and probability(115) > target + args.grade_offset:
                        break
                else:
                    raise ValueError(f'Unreachable grade boundary: {sex}/{age}/{target_ratio}')
                for offset in (-args.grade_offset, args.grade_offset):
                    lo, hi = 45, 115
                    for _ in range(55):
                        mid = (lo + hi) / 2
                        if probability(mid) < target + offset:
                            lo = mid
                        else:
                            hi = mid
                    records.append({'kind': 'fresh-validation-htn-boundary', 'targetRatio': target_ratio,
                                    'targetOffset': offset, 'input': {**row, 'weight': round((lo + hi) / 2, 8)}})
    args.out.write_text(json.dumps({'syntheticOnly': True, 'purpose': 'Independent validation after coefficient freeze',
                                    'candidateSha256': hashlib.sha256(model_text).hexdigest(),
                                    'seed': args.seed, 'records': records}, indent=2) + '\n')
    print(f'Generated {len(records)} fresh validation profiles')


if __name__ == '__main__':
    main()
