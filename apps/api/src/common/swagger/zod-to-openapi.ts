import { z } from 'zod';
import type { ZodTypeAny } from 'zod';

/**
 * zod → OpenAPI 3 schema converter (PLAT-BE-03).
 *
 * The problem this solves: controllers validate with zod because the FE imports the
 * same schemas, but `@nestjs/swagger` can only introspect class-validator DTOs. The
 * result is a spec whose request bodies are `{}` — "Execute" works in the browser, but
 * nobody can generate a client from it and nobody can see what a field means.
 *
 * This converts the subset of zod the API actually uses. Anything unrecognised degrades
 * to a permissive `{}` schema rather than throwing, because a missing schema in the docs
 * must never be able to fail a build or a request.
 *
 * Handlers still receive a real `ZodValidationPipe`; this only decorates metadata.
 */
export function zodToOpenApi(schema: ZodTypeAny, depth = 0): Record<string, unknown> {
  // Guards against a self-referential schema recursing forever when generating docs.
  if (depth > 12) return {};

  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  const typeName = def.typeName;

  switch (typeName) {
    case z.ZodFirstPartyTypeKind.ZodString: {
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: number; regex?: RegExp }>;
      const out: Record<string, unknown> = { type: 'string' };

      for (const check of checks) {
        if (check.kind === 'uuid') out.format = 'uuid';
        if (check.kind === 'email') out.format = 'email';
        if (check.kind === 'url') out.format = 'uri';
        if (check.kind === 'min' && typeof check.value === 'number') out.minLength = check.value;
        if (check.kind === 'max' && typeof check.value === 'number') out.maxLength = check.value;
        if (check.kind === 'regex' && check.regex) out.pattern = check.regex.source;
      }
      return out;
    }

    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const checks = (def.checks ?? []) as Array<{
        kind: string;
        value: number;
        inclusive?: boolean;
      }>;
      const out: Record<string, unknown> = { type: 'number' };

      for (const check of checks) {
        if (check.kind === 'int') out.type = 'integer';
        if (check.kind === 'min') out.minimum = check.value;
        if (check.kind === 'max') out.maximum = check.value;
      }
      return out;
    }

    case z.ZodFirstPartyTypeKind.ZodBigInt:
      return { type: 'integer', format: 'int64' };

    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return { type: 'boolean' };

    case z.ZodFirstPartyTypeKind.ZodNull:
      return { type: 'null' };

    case z.ZodFirstPartyTypeKind.ZodDate:
      return { type: 'string', format: 'date-time' };

    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return { type: typeof def.value, enum: [def.value] };

    case z.ZodFirstPartyTypeKind.ZodEnum:
      return { type: 'string', enum: def.values };

    case z.ZodFirstPartyTypeKind.ZodNativeEnum: {
      // A TS numeric enum has reverse mappings, so the real members are the values
      // that are not themselves keys of the object. Filtering on `typeof v !== number`
      // is wrong for numeric enums; comparing against the keys is the reliable test.
      const values = Object.values(def.values as Record<string, unknown>);
      const keys = Object.keys(def.values as Record<string, unknown>);
      const members = values.filter((v) => !keys.includes(String(v)) || typeof v === 'string');
      return members.length > 0 ? { type: 'string', enum: members } : {};
    }

    case z.ZodFirstPartyTypeKind.ZodArray: {
      const out: Record<string, unknown> = {
        type: 'array',
        items: zodToOpenApi(def.type as ZodTypeAny, depth + 1),
      };
      const min = def.minLength as { value: number } | null;
      const max = def.maxLength as { value: number } | null;
      if (min?.value !== undefined) out.minItems = min.value;
      if (max?.value !== undefined) out.maxItems = max.value;
      return out;
    }

    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (def.shape as () => Record<string, ZodTypeAny>)();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        // `.default()` makes a field optional in the request even though its output
        // type is not, so the required list has to be derived from the wrapper, not
        // from `value.isOptional()` alone.
        if (!isOptionalWrapper(value)) required.push(key);
        properties[key] = zodToOpenApi(value, depth + 1);
      }

      const out: Record<string, unknown> = {
        type: 'object',
        properties,
        additionalProperties: false,
      };
      if (required.length > 0) out.required = required;
      return out;
    }

    case z.ZodFirstPartyTypeKind.ZodRecord:
      return {
        type: 'object',
        additionalProperties: zodToOpenApi(def.valueType as ZodTypeAny, depth + 1),
      };

    case z.ZodFirstPartyTypeKind.ZodUnion:
    case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
      const options = (def.options as ZodTypeAny[] | Map<unknown, ZodTypeAny>) ?? [];
      const list = Array.isArray(options) ? options : [...options.values()];
      const converted = list.map((o) => zodToOpenApi(o, depth + 1));

      // A union of plain literals/enums collapses into one enum, which renders far
      // better in Swagger than a list of single-value anyOf branches.
      const allEnums = converted.every((c) => Array.isArray(c.enum));
      if (allEnums) {
        const merged = converted.flatMap((c) => c.enum as unknown[]);
        return { type: typeof merged[0], enum: [...new Set(merged)] };
      }

      return { anyOf: converted };
    }

    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return zodToOpenApi(def.innerType as ZodTypeAny, depth + 1);

    case z.ZodFirstPartyTypeKind.ZodDefault: {
      const inner = zodToOpenApi(def.innerType as ZodTypeAny, depth + 1);
      // In zod 3 `defaultValue` is a thunk, not the value, so it has to be invoked.
      // A thunk that throws (e.g. `Math.random()`) must not take the whole spec down.
      let value: unknown;
      try {
        value = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
      } catch {
        return inner;
      }
      return { ...inner, default: value };
    }

    case z.ZodFirstPartyTypeKind.ZodEffects:
      // `.refine()`/`.transform()` wrap the real schema; unwrap so the docs still show
      // the shape rather than nothing at all.
      return zodToOpenApi(def.schema as ZodTypeAny, depth + 1);

    case z.ZodFirstPartyTypeKind.ZodPipeline:
      return zodToOpenApi(def.in as ZodTypeAny, depth + 1);

    case z.ZodFirstPartyTypeKind.ZodAny:
    case z.ZodFirstPartyTypeKind.ZodUnknown:
      return {};

    default:
      return {};
  }
}

function isOptionalWrapper(value: ZodTypeAny): boolean {
  const def = value._def as { typeName?: string };
  return (
    def.typeName === z.ZodFirstPartyTypeKind.ZodOptional ||
    def.typeName === z.ZodFirstPartyTypeKind.ZodDefault ||
    value.isOptional()
  );
}
