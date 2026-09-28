"""Research-only fit/evaluation of synthetic HPA queries; never used at runtime.

Reads the live model specification to avoid silently diverging feature order.
The last 40 random profiles in the new fixture remain outside fitting. The
original 40-profile holdout remains outside fitting and model selection.
"""
import ast
import json
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODEL_FILE = ROOT / 'features/medical-calculator/hpa-risk-model.ts'
FIXTURE_DIR = ROOT / '__tests__/features/medical-calculator/fixtures'
OUTCOMES = ['chd', 'diabetes', 'hypertension', 'stroke', 'mace']
CENTERS = {'age': (50, 10), 'bmi': (24.22, 5), 'waist': (85, 10), 'sbp': (120, 20),
           'glu': (90, 20), 'chol': (180, 50), 'tg': (100, 100),
           'ldlc': (100, 50), 'hdlc': (50, 20)}
SQUARED = {'age', 'bmi', 'waist', 'sbp', 'glu', 'chol', 'tg', 'hdlc'}
LOGGED = {'age', 'glu', 'tg', 'hdlc'}


def parse_model():
    source = MODEL_FILE.read_text()
    section = source.split('const MODELS:', 1)[1].split('// Public V4', 1)[0]
    models = {}
    sex = None
    pattern = re.compile(r"^\s*(\w+): \{ keys: (\[[^]]+\]), beta: (\[[^]]+\]) \},?$")
    for line in section.splitlines():
        if line.strip() in ('female: {', 'male: {'):
            sex = line.strip().split(':')[0]
        match = pattern.match(line)
        if match:
            models[sex, match.group(1)] = (ast.literal_eval(match.group(2)),
                                           np.array(ast.literal_eval(match.group(3)), dtype=float))
    assert len(models) == 10, f'Expected 10 submodels, got {len(models)}'
    avg_section = source.split('const HYPERTENSION_AVG:', 1)[1].split('const CENTERS:', 1)[0]
    avg = {}
    for sex in ('female', 'male'):
        match = re.search(rf'^\s*{sex}: (\[[^]]+\])', avg_section, re.MULTILINE)
        avg[sex] = np.array(ast.literal_eval(match.group(1)), dtype=float)
    return models, avg


def features(row, keys):
    f = [1.0]
    for key in keys:
        if key == 'height':
            continue
        name = 'bmi' if key == 'weight' and 'height' in keys else key
        value = row['weight'] / (row['height'] / 100) ** 2 if name == 'bmi' else row[key]
        x = float(value)
        if name in CENTERS:
            center, scale = CENTERS[name]
            x = math.log(value / center) * center / scale if name in LOGGED else (value - center) / scale
        f.append(x)
        if name in SQUARED:
            f.append(x * x)
    return f


def probability(x, beta):
    eta = np.clip(x @ beta, -20, 5)
    return 100 * -np.expm1(-np.exp(eta))


def official_interval(record, index):
    floor = record['official'][index]
    if floor is None:
        return None
    low, high = floor, floor + 1
    if 'populationAvg' in record:
        ratio = record['multipleDiff'][index]
        avg = record['populationAvg'][index]
        if ratio is not None and avg is not None:
            low = max(low, (ratio - .005) * (avg - .005))
            high = min(high, (ratio + .005) * (avg + .005))
            if high < low:
                low, high = floor, floor + 1
    return (low, high)


def rows_for(records, sex, outcome, keys, feature_fn=features):
    index = OUTCOMES.index(outcome)
    rows = []
    for record in records:
        row = record['input']
        if row['gender'] != (sex == 'male'):
            continue
        if outcome == 'diabetes' and row['diabetes'] or outcome == 'hypertension' and row['hbp']:
            continue
        interval = official_interval(record, index)
        if interval is None:
            continue
        rows.append((np.array(feature_fn(row, keys, sex, outcome) if feature_fn is not features else features(row, keys)), sum(interval) / 2, interval, record))
    return rows


def fit(rows, initial, penalty):
    x = np.stack([row[0] for row in rows])
    target = np.array([row[1] for row in rows])
    beta = initial.copy()
    for _ in range(40):
        eta = np.clip(x @ beta, -20, 5)
        exponential = np.exp(eta)
        prediction = 100 * -np.expm1(-exponential)
        gradient = 100 * exponential * np.exp(-exponential)
        jacobian = x * gradient[:, None]
        delta = np.linalg.solve(jacobian.T @ jacobian + penalty * np.eye(len(beta)),
                                jacobian.T @ (target - prediction) + penalty * (initial - beta))
        if np.max(np.abs(delta)) < 1e-9:
            break
        def loss(candidate):
            return np.mean((probability(x, candidate) - target) ** 2) + penalty / len(rows) * np.sum((candidate - initial) ** 2)
        step = 1.0
        while step > .001 and loss(beta + step * delta) >= loss(beta):
            step /= 2
        beta += step * delta
    return beta


