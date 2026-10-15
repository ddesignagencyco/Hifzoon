"""
Generates apps/web/docs/api-coverage.md — every backend route (from the NestJS
controllers) matched against the calls made by the web app's API layer.

Run from apps/web:  python scripts/api-coverage.py
Read-only over apps/api; writes only apps/web/docs/api-coverage.md.
"""
import os
import re
from collections import defaultdict
from datetime import date

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(WEB))
API_SRC = os.path.join(REPO, 'apps', 'api', 'src')
WEB_SRC = os.path.join(WEB, 'src')

DECOR = re.compile(r"@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|\"([^\"]*)\")?\s*\)")
CTRL = re.compile(r"@Controller\(\s*(?:'([^']*)'|\"([^\"]*)\")?\s*\)")
ROLES = re.compile(r"@Roles\(([^)]*)\)")


def norm(path: str) -> str:
    path = path.split('?')[0]
    path = re.sub(r'\$\{[^}]*\}', ':p', path)
    path = re.sub(r':[A-Za-z_]+', ':p', path)
    path = re.sub(r'/+', '/', '/' + path.strip('/'))
    return path.rstrip('/') or '/'


def roles_text(raw: str) -> str:
    return ', '.join(r.replace('Role.', '') for r in re.findall(r'Role\.\w+', raw))


# ── Backend routes ───────────────────────────────────────────────────────────
routes = []
for root, _, files in os.walk(API_SRC):
    for f in files:
        if not f.endswith('.controller.ts'):
            continue
        full = os.path.join(root, f)
        module = os.path.relpath(full, API_SRC).replace('\\', '/').split('/')
        module = module[1] if module[0] == 'modules' else module[0]
        lines = open(full, encoding='utf-8').read().split('\n')
        prefix, class_roles, pending_roles, pending_public = '', '', '', False
        for i, line in enumerate(lines):
            m = CTRL.search(line)
            if m:
                prefix = m.group(1) or m.group(2) or ''
                # class-level @Roles appears right after @Controller
                window = '\n'.join(lines[i:i + 3])
                rm = ROLES.search(window)
                class_roles = roles_text(rm.group(1)) if rm else ''
                pending_roles, pending_public = '', False
                continue
            rm = ROLES.search(line)
            if rm and not CTRL.search('\n'.join(lines[max(0, i - 2):i + 1])):
                pending_roles = roles_text(rm.group(1))
            if '@Public()' in line:
                pending_public = True
            dm = DECOR.search(line)
            if dm:
                method = dm.group(1).upper()
                sub = dm.group(2) or dm.group(3) or ''
                # decorators may follow the HTTP decorator; look ahead a few lines
                ahead = '\n'.join(lines[i + 1:i + 5])
                ar = ROLES.search(ahead)
                if ar and not DECOR.search(ahead.split('@Roles')[0]):
                    pending_roles = roles_text(ar.group(1))
                if '@Public()' in ahead.split('async')[0] and not DECOR.search(ahead.split('@Public()')[0]):
                    pending_public = True
                path = '/' + '/'.join(p for p in [prefix, sub] if p)
                access = 'Public' if pending_public else (pending_roles or class_roles or 'Any signed-in')
                routes.append({'module': module, 'method': method, 'path': path, 'key': (method, norm(path)), 'access': access})
                pending_roles, pending_public = '', False

# ── Web calls ────────────────────────────────────────────────────────────────
CALL = re.compile(
    r"(?:http\.(get|post|put|patch|delete|getPage)\s*(?:<[^()]*?>)?\s*\(\s*|apiRequest\s*(?:<[^()]*?>)?\s*\(\s*)([`'\"])(/[^`'\"]*)\2",
    re.S,
)
METHOD_IN_INIT = re.compile(r"method:\s*'(GET|POST|PUT|PATCH|DELETE)'")

