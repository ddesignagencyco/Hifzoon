import { randomUUID } from 'node:crypto';

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode, ErrorCodeHttpStatus, ErrorCodeValue, SENSITIVE_FIELDS } from '@hifzoon/shared';
import { Prisma } from '@prisma/client';

import { AppError } from '../errors/app-error';
import { captureError } from '../../observability/telemetry';

/**
 * Every unhandled error leaves the API through here so the response shape is
 * identical whether it came from a controller, Prisma or an unexpected throw
 * (TRD section 5.1). 5xx details are never leaked to the client; the full error is
 * logged instead (NFR-SEC-01).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId: string | undefined = request?.id ?? request?.headers?.['x-request-id'];

    const mapped = this.map(exception);

    if (mapped.status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} -> ${mapped.status} ${mapped.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // Only 5xx reach Sentry: a 4xx is a caller mistake the client already sees, and
      // forwarding it would drown the real server faults (PLAT-BE-05).
      captureError(exception, {
        method: request?.method,
        url: request?.url,
        status: mapped.status,
        code: mapped.code,
        requestId,
      });
    } else {
      this.logger.debug(`${request?.method} ${request?.url} -> ${mapped.status} ${mapped.code}`);
    }

    response.status(mapped.status).json({
      statusCode: mapped.status,
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
      requestId: requestId ?? randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }

  private map(exception: unknown): {
    status: number;
    code: ErrorCodeValue;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppError) {
      return {
        status: ErrorCodeHttpStatus[exception.code],
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // Outside production, hand the developer the exact field Prisma rejected. In
      // production this is schema detail and must not leave the process.
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request failed database validation',
        details: process.env.NODE_ENV === 'production' ? undefined : { reason: exception.message },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const code = this.codeFromStatus(status);
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] })?.message as string) || exception.message;
      const details =
        typeof payload === 'object' && payload !== null && 'details' in payload
          ? payload.details
          : undefined;
      return {
        status,
        code,
        message: Array.isArray(message) ? 'Request validation failed' : message,
        details,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  /** Prisma error codes we can translate into a stable API contract. */
  private mapPrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: ErrorCodeValue;
    message: string;
    details?: unknown;
  } {
    const target = (exception.meta?.target as string[] | string | undefined) ?? undefined;
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'A record with these unique values already exists',
          details: { fields: target },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Referenced record does not exist',
          details: { field: target },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'Write conflict, please retry',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Internal server error',
        };
    }
  }

  private codeFromStatus(status: number): ErrorCodeValue {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_FAILED;
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 423: // Locked
        return ErrorCode.ACCOUNT_LOCKED;
      case 429:
        return ErrorCode.RATE_LIMITED;
      default:
        return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED;
    }
  }
}

/** Keys that must never reach the audit trail, logs or traces (CR-07, NFR-SEC-01). */
export function redact(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redact);
  if (input instanceof Date) return input.toISOString();

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = SENSITIVE_FIELDS.includes(key) ? '[redacted]' : redact(value);
  }
  return out;
}
