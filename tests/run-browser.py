"""Run real Chromium checks using the named, headless Playwright CLI session.
Start `python3 -m http.server 4173 --bind 127.0.0.1` at repo root first.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
SUITES = ['browser-checks.js', 'career-arrow-checks.js', 'guest-ranked-disclosure-checks.js', 'offline-checks.js', 'mobile-language-checks.js', 'difficulty-checks.js', 'expansion-checks.js', 'brand-checks.js', 'origin-checks.js', 'saved-rivals-checks.js', 'seo-checks.js', 'analytics-checks.js', 'guest-session-checks.js', 'accounts-checks.js', 'leaderboard-checks.js', 'game-loading-checks.js', 'nickname-suggestion-checks.js']
parser.add_argument('--offline-only', action='store_true')
parser.add_argument('--suite', action='append', choices=SUITES, help='Run a named suite; repeat for multiple focused checks')
args = parser.parse_args()
session = os.environ.get('PLAYWRIGHT_SESSION', root.name)
browsers = subprocess.run(['playwright-cli', 'list'], cwd=root, capture_output=True, text=True, check=True)
if f'- {session}:' not in browsers.stdout:
    subprocess.run(['playwright-cli', f'-s={session}', 'open', 'http://127.0.0.1:4173/index.html'], cwd=root, check=True)
results = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
if args.offline_only and args.suite:
    parser.error('--offline-only and --suite cannot be combined')
for filename in (args.suite or (['offline-checks.js'] if args.offline_only else SUITES)):
    script = (root / 'tests' / filename).read_text().replace('__FILE_URL__', json.dumps((root / 'index.html').as_uri() + '?lang=en'))
    script = script.replace('__LEGACY_SAVE__', (root / 'tests/legacy-save.json').read_text())
    script = script.replace('__LEGACY_SAVE_40__', (root / 'tests/legacy-save-40.json').read_text())
    script = script.replace('__LEGACY_SAVE_50__', (root / 'tests/legacy-save-50.json').read_text())
    script = script.replace('__LEGACY_SAVE_60__', (root / 'tests/legacy-save-60.json').read_text())
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
(out / ('focused-browser-results.json' if args.suite else ('offline-results.json' if args.offline_only else 'browser-results.json'))).write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
