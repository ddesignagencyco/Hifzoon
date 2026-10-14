import { DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';

/**
 * Single source of truth for the OpenAPI document configuration (PLAT-BE-03).
 *
 * `main.ts` uses it to serve Swagger UI in development and staging; `openapi.ts` uses
 * it to emit the artifact the frontend generates its client from. If these two ever
 * diverged, the published contract would not match the served one — so there is only
 * one builder.
 */
export function buildOpenApiConfig(): Omit<OpenAPIObject, 'paths'> {
  const builder = new DocumentBuilder()
    .setTitle('Hifzoon API')
    .setDescription(
      'Backend contract for Hifzoon. Every successful response is `{ data, meta? }` and every ' +
        'error is `{ statusCode, code, message, details? }`. Requirement IDs (FR-*, CR-*, NFR-*) ' +
        'in operation summaries are traceable to docs/Hifzoon-TRD.md and the test suite.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer('/api/v1', 'Relative base');

  return builder.build();
}

/**
 * Strips the global prefix from operation paths.
 *
 * The spec declares its base once, as the server URL `/api/v1`, and operation paths are
 * relative to it. Nest, however, prepends the global prefix to generated paths when the
 * document is created after `setGlobalPrefix()` — which makes Swagger UI request
 * `/api/v1/api/v1/health/live` and the generated frontend client point at a route that
 * does not exist.
 *
 * Normalising here rather than trusting a Nest option means the served document and the
 * committed artifact are byte-identical in this respect, whichever way Nest is
 * configured: the artifact is produced without a prefix, so the served one must not
 * have one either.
 */
export function normalisePaths(document: OpenAPIObject, prefix = '/api/v1'): OpenAPIObject {
  if (!document.paths) return document;

  const rewritten: NonNullable<OpenAPIObject['paths']> = {};
  for (const [path, operations] of Object.entries(document.paths)) {
    const key =
      path === prefix ? '/' : path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path;
    rewritten[key] = operations;
  }
  document.paths = rewritten;
  return document;
}
