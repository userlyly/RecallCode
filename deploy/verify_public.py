"""Read-only smoke test of a public RecallCode deployment.
Usage: python deploy/verify_public.py https://your-service.onrender.com
"""
import json
import sys
from urllib.parse import urljoin
from urllib.request import Request, urlopen

if len(sys.argv) != 2 or not sys.argv[1].startswith('https://'):
    raise SystemExit('Usage: python deploy/verify_public.py https://your-service.onrender.com')
base = sys.argv[1].rstrip('/') + '/'
for path in ('api/health', '', 'static/app.js'):
    url = urljoin(base, path)
    with urlopen(Request(url, headers={'User-Agent': 'RecallCode-Deploy-Check/1.0'}), timeout=30) as r:
        payload = r.read(600)
        if r.status != 200:
            raise SystemExit(f'FAIL {url}: HTTP {r.status}')
        if path == 'api/health' and json.loads(payload) != {'ok': True}:
            raise SystemExit(f'FAIL {url}: unexpected health response')
        if not payload:
            raise SystemExit(f'FAIL {url}: empty response')
        print('PASS', url, r.status)
print('All read-only checks passed.')
