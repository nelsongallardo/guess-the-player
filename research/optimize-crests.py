#!/usr/bin/env python3
"""Optimize embedded crest PNGs; preserve keys, sources and offline portability.
Run with: uv run --with pillow python research/optimize-crests.py --source-ref ORIGINAL_GIT_SHA
PNG palette quantization is visually lossy. Review the contact sheet before publishing.
"""
import argparse
import subprocess
import base64
import io
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text()
match = re.search(r'const CREST_ASSETS = (.*?);\s*</script>', html, re.S)
parser=argparse.ArgumentParser()
parser.add_argument('--source-ref', required=True, help='Original pre-optimization git revision; never requantize optimized output')
args=parser.parse_args()
source=subprocess.check_output(['git','show',args.source_ref+':index.html'],cwd=ROOT,text=True)
crests=json.loads(re.search(r'const CREST_ASSETS = (.*?);\s*</script>',source,re.S).group(1))
current=json.loads(match.group(1))
assert set(crests)==set(current), 'Source revision has a different crest roster'
for url in crests:
    assert {k:v for k,v in crests[url].items() if k!='dataUrl'} == {k:v for k,v in current[url].items() if k!='dataUrl'}, 'Source metadata changed'
report = []
originals = {}
rows = (len(crests) + 7) // 8
sheet = Image.new('RGB', (8 * 144, rows * 94), '#f7f4eb')
draw = ImageDraw.Draw(sheet)
for index, (url, record) in enumerate(crests.items()):
    original = base64.b64decode(record['dataUrl'].split(',', 1)[1])
    originals[url] = record['dataUrl']
    image = Image.open(io.BytesIO(original)).convert('RGBA')
    resized = image.copy()
    resized.thumbnail((128, 128), Image.Resampling.LANCZOS)
    quantized = resized.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    buf = io.BytesIO()
    quantized.save(buf, format='PNG', optimize=True)
    candidate = buf.getvalue()
    # Never turn fully transparent background pixels into visible palette entries.
    alpha=resized.getchannel('A').tobytes()
    result_alpha=quantized.convert('RGBA').getchannel('A').tobytes()
    if any(a==0 and b!=0 for a,b in zip(alpha,result_alpha)):
        buf=io.BytesIO();resized.save(buf,format='PNG',optimize=True);candidate=buf.getvalue()
    optimized = candidate if len(candidate) < len(original) else original
    result = Image.open(io.BytesIO(optimized)).convert('RGBA')
    for offset, picture in [(0, image), (72, result)]:
        picture = picture.copy()
        picture.thumbnail((64, 64), Image.Resampling.LANCZOS)
        x, y = (index % 8) * 144 + offset, (index // 8) * 94
        sheet.paste(picture, (x + (64 - picture.width)//2, y), picture)
    draw.text(((index % 8)*144, (index // 8)*94 + 66), f'{index + 1}: before / after', fill='#122a38')
    record['dataUrl'] = 'data:image/png;base64,' + base64.b64encode(optimized).decode()
    report.append({'url': url, 'before': len(original), 'after': len(optimized), 'width': result.width, 'height': result.height})
new = json.dumps(crests, indent=2, ensure_ascii=False)
page.write_text(html[:match.start(1)] + new + html[match.end(1):])
output = ROOT / 'test-results'
output.mkdir(exist_ok=True)
sheet.save(output / 'crest-optimization-review.png')
(output / 'crest-optimization.json').write_text(json.dumps(report, indent=2))
(output / 'crest-optimization-originals.json').write_text(json.dumps(originals))
print(json.dumps({'count': len(report), 'before': sum(r['before'] for r in report), 'after': sum(r['after'] for r in report), 'report': str(output / 'crest-optimization.json')}))
