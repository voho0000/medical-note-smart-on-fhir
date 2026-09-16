"""Test (not assume) whether four-decimal native slopes explain observations."""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

spec = importlib.util.spec_from_file_location('r', Path(__file__).with_name('recover-intervals.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def native_scales(keys, sex, outcome):
    scales = [1.0]
    for key in keys:
        if key == 'height' or sex == 'female' and outcome in ('chd', 'mace') and key == 'hdlc':
            continue
        if key == 'age':
            scales.append(1 / (5 * math.log(10)))
        elif sex == 'female' and outcome in ('chd', 'mace') and key == 'chol':
            scales.append(1)
        else:
            name = 'bmi' if key == 'weight' and 'height' in keys else key
            scales.append(r.hpa.CENTERS.get(name, (0, 1))[1])
    return np.array(scales)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extra', type=Path, action='append', default=[])
    args = parser.parse_args()
    records = r.load_records(True)
    for path in args.extra:
        records.extend(json.loads(path.read_text())['records'])
    models, avg, _, _ = r.recover(records, 2)
    for (sex, outcome), (keys, beta) in models.items():
        a, b, _ = r.constraints(records, sex, outcome, keys, 2)
        scales = native_scales(keys, sex, outcome)
        rounded = np.round(beta / scales, 4) * scales
        # With slopes fixed, solve only the intercept and common margin.
        result = linprog([0, -1], A_ub=np.c_[a[:, 0], np.ones(len(b))],
                         b_ub=b - a[:, 1:] @ rounded[1:], bounds=[(None, None), (None, None)])
        rounded[0] = result.x[0]
        models[sex, outcome] = (keys, rounded)
        print(f'{sex}/{outcome}: native {np.round(beta[1:] / scales[1:], 7).tolist()}, rounded margin {result.x[1]:.8g}')
    print(json.dumps(r.evaluate(records, models, avg, 2)['total']))


if __name__ == '__main__':
    main()
