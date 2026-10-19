import { BadRequestException, ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;
  messages: string[];
}

/**
 * Flattens class-validator errors into one entry per field (Q25).
 *
 * The filter used to recover the field by splitting each message string on ": ", which
 * assumes every message looks like "<constraint>: <property> …". Messages from `@IsIn` and
 * `@IsEnum` read "roomType must be one of the following values: A, B", so the "field" came
 * out as the value list ("ONE_TO_ONE,"), and messages without ": " were dropped altogether.
 * `ValidationError` already carries the property and its constraints, so read those, and
 * walk `children` so a nested DTO reports `parent.child`.
 */
export function collectFieldErrors(errors: ValidationError[], parent = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      out.push({ field, messages: Object.values(error.constraints) });
    }
    if (error.children?.length) out.push(...collectFieldErrors(error.children, field));
  }
  return out;
}

/** `ValidationPipe({ exceptionFactory })` — same 400 as before, with reliable `details`. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const details = collectFieldErrors(errors);
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    // Kept as the flat list class-validator produced, for clients that show the text.
    message: details.flatMap((d) => d.messages),
    details,
  });
}
