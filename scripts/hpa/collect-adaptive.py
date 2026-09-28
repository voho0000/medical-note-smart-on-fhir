"""Serial active calibration using synthetic public-form boundary probes.

Each round selects one informative profile per submodel, records the frozen
pre-query candidate, calls the normal public form, and checkpoints responses.
This is calibration, never blind validation. No patient data or credentials
are persisted. The shared collector stops on HTTP/model errors.
"""
import argparse
import hashlib
import importlib.util
import json
import random
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

spec = importlib.util.spec_from_file_location('p', Path(__file__).with_name('plan-precision.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
r = p.r


def select_probe(rows, sex, outcome, keys, beta, rng, use_ratios=True):
    control = 'glu' if sex == 'male' and outcome == 'stroke' else p.CONTROLS[outcome]
    a, b, _ = r.constraints(rows, sex, outcome, keys, 2, use_ratios)
    candidates = []
    for _ in range(12):
        for attempt in range(1000):
            row = {key: rng.randint(low, high) for key, (low, high) in p.RANGES.items()}
            row.update(gender=int(sex == 'male'), diabetes=int(rng.random() < .5) if outcome == 'stroke' else 0,
                       hbp=int(rng.random() < .5) if outcome != 'hypertension' else 0, smoke=int(rng.random() < .5))

            def features(value):
                return np.array(r.ratio_fit.ratio_features({**row, control: value}, keys, sex, outcome))

            low, high = p.RANGES[control]
            pl = float(r.hpa.probability(features(low), beta))
            ph = float(r.hpa.probability(features(high), beta))
            target = round(pl + (ph - pl) * rng.uniform(.25, .75))
            if 2 <= target <= 97 and pl + .1 < target < ph - .1:
                break
        else:
            raise ValueError(f'No reachable boundary for {sex}/{outcome}')

        def crossing(coefficients):
            lo, hi = low, high
            for _ in range(50):
                middle = (lo + hi) / 2
                if float(r.hpa.probability(features(middle), coefficients)) < target - .005:
                    lo = middle
                else:
                    hi = middle
            return (lo + hi) / 2

        x = features(crossing(beta))
        options = {'dual_feasibility_tolerance': 1e-9, 'primal_feasibility_tolerance': 1e-9}
        minimum = linprog(x, A_ub=a * r.LP_SCALE, b_ub=b * r.LP_SCALE, bounds=[(None, None)] * len(beta), options=options)
        maximum = linprog(-x, A_ub=a * r.LP_SCALE, b_ub=b * r.LP_SCALE, bounds=[(None, None)] * len(beta), options=options)
        if not minimum.success or not maximum.success:
            raise ValueError(f'Inconsistent coefficient region for {sex}/{outcome}')
        center_beta = (minimum.x + maximum.x) / 2
        width = -maximum.fun - minimum.fun
        candidates.append((width, {'kind': 'adaptive-calibration', 'targetModel': f'{sex}/{outcome}',
                                  'targetInteger': target, 'etaIntervalWidth': float(width),
                                  'input': {**row, control: round(crossing(center_beta), 8)}}))
    return max(candidates, key=lambda item: item[0])[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extra', type=Path, action='append', default=[])
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--rounds', type=int, default=20)
    parser.add_argument('--seed', type=int, default=9261611)
    parser.add_argument('--outcome', choices=r.hpa.OUTCOMES, action='append', default=[])
    parser.add_argument('--risk-only', action='store_true')
    parser.add_argument('--bmi-decimals', type=int)
    args = parser.parse_args()
    r.set_bmi_precision(args.bmi_decimals)
    if args.out.exists():
        raise ValueError('Refusing to overwrite a previous calibration batch')
    if not 1 <= args.rounds <= 100:
        raise ValueError('Expected 1–100 bounded rounds')
    rows = r.load_records(True)
    for path in args.extra:
        rows.extend(json.loads(path.read_text())['records'])
    rng = random.Random(args.seed)
    result = {'source': 'https://cdrc.hpa.gov.tw/hra-openservice-menupage.jsp?all', 'syntheticOnly': True,
              'purpose': 'Adaptive coefficient calibration; not independent validation',
              'seed': args.seed, 'selectedOutcomes': args.outcome or r.hpa.OUTCOMES,
              'useRatioConstraints': not args.risk_only,
              'bmiDecimals': args.bmi_decimals,
              'startedAt': datetime.now(timezone.utc).isoformat(),
              'complete': False, 'rounds': [], 'records': []}
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    with tempfile.TemporaryDirectory(prefix='hpa-adaptive-') as scratch:
        scratch = Path(scratch)
        for number in range(args.rounds):
            models, avg, margins, _ = r.recover(rows, 2, not args.risk_only)
            if min(margins.values()) < -1e-7:
                raise ValueError('Calibration contradicts the current model family; investigate before proceeding')
            agreement = r.evaluate(rows, models, avg, 2)['total']
            if agreement['exact'] != agreement['eligible'] or agreement['levels'] != agreement['eligible']:
                raise ValueError(f'Calibration no longer fully agrees: {agreement}; investigate before proceeding')
            snapshot = {f'{sex}/{outcome}': {'keys': keys, 'beta': beta.tolist()}
                        for (sex, outcome), (keys, beta) in models.items()}
            probes = [select_probe(rows, sex, outcome, keys, beta, rng, not args.risk_only)
                      for (sex, outcome), (keys, beta) in models.items()
                      if not args.outcome or outcome in args.outcome]
            plan = {'syntheticOnly': True, 'purpose': result['purpose'], 'seed': args.seed,
                    'candidateSha256': hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest(),
                    'records': [{**probe, 'round': number + 1} for probe in probes]}
            plan_path, response_path = scratch / f'plan-{number}.json', scratch / f'responses-{number}.json'
            plan_path.write_text(json.dumps(plan, indent=2) + '\n')
            process = subprocess.run(['node', str(Path(__file__).with_name('query-official.mjs')),
                                      '--plan', str(plan_path), '--out', str(response_path)], check=False)
            if response_path.exists():
                responses = json.loads(response_path.read_text())
                result['records'].extend(responses['records'])
                rows.extend(responses['records'])
            result['rounds'].append({'number': number + 1, 'candidateSha256': plan['candidateSha256'],
                                     'modelsBeforeQueries': snapshot})
            args.out.write_text(json.dumps(result, indent=2) + '\n')
            if process.returncode:
                raise RuntimeError('Public-form collector stopped; partial successful responses are saved')
            print(f'Adaptive round {number + 1}/{args.rounds}: {len(result["records"])} profiles saved', flush=True)
    result.update(complete=True, completedAt=datetime.now(timezone.utc).isoformat(), count=len(result['records']))
    args.out.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
