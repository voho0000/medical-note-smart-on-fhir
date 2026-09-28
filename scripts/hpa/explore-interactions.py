"""Test whether cross-factor terms help the two remaining difficult outcomes."""
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('parsimonious', HERE / 'fit-parsimonious.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
hpa = p.hpa


def with_interactions(row, keys, sex, outcome):
    base = p.parsimonious_features(row, keys, sex, outcome)
    if outcome not in ('chd', 'mace'):
        return base
    return base + [base[i] * base[j] for i in range(1, len(base)) for j in range(i + 1, len(base))]


base_models = {}
for (sex, outcome), (keys, _) in p.old.items():
    rows = hpa.rows_for(p.train, sex, outcome, keys, p.parsimonious_features)
    base_models[sex, outcome] = (keys, hpa.fit(rows, p.initial_beta(rows), 0))

for penalty in (1, 10, 100, 1000, 10000):
    models = {}
    for (sex, outcome), (keys, beta) in base_models.items():
        if outcome not in ('chd', 'mace'):
            models[sex, outcome] = (keys, beta)
            continue
        rows = hpa.rows_for(p.train, sex, outcome, keys, with_interactions)
        start = np.concatenate([beta, np.zeros(len(rows[0][0]) - len(beta))])
        models[sex, outcome] = (keys, hpa.fit(rows, start, penalty))
    print('Penalty', penalty)
    print('  train:', json.dumps(hpa.score(p.train, models, p.avg, with_interactions), ensure_ascii=False))
    print('  fresh:', json.dumps(hpa.score(p.fresh, models, p.avg, with_interactions), ensure_ascii=False))
    print('  original:', json.dumps(hpa.score(p.original, models, p.avg, with_interactions), ensure_ascii=False))
