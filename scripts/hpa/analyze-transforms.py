"""Compare one-factor synthetic HPA responses against simple Cox covariate transforms."""
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hpa_fit', HERE / 'evaluate-fit.py')
hpa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hpa)
models, _ = hpa.parse_model()
data = json.loads((hpa.FIXTURE_DIR / 'hpa-official-research-2026-09-16.json').read_text())['records']


def transformed(value, name):
    return {'linear': value, 'log': math.log(value), 'inverse': 1 / value,
            'sqrt': math.sqrt(value), 'square': value * value}[name]


def risk_eta(record, index):
    low, high = hpa.official_interval(record, index)
    p = max(.01, min(99.99, (low + high) / 2)) / 100
    return math.log(-math.log1p(-p))


for sex in ('female', 'male'):
    sex_number = int(sex == 'male')
    baseline = next(r for r in data if r['kind'] == 'baseline' and r['input']['gender'] == sex_number)
    for outcome in hpa.OUTCOMES:
        keys = models[sex, outcome][0]
        index = hpa.OUTCOMES.index(outcome)
        print(f'{sex}/{outcome}')
        factors = [key for key in keys if key not in ('diabetes', 'hbp', 'smoke', 'height')]
        if 'weight' in factors and 'height' in keys:
            factors.remove('weight')
            factors.append('bmi')
        for factor in factors:
            records = [baseline]
            factor_names = ('height', 'weight') if factor == 'bmi' else (factor,)
            records += [r for r in data if r['kind'] == 'one-factor' and r['input']['gender'] == sex_number
                        and r['factor'] in factor_names]
            def value(record):
                row = record['input']
                return row['weight'] / (row['height'] / 100) ** 2 if factor == 'bmi' else row[factor]
            y = np.array([risk_eta(r, index) for r in records])
            comparison = []
            for name in ('linear', 'log', 'inverse', 'sqrt', 'square'):
                x = np.array([transformed(value(r), name) for r in records])
                matrix = np.stack([np.ones(len(x)), (x - x.mean()) / (x.max() - x.min())], axis=1)
                beta = np.linalg.lstsq(matrix, y, rcond=None)[0]
                mse = float(np.mean((matrix @ beta - y) ** 2))
                comparison.append((mse, name))
            comparison.sort()
            print(' ', factor, ' '.join(f'{name}:{mse:.5g}' for mse, name in comparison))
