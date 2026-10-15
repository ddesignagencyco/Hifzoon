import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '../..');
const APP = path.join(WEB, 'src/app');

/** Every route path (e.g. `/courses/[code]`) that has a page.tsx under src/app. */
function appRoutes(dir = APP, prefix = ''): string[] {
  const out: string[] = [];
  if (existsSync(path.join(dir, 'page.tsx'))) out.push(prefix || '/');
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Route groups `(name)` don't add a URL segment.
    const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`;
    out.push(...appRoutes(path.join(dir, entry.name), prefix + segment));
  }
  return out;
}

function matches(route: string, href: string): boolean {
  const r = route.split('/').filter(Boolean);
  const h = href.split('/').filter(Boolean);
  if (r.length !== h.length) return false;
  return r.every((seg, i) => /^\[.+\]$/.test(seg) || seg === h[i]);
}

/** Internal hrefs (string literals and `href: '...'` entries) in a source file. */
function internalHrefs(file: string): string[] {
  const src = readFileSync(path.join(WEB, file), 'utf8');
  const found = new Set<string>();
  for (const m of src.matchAll(/href(?:=|:\s*)\{?\s*["'`]([^"'`$]+)["'`]/g)) found.add(m[1]);
  return [...found]
    .filter((h) => h.startsWith('/'))
    .map((h) => h.split(/[?#]/)[0] || '/');
}

describe('header & footer links', () => {
  const routes = appRoutes();

  for (const file of ['src/components/layout/Header.tsx', 'src/components/layout/Footer.tsx']) {
    it(`every link in ${path.basename(file)} resolves to an app route`, () => {
      const hrefs = internalHrefs(file);
      expect(hrefs.length).toBeGreaterThan(3);
      const broken = hrefs.filter((h) => !routes.some((r) => matches(r, h)));
      expect(broken).toEqual([]);
    });
  }

  it('the policy pages exist', () => {
    for (const p of ['/child-safety', '/privacy', '/terms', '/refunds']) expect(routes).toContain(p);
  });
});
