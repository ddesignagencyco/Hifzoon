import type { OpenAPIObject } from '@nestjs/swagger';

import { normalisePaths } from './openapi-config';

/**
 * The Swagger UI used to request `/api/v1/api/v1/health/live`: the spec declared its
 * base as the server URL `/api/v1` while Nest had also prepended the global prefix to
 * every path. The result looked fine in the browser and failed on "Try it out", and it
 * would have produced a frontend client pointing at routes that do not exist.
 *
 * These tests pin the invariant, because the bug is invisible until someone clicks.
 */
describe('OpenAPI path normalisation', () => {
  const withPaths = (paths: string[]): OpenAPIObject =>
    ({
      servers: [{ url: '/api/v1' }],
      paths: Object.fromEntries(paths.map((p) => [p, { get: { summary: 'x' } }])),
    }) as unknown as OpenAPIObject;

  it('leaves unprefixed paths untouched', () => {
    const document = normalisePaths(withPaths(['/health/live', '/auth/login']));

    expect(Object.keys(document.paths!)).toEqual(['/health/live', '/auth/login']);
  });

  it('strips the global prefix Nest prepended', () => {
    const document = normalisePaths(withPaths(['/api/v1/health/live', '/api/v1/auth/login']));

    expect(Object.keys(document.paths!)).toEqual(['/health/live', '/auth/login']);
  });

  it('is idempotent, so running it twice cannot strip a second prefix', () => {
    const once = normalisePaths(withPaths(['/api/v1/health/live']));
    const twice = normalisePaths(once);

    expect(Object.keys(twice.paths!)).toEqual(['/health/live']);
  });

  it('collapses a path that is exactly the prefix to the root', () => {
    const document = normalisePaths(withPaths(['/api/v1']));

    expect(Object.keys(document.paths!)).toEqual(['/']);
  });

  it('only strips a leading prefix, not one appearing later in the path', () => {
    const document = normalisePaths(withPaths(['/classes/api/v1/thing']), '/api/v1');

    expect(Object.keys(document.paths!)).toEqual(['/classes/api/v1/thing']);
  });

  it('handles a document with no paths at all', () => {
    const document = normalisePaths({ servers: [] } as unknown as OpenAPIObject);

    expect(document.paths).toBeUndefined();
  });

  it('keeps the operations attached to their paths', () => {
    const document = normalisePaths(withPaths(['/api/v1/health/live']));

    expect(document.paths!['/health/live']).toBeDefined();
  });
});