def score(records, models, avg, feature_fn=features):
    errors = []
    interval_gaps = []
    interval_hits = 0
    exact = 0
    levels = 0
    eligible = 0
    per = {outcome: [0, 0, 0, []] for outcome in OUTCOMES}
    for record in records:
        row = record['input']
        sex = 'male' if row['gender'] == 1 else 'female'
        for index, outcome in enumerate(OUTCOMES):
            if outcome == 'diabetes' and row['diabetes'] or outcome == 'hypertension' and row['hbp']:
                continue
            keys, beta = models[sex, outcome]
            vector = feature_fn(row, keys, sex, outcome) if feature_fn is not features else features(row, keys)
            risk = float(probability(np.array(vector), beta))
            official = record['official'][index]
            error = abs(risk - official)
            errors.append(error)
            interval = official_interval(record, index)
            interval_gap = max(interval[0] - risk, risk - interval[1], 0)
            interval_gaps.append(interval_gap)
            interval_hits += int(interval_gap == 0)
            eligible += 1
            exact += int(math.floor(risk) == official)
            per[outcome][0] += 1
            per[outcome][1] += int(math.floor(risk) == official)
            per[outcome][3].append(error)
            if outcome == 'hypertension':
                ratio = math.floor(risk / avg[sex][row['age'] - 35] * 100 + .5) / 100
                actual_ratio = record['multipleDiff'][index] if 'multipleDiff' in record else record['hypertensionMultipleDiff']
                predicted_level = 0 if ratio < .75 else 2 if ratio > 1.25 else 1
                official_level = 0 if actual_ratio < .75 else 2 if actual_ratio > 1.25 else 1
            else:
                predicted_level = 0 if risk < 10 else 1 if risk < 20 else 2
                official_level = 0 if official < 10 else 1 if official < 20 else 2
            matched = int(predicted_level == official_level)
            levels += matched
            per[outcome][2] += matched
    return {'eligible': eligible, 'exact': exact, 'levels': levels,
            'mae': round(float(np.mean(errors)), 3),
            'intervalHits': interval_hits, 'intervalGap': round(float(np.mean(interval_gaps)), 3),
            'per': {key: [values[0], values[1], values[2], round(float(np.mean(values[3])), 3)]
                    for key, values in per.items()}}


def main():
    models, avg = parse_model()
    if any(len(beta) != len(features({'age': 50, 'height': 170, 'weight': 70,
                                       'waist': 85, 'sbp': 120, 'glu': 90,
                                       'chol': 180, 'tg': 100, 'ldlc': 100,
                                       'hdlc': 50, 'diabetes': 0, 'hbp': 0,
                                       'smoke': 0}, keys))
           for keys, beta in models.values()):
        print('The squared-feature first-pass model has been replaced. Run fit-ratio.py for the current compact model.')
        return
    fixture = json.loads((FIXTURE_DIR / 'hpa-official-research-2026-09-16.json').read_text())
    fresh_holdout = [r for r in fixture['records'] if r['kind'] == 'fresh-holdout']
    train = [r for r in fixture['records'] if r['kind'] != 'fresh-holdout']
    original_holdout = json.loads((FIXTURE_DIR / 'hpa-official-holdout.json').read_text())
    print('Cases:', len(train), 'train /', len(fresh_holdout), 'fresh holdout /', len(original_holdout), 'original holdout')
    print('Baseline fresh:', json.dumps(score(fresh_holdout, models, avg), ensure_ascii=False))
    print('Baseline original:', json.dumps(score(original_holdout, models, avg), ensure_ascii=False))
    for penalty in [0, .1, 1, 10, 100, 1000]:
        candidate = {}
        for (sex, outcome), (keys, beta) in models.items():
            rows = rows_for(train, sex, outcome, keys)
            candidate[sex, outcome] = (keys, fit(rows, beta, penalty))
        print('Penalty', penalty)
        print('  fresh:', json.dumps(score(fresh_holdout, candidate, avg), ensure_ascii=False))
        print('  original:', json.dumps(score(original_holdout, candidate, avg), ensure_ascii=False))
        if penalty == 10:
            print('  coefficients:', json.dumps({f'{sex}/{outcome}': [round(float(v), 6) for v in beta]
                                                 for (sex, outcome), (_, beta) in candidate.items()}))


if __name__ == '__main__':
    main()
