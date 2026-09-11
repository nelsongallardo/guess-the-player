"""Run real Chromium checks using the named, headless Playwright CLI session.
Start `python3 -m http.server 4173 --bind 127.0.0.1` at repo root first.
"""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--offline-only', action='store_true')
args = parser.parse_args()
session = root.name
browsers = subprocess.run(['playwright-cli', 'list'], cwd=root, capture_output=True, text=True, check=True)
if f'- {session}:' not in browsers.stdout:
    subprocess.run(['playwright-cli', f'-s={session}', 'open', 'http://127.0.0.1:4173/index.html'], cwd=root, check=True)
results = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
for filename in (['offline-checks.js'] if args.offline_only else ['browser-checks.js', 'offline-checks.js', 'mobile-language-checks.js', 'difficulty-checks.js', 'expansion-checks.js']):
    script = (root / 'tests' / filename).read_text().replace('__FILE_URL__', json.dumps((root / 'index.html').as_uri() + '?lang=en'))
    script = script.replace('__LEGACY_SAVE__', (root / 'tests/legacy-save.json').read_text())
    result = subprocess.run(['playwright-cli', f'-s={session}', '--raw', 'run-code', script], cwd=root, capture_output=True, text=True, timeout=180)
    try:
        data = json.loads(result.stdout.strip())
        assert result.returncode == 0 and data.get('passed') is True
    except (json.JSONDecodeError, AssertionError):
        print(result.stdout + result.stderr, file=sys.stderr)
        raise SystemExit(f'FAILED: {filename}')
    results[filename] = data
out = root / 'test-results'
out.mkdir(exist_ok=True)
(out / ('offline-results.json' if args.offline_only else 'browser-results.json')).write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
