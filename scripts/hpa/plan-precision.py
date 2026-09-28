"""Generate synthetic, coefficient-sensitive probes near integer boundaries."""
import argparse
import importlib.util
import json
import random
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('intervals', HERE / 'recover-intervals.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
RANGES = {'age': (35, 70), 'height': (150, 190), 'weight': (45, 115), 'waist': (60, 125),
          'sbp': (90, 139), 'glu': (70, 125), 'chol': (120, 300), 'tg': (45, 400),
          'ldlc': (45, 220), 'hdlc': (25, 95)}
CONTROLS = {'chd': 'waist', 'diabetes': 'glu', 'hypertension': 'weight', 'stroke': 'waist', 'mace': 'waist'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=9261601)
    parser.add_argument('--profiles', type=int, default=4)
    parser.add_argument('--offset', type=float, default=.02)
    parser.add_argument('--skip', type=int, default=0)
    args = parser.parse_args()
    candidate = json.loads(args.model.read_text())
    models = candidate['models']
    r.set_bmi_precision(candidate.get('bmiDecimals'))
    rng = random.Random(args.seed)
    records = []
    for name, model in models.items():
        sex, outcome = name.split('/')
        control = CONTROLS[outcome]
        if outcome == 'stroke' and sex == 'male':
            control = 'glu'
        keys, beta = model['keys'], np.array(model['beta'])
        for number in range(args.profiles):
            for _ in range(1000):
                row = {key: rng.randint(low, high) for key, (low, high) in RANGES.items()}
                row.update(gender=int(sex == 'male'), diabetes=0, hbp=int(rng.random() < .25) if outcome != 'hypertension' else 0,
                           smoke=int(rng.random() < .3))
                def probability(value):
                    x = r.ratio_fit.ratio_features({**row, control: value}, keys, sex, outcome)
                    return float(r.hpa.probability(np.array(x), beta))
                low, high = RANGES[control]
                pl, ph = probability(low), probability(high)
                target = round((pl + ph) / 2)
                if 2 <= target <= 97 and pl + .1 < target < ph - .1:
                    break
            else:
                raise ValueError(f'No boundary found for {name}')
            for offset in (-args.offset, 0, args.offset):
                # Candidate: round to two decimal places, then floor.
                target_raw = target - .005 + offset
                lo, hi = low, high
                for _ in range(55):
                    middle = (lo + hi) / 2
                    if probability(middle) < target_raw:
                        lo = middle
                    else:
                        hi = middle
                probe = {**row, control: round((lo + hi) / 2, 8)}
                records.append({'kind': 'precision-calibration', 'targetModel': name, 'targetInteger': target,
                                'targetOffset': offset, 'group': number, 'input': probe})
    args.out.write_text(json.dumps({'syntheticOnly': True, 'purpose': 'Identify coefficient precision and output quantization',
                                    'seed': args.seed, 'records': records[args.skip:]}, indent=2) + '\n')
    print(f'Generated {len(records[args.skip:])} precision probes')


if __name__ == '__main__':
    main()
