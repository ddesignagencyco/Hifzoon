import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { ZodTypeAny } from 'zod';

import { zodToOpenApi } from '../swagger/zod-to-openapi';

/**
 * OpenAPI metadata for controllers that validate with zod (PLAT-BE-03).
 *
 * The problem this solves: there were two ways to validate a request and only one of
 * them produced documentation. Controllers using `class-validator` DTOs got real request
 * bodies in the spec; controllers using zod got `{}`, because `@nestjs/swagger` cannot
 * introspect a zod schema. That meant Swagger's "Try it out" could not show a caller what
 * to send, and no client could be generated from those endpoints.
 *
 * Rather than rewrite every controller to class-validator — which would give up the
 * single-source-of-truth guarantee the zod schemas provide — the metadata is derived from
 * the same schema object that does the validating. Validation and documentation therefore
 * cannot drift.
 *
 * These decorators are **metadata only**. Keep passing `new ZodValidationPipe(schema)` to
 * `@Body`/`@Query`; combining both here would validate twice for no benefit.
 */
export const ZodBody = (schema: ZodTypeAny) =>
  applyDecorators(
    ApiBody({
      schema: zodToOpenApi(schema) as never,
      required: !schema.isOptional(),
    }),
  );

/**
 * Documents query parameters from the same schema that parses them.
 *
 * Each property becomes a separate `ApiQuery`, which is what Swagger renders as a list of
 * fields — an inline object schema would instead show as one opaque "body" parameter.
 */
export const ZodQuery = (schema: ZodTypeAny) => {
  const { properties, required } = objectParts(schema);

  return applyDecorators(
    ...Object.entries(properties).map(([key, value]) =>
      ApiQuery({ name: key, required: required.has(key), schema: value as never }),
    ),
  );
};

/** Documents path parameters. */
export const ZodParam = (schema: ZodTypeAny) => {
  const { properties, required } = objectParts(schema);

  return applyDecorators(
    ...Object.entries(properties).map(([key, value]) =>
      ApiParam({ name: key, required: required.has(key), schema: value }),
    ),
  );
};

/**
 * Documents a success body.
 *
 * Every payload is wrapped in `{ data, meta }` by the global response interceptor, so
 * this describes the *inner* shape. The envelope itself is declared once by
 * `ENVELOPE_SCHEMA` rather than repeated on every operation.
 */
export const ZodResponse = (
  status: number,
  schema: ZodTypeAny,
  description = 'Successful response',
) => applyDecorators(ApiResponse({ status, description, schema: zodToOpenApi(schema) }));

function objectParts(schema: ZodTypeAny): {
  properties: Record<string, Record<string, unknown>>;
  required: Set<string>;
} {
  const converted = zodToOpenApi(schema);
  return {
    properties: (converted.properties ?? {}) as Record<string, Record<string, unknown>>,
    required: new Set((converted.required as string[] | undefined) ?? []),
  };
}
