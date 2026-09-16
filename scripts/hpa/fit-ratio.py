"""Fit a compact risk model with the inferred female total-cholesterol/HDL term."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('parsimonious', HERE / 'fit-parsimonious.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
hpa = p.hpa


def ratio_features(row, keys, sex, outcome):
    values = p.parsimonious_features(row, keys, sex, outcome)
    if sex != 'female' or outcome not in ('chd', 'mace'):
        return values
    names = [key for key in keys if key != 'height']
    hdl_index = names.index('hdlc') + 1
    chol_index = names.index('chol') + 1
    values[chol_index] = row['chol'] / row['hdlc'] - 3.6
    del values[hdl_index]
    return values


if __name__ == '__main__':
    candidate = {}
    for (sex, outcome), (keys, _) in p.old.items():
        rows = hpa.rows_for(p.train, sex, outcome, keys, ratio_features)
        candidate[sex, outcome] = (keys, hpa.fit(rows, p.initial_beta(rows), 0))
    print('train:', json.dumps(hpa.score(p.train, candidate, p.avg, ratio_features), ensure_ascii=False))
    print('fresh:', json.dumps(hpa.score(p.fresh, candidate, p.avg, ratio_features), ensure_ascii=False))
    print('original:', json.dumps(hpa.score(p.original, candidate, p.avg, ratio_features), ensure_ascii=False))
    print('coefficients:', json.dumps({f'{sex}/{outcome}': [round(float(v), 8) for v in beta]
                                       for (sex, outcome), (_, beta) in candidate.items()}))
