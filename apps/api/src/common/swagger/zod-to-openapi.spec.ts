import { z } from 'zod';

import { zodToOpenApi } from './zod-to-openapi';

/**
 * Converter tests.
 *
 * These exist because the alternative failure mode is quiet: a converter that emits an
 * empty schema still produces a valid OpenAPI document, Swagger still loads, and the
 * defect is only discovered by someone trying to call the endpoint. Each case pins a
 * construct the controllers actually use.
 */
describe('zodToOpenApi', () => {
  it('maps primitives with their constraints', () => {
    expect(zodToOpenApi(z.string())).toMatchObject({ type: 'string' });
    expect(zodToOpenApi(z.number().int().min(1).max(5))).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 5,
    });
    expect(zodToOpenApi(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('maps string formats and lengths', () => {
    expect(zodToOpenApi(z.string().uuid())).toMatchObject({ format: 'uuid' });
    expect(zodToOpenApi(z.string().email())).toMatchObject({ format: 'email' });
    expect(zodToOpenApi(z.string().url())).toMatchObject({ format: 'uri' });
    expect(zodToOpenApi(z.string().min(2).max(160))).toMatchObject({
      minLength: 2,
      maxLength: 160,
    });
  });

  it('maps dates to date-time strings', () => {
    // z.coerce.date() is what every timestamp field in the API uses.
    expect(zodToOpenApi(z.coerce.date())).toEqual({ type: 'string', format: 'date-time' });
  });

  it('maps enums, including TypeScript string enums', () => {
    expect(zodToOpenApi(z.enum(['OPEN', 'CLOSED']))).toEqual({
      type: 'string',
      enum: ['OPEN', 'CLOSED'],
    });

    const Role = { TEACHER: 'TEACHER', ADMIN: 'ADMIN' } as const;
    const converted = zodToOpenApi(z.nativeEnum(Role));
    expect(converted.enum).toEqual(expect.arrayContaining(['TEACHER', 'ADMIN']));
  });

  it('marks a field optional when it has a default', () => {
    // A field with `.default()` may be omitted by the caller, so listing it as required
    // would make Swagger show an input the API does not actually demand.
    const schema = z.object({
      required: z.string(),
      defaulted: z.number().default(25),
    });

    const converted = zodToOpenApi(schema);
    expect(converted.required).toEqual(['required']);
    expect(
      (converted.properties as Record<string, Record<string, unknown>>).defaulted,
    ).toMatchObject({
      type: 'number',
      default: 25,
    });
  });

  it('unwraps optional and nullable', () => {
    expect(zodToOpenApi(z.string().optional())).toMatchObject({ type: 'string' });
    expect(zodToOpenApi(z.number().nullable())).toMatchObject({ type: 'number' });
  });

  it('maps arrays and their bounds', () => {
    expect(zodToOpenApi(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(zodToOpenApi(z.string().array().min(1).max(5))).toMatchObject({
      minItems: 1,
      maxItems: 5,
    });
  });

  it('maps objects and closes them to additional properties', () => {
    const converted = zodToOpenApi(z.object({ a: z.string(), b: z.number() }));

    expect(converted.type).toBe('object');
    // Without this, Swagger invites a caller to send fields the validator will reject.
    expect(converted.additionalProperties).toBe(false);
    expect(converted.required).toEqual(['a', 'b']);
  });

  it('collapses a union of literals into one enum', () => {
    // Rendering `anyOf` of single-value branches produces an unreadable spec; a union
    // of literals is just an enum.
    expect(zodToOpenApi(z.union([z.literal('a'), z.literal('b')]))).toEqual({
      type: 'string',
      enum: ['a', 'b'],
    });
  });

  it('falls back to anyOf for a non-literal union', () => {
    const converted = zodToOpenApi(z.union([z.string(), z.number()]));
    expect(converted).toHaveProperty('anyOf');
  });

  it('maps records as an object with a typed value', () => {
    expect(zodToOpenApi(z.record(z.number()))).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
  });

  it('unwraps refine/transform effects so the shape still documents', () => {
    const refined = z
      .string()
      .min(3)
      .refine((v) => v.length > 2, 'too short');
    expect(zodToOpenApi(refined)).toMatchObject({ type: 'string', minLength: 3 });
  });

  it('produces something usable rather than throwing for an unknown type', () => {
    // A converter that throws would break the build over documentation. Degrading to a
    // permissive schema is strictly better than failing a deployment.
    expect(() => zodToOpenApi(z.any())).not.toThrow();
    expect(zodToOpenApi(z.any())).toEqual({});
  });

  it('handles the shape used by a real controller schema', () => {
    const body = z.object({
      email: z.string().email().max(320),
      stars: z.number().int().min(1).max(5),
      studentId: z.string().uuid().optional(),
      source: z.string().max(60).default('website'),
      reasons: z.array(z.string()).optional(),
    });

    const converted = zodToOpenApi(body) as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };

    expect(converted.required).toEqual(['email', 'stars']);
    expect(converted.properties.email).toMatchObject({ type: 'string', format: 'email' });
    expect(converted.properties.stars).toMatchObject({ type: 'integer', minimum: 1, maximum: 5 });
    expect(converted.properties.reasons).toMatchObject({ type: 'array' });
  });
});