web_calls = defaultdict(set)  # key -> set of files
for root, _, files in os.walk(os.path.join(WEB_SRC, 'lib')):
    for f in files:
        if not f.endswith('.ts'):
            continue
        full = os.path.join(root, f)
        text = open(full, encoding='utf-8').read()
        rel = os.path.relpath(full, WEB).replace('\\', '/')
        # Expand path helpers such as  const base = (id) => `/classroom/classes/${id}`;
        # (a helper with a ternary yields several alternatives, e.g. parent/teacher threads).
        helpers = {}
        for hm in re.finditer(r"const (\w+) = \([^)]*\)(?:\s*:\s*[\w<>\[\]| ]+)?\s*=>\s*([^;\n]+)", text):
            alts = [lit for _, lit in re.findall(r"([`'\"])(/[^`'\"]*)\1", hm.group(2))]
            if alts:
                helpers[hm.group(1)] = alts
        # ...and function-style helpers: function base(side) { return side === 'parent' ? '/parent/threads' : '/teacher/threads'; }
        for hm in re.finditer(r"function (\w+)\([^)]*\)[^{]*\{([^}]*)\}", text):
            alts = [lit for _, lit in re.findall(r"([`'\"])(/[^`'\"]*)\1", hm.group(2))]
            if alts:
                helpers[hm.group(1)] = alts
        expanded = [text]
        for name, alts in helpers.items():
            nxt = []
            for t in expanded:
                if re.search(r"(?<![\w.])" + name + r"\(", t):
                    for alt in alts:
                        t2 = re.sub(r"\$\{" + name + r"\([^)]*\)\}", lambda _m, a=alt: a, t)
                        t2 = re.sub(r"(?<![\w.])" + name + r"\([^)]*\)", lambda _m, a=alt: '`' + a + '`', t2)
                        nxt.append(t2)
                else:
                    nxt.append(t)
            expanded = nxt
        text = '\n'.join(expanded)
        for m in CALL.finditer(text):
            verb, path = m.group(1), m.group(3)
            if verb:
                method = 'GET' if verb == 'getPage' else verb.upper()
            else:
                tail = text[m.end():m.end() + 300]
                mm = METHOD_IN_INIT.search(tail)
                method = mm.group(1) if mm else 'GET'
            web_calls[(method, norm(path))].add(rel)

# Which screens use each module (imports of the module from hooks/components/app).
# Import graph over src/ (resolving '@/…' and relative imports) so each API module can be
# traced through hooks and components to the route pages that actually use it.
importers = defaultdict(set)  # file -> files that import it (paths relative to src/, no extension)
IMPORT = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")
for root, _, files in os.walk(WEB_SRC):
    for f in files:
        if not f.endswith(('.ts', '.tsx')):
            continue
        full = os.path.join(root, f)
        rel = os.path.relpath(full, WEB_SRC).replace(os.sep, '/')
        me = re.sub(r'\.tsx?$', '', rel)
        for spec in IMPORT.findall(open(full, encoding='utf-8').read()):
            if spec.startswith('@/'):
                target = spec[2:]
            elif spec.startswith('.'):
                target = os.path.normpath(os.path.join(os.path.dirname(me), spec)).replace(os.sep, '/')
            else:
                continue
            for cand in (target, target + '/index'):
                importers[cand].add(me)


def pages_using(module_path):
    """Route pages that (transitively) import the given src-relative module."""
    seen, stack, pages = set(), [module_path], set()
    while stack:
        cur = stack.pop()
        for user in importers.get(cur, ()):
            if user in seen:
                continue
            seen.add(user)
            if user.startswith('app/') and user.endswith('/page') or user == 'app/page':
                route = '/' + user[4:-len('page')].rstrip('/')
                pages.add(route if route != '/' else '/')
            stack.append(user)
    return pages


# Endpoints with a known backend issue (listed in docs/backendrequirement.md).
issues = defaultdict(set)
req_path = os.path.join(WEB, 'docs', 'backendrequirement.md')
if os.path.exists(req_path):
    for line in open(req_path, encoding='utf-8'):
        idm = re.match(r"\|\s*([SBMQ]\d+)\s*\|", line)
        if not idm:
            continue
        for raw in re.findall(r"`((?:GET |POST |PUT |PATCH |DELETE )?/[^`]+)`", line):
            for piece in re.split(r"\s*\|\s*|,\s*", raw.split(' ', 1)[-1] if raw[0] != '/' else raw):
                if piece.startswith('/'):
                    issues[norm(piece.replace('/api/v1', ''))].add(idm.group(1))

WHY = {'/health/live': 'Liveness probe for Docker/monitoring, not a UI concern',
       '/health/ready': 'Readiness probe for Docker/monitoring, not a UI concern'}

# ── Report ──────────────────────────────────────────────────────────────────
backend_keys = {r['key'] for r in routes}
integrated = [r for r in routes if r['key'] in web_calls]
missing = [r for r in routes if r['key'] not in web_calls]
web_only = sorted(k for k in web_calls if k not in backend_keys)

