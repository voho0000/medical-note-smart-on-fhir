"""Score a frozen candidate without refitting or excluding ambiguous outputs."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('r', Path(__file__).with_name('recover-intervals.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--data', type=Path, action='append', required=True)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    model_bytes = args.model.read_bytes()
    model = json.loads(model_bytes)
    r.set_bmi_precision(model.get('bmiDecimals'))
    models = {tuple(name.split('/')): (item['keys'], np.array(item['beta'])) for name, item in model['models'].items()}
    _, avg = r.hpa.parse_model()
    digest = hashlib.sha256(model_bytes).hexdigest()
    report = {'candidateSha256': digest, 'datasets': []}
    for path in args.data:
        dataset = json.loads(path.read_text())
        if isinstance(dataset, dict) and dataset.get('candidateSha256') and dataset['candidateSha256'] != digest:
            raise ValueError(f'Candidate changed since validation plan was frozen: {path}')
        records = dataset if isinstance(dataset, list) else dataset['records']
        scored = r.evaluate(records, models, avg, model['roundingDecimals'])
        kinds = sorted({record.get('kind', 'unspecified') for record in records})
        scored['byKind'] = {kind: r.evaluate([record for record in records if record.get('kind', 'unspecified') == kind],
                                          models, avg, model['roundingDecimals'])['total'] for kind in kinds}
        for mismatch in scored['mismatches']:
            record = records[mismatch['record']]
            mismatch['kind'] = record.get('kind')
            mismatch['input'] = record['input']
        report['datasets'].append({'path': str(path), 'profiles': len(records), **scored})
    text = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    print(text)
    if args.out:
        args.out.write_text(text)


if __name__ == '__main__':
    main()
