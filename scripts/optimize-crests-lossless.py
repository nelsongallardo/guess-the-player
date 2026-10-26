"""Losslessly optimize embedded PNGs, preserving pixels, profiles and attribution.

uv run --with pyoxipng --with pillow python scripts/optimize-crests-lossless.py \
    --source-ref 8c9168e

Only crest-data is rewritten. Start from the named revision, not an earlier
lossy export; refuse a source with a different crest set or attribution.
"""
import argparse
import base64
import io
import json
from pathlib import Path
import re
import subprocess

import oxipng
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PATTERN = re.compile(r'const CREST_ASSETS = ([\s\S]*?);\s*</script>')


def assets(html):
    match = PATTERN.search(html)
    if not match:
        raise ValueError('Missing crest-data literal')
    return match, json.loads(match[1])


def pixels(png):
    with Image.open(io.BytesIO(png)) as image:
        return image.size, image.convert('RGBA').tobytes(), image.info.get('icc_profile')


def metadata(crests):
    return {key: {k: v for k, v in value.items() if k != 'dataUrl'}
            for key, value in crests.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-ref', required=True)
    args = parser.parse_args()
    baseline = subprocess.check_output(
        ['git', 'show', f'{args.source_ref}:index.html'], cwd=ROOT, text=True)
    path = ROOT / 'index.html'
    html = path.read_text()
    match, current = assets(html)
    _, original = assets(baseline)
    if metadata(current) != metadata(original):
        raise ValueError('Source crest keys or attribution differ from the current file')
    before = after = changed = 0
    for key, value in original.items():
        raw = base64.b64decode(value['dataUrl'].split(',', 1)[1], validate=True)
        existing = base64.b64decode(current[key]['dataUrl'].split(',', 1)[1], validate=True)
        expected = pixels(raw)
        if pixels(existing) != expected:
            raise ValueError(f'Source pixels/profile differ from current crest: {key}')
        optimized = oxipng.optimize_from_memory(raw, level=4)
        if pixels(optimized) != expected:
            raise ValueError(f'Optimizer changed pixels, dimensions or profile: {key}')
        # Keep the smallest pixel-identical PNG, including any existing encoding.
        smallest = min((raw, existing, optimized), key=len)
        current[key]['dataUrl'] = 'data:image/png;base64,' + base64.b64encode(smallest).decode()
        before += len(raw)
        after += len(smallest)
        changed += smallest != raw
    literal = '{\n' + ',\n'.join(
        '  ' + json.dumps(key, ensure_ascii=False) + ': ' +
        json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        for key, value in current.items()) + '\n}'
    path.write_text(html[:match.start(1)] + literal + html[match.end(1):])
    print(json.dumps({'crests': len(current), 'optimized': changed,
                      'pngBefore': before, 'pngAfter': after,
                      'pixelsDimensionsProfilesAttributionPreserved': True}, indent=2))


if __name__ == '__main__':
    main()
