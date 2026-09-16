"""Fit the covariate forms supported by HPA one-factor synthetic probes.

Only the 208 designated training profiles determine coefficients. Evaluation
is performed on the 40 new profiles and original 40 profiles, neither fitted.
"""
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hpa_fit', HERE / 'evaluate-fit.py')
hpa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hpa)
old, avg = hpa.parse_model()
records = json.loads((hpa.FIXTURE_DIR / 'hpa-official-research-2026-09-16.json').read_text())['records']
train = [record for record in records if record['kind'] != 'fresh-holdout']
fresh = [record for record in records if record['kind'] == 'fresh-holdout']
original = json.loads((hpa.FIXTURE_DIR / 'hpa-official-holdout.json').read_text())


def parsimonious_features(row, keys, sex, outcome):
    result = [1.0]
    for key in keys:
        if key == 'height':
            continue
        name = 'bmi' if key == 'weight' and 'height' in keys else key
        value = row['weight'] / (row['height'] / 100) ** 2 if name == 'bmi' else row[key]
        if name in hpa.CENTERS:
            center, scale = hpa.CENTERS[name]
            if name == 'age':
                x = math.log(value / center) * center / scale
            elif name == 'hdlc' and sex == 'female' and outcome in ('chd', 'mace'):
                x = center ** 2 / scale * (1 / center - 1 / value)
            else:
                x = (value - center) / scale
        else:
            x = float(value)
        result.append(x)
    return result


def initial_beta(rows):
    x = np.stack([r[0] for r in rows])
    target = np.clip(np.array([r[1] for r in rows]) / 100, .0001, .9999)
    eta = np.log(-np.log1p(-target))
    return np.linalg.lstsq(x, eta, rcond=None)[0]


def main():
    for penalty in (0, 1, 10, 100):
        candidate = {}
        for (sex, outcome), (keys, _) in old.items():
            rows = hpa.rows_for(train, sex, outcome, keys, parsimonious_features)
            first = initial_beta(rows)
            candidate[sex, outcome] = (keys, hpa.fit(rows, first, penalty))
        print('Penalty', penalty)
        print('  train:', json.dumps(hpa.score(train, candidate, avg, parsimonious_features), ensure_ascii=False))
        print('  fresh:', json.dumps(hpa.score(fresh, candidate, avg, parsimonious_features), ensure_ascii=False))
        print('  original:', json.dumps(hpa.score(original, candidate, avg, parsimonious_features), ensure_ascii=False))
        if penalty == 0:
            print('  coefficients:', json.dumps({f'{sex}/{outcome}': [round(float(v), 8) for v in beta]
                                                 for (sex, outcome), (_, beta) in candidate.items()}))


if __name__ == '__main__':
    main()