by_module = defaultdict(list)
for r in routes:
    by_module[r['module']].append(r)


def screens_for(files):
    screens = set()
    for f in files:
        mod = re.sub(r'\.ts$', '', f.replace('src/', '', 1))
        if mod == 'lib/api/client':
            continue  # imported almost everywhere; per-function usage is not traced
        screens |= pages_using(mod)
    return screens


out = []
out.append('# Hifzoon — API Coverage Report (Backend vs Web)')
out.append('')
out.append(f'**Generated:** {date.today().isoformat()} by `apps/web/scripts/api-coverage.py` (re-run after API changes).  ')
out.append('**Source of truth:** routes are read from `apps/api/src/**/*.controller.ts`; web usage from `apps/web/src/lib/api/**`.')
out.append('')
out.append('## Summary')
out.append('')
pct = round(100 * len(integrated) / max(1, len(routes)))
out.append('| | Count |')
out.append('| :--- | ---: |')
out.append(f'| Backend endpoints | {len(routes)} |')
out.append(f'| Used by the web app | {len(integrated)} ({pct}%) |')
out.append(f'| Not used by the web app | {len(missing)} |')
out.append(f'| Web calls with no matching backend route | {len(web_only)} |')
out.append('')
out.append('### By module')
out.append('')
out.append('| Module | Endpoints | Used | Coverage |')
out.append('| :--- | ---: | ---: | ---: |')
for mod in sorted(by_module):
    rs = by_module[mod]
    used = sum(1 for r in rs if r['key'] in web_calls)
    out.append(f'| {mod} | {len(rs)} | {used} | {round(100 * used / len(rs))}% |')
out.append('')
out.append('Legend: ✅ called by the web API layer · ⬜ not called · ⚠️ known backend issue — the ID links to `backendrequirement.md` (security, broken or missing behaviour). "Access" is the `@Roles`/`@Public` declared on the route.')
out.append('')
flagged = sum(1 for r in routes if issues.get(r['key'][1]))
out.append(f'**{flagged}** of the {len(routes)} endpoints have a known backend issue that the UI works around or cannot fix.')
out.append('')

for mod in sorted(by_module):
    out.append(f'## {mod}')
    out.append('')
    out.append('| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |')
    out.append('| :---: | :--- | :--- | :--- | :--- | :--- | :--- |')
    for r in sorted(by_module[mod], key=lambda x: (x['path'], x['method'])):
        files = sorted(web_calls.get(r['key'], ()))
        mark = '✅' if files else '⬜'
        client = '<br>'.join(f'`{f.replace("src/lib/api/", "")}`' for f in files) or '—'
        screens = sorted(screens_for(files))
        used_on = ', '.join(f'`{s}`' for s in screens[:4]) + (f' +{len(screens) - 4}' if len(screens) > 4 else '') if screens else ('—' if not files else 'auth / site-wide (`client.ts`)')
        ids = sorted(issues.get(r['key'][1], ()))
        issue = '⚠️ ' + ', '.join(ids) if ids else ''
        out.append(f"| {mark} | {r['method']} | `/api/v1{r['path']}` | {r['access']} | {client} | {used_on} | {issue} |")
    out.append('')

out.append('## Not used by the web app')
out.append('')
if missing:
    out.append('| Method | Endpoint | Access | Why |')
    out.append('| :--- | :--- | :--- | :--- |')
    for r in sorted(missing, key=lambda x: (x['module'], x['path'])):
        out.append(f"| {r['method']} | `/api/v1{r['path']}` | {r['access']} | {WHY.get(r['path'], '')} |")
else:
    out.append('None.')
out.append('')
out.append('## Web calls with no matching backend route')
out.append('')
if web_only:
    out.append('| Method | Path (normalised) | Called from |')
    out.append('| :--- | :--- | :--- |')
    for k in web_only:
        out.append(f"| {k[0]} | `{k[1]}` | {', '.join(sorted(web_calls[k]))} |")
else:
    out.append('None — every web call maps to a real backend route.')
out.append('')

dest = os.path.join(WEB, 'docs', 'api-coverage.md')
open(dest, 'w', encoding='utf-8').write('\n'.join(out))
print(f'routes={len(routes)} used={len(integrated)} missing={len(missing)} web_only={len(web_only)} -> {dest}')
