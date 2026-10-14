import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

import { AppError } from '../errors/app-error';

/**
 * Runs the zod schemas from `packages/shared` (TRD section 2) so the API contract
 * and the FE contract cannot drift. class-validator is reserved for DTOs that need
 * OpenAPI metadata; everything else goes through here.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw AppError.badRequest('Request validation failed', formatIssues(error));
      }
      throw error;
    }
  }
}

export function formatIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function zodPipe<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
