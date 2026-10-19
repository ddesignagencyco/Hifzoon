import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeHttpStatus, type ErrorCodeValue } from '@hifzoon/shared';

/**
 * The single error type feature code throws. The filter turns it into the
 * `{ statusCode, code, message, details? }` envelope every client depends on
 * (TRD section 5.1) — controllers never build a response by hand.
 */
export class AppError extends HttpException {
  readonly code: ErrorCodeValue;
  readonly details?: unknown;

  constructor(code: ErrorCodeValue, message: string, details?: unknown) {
    const status = ErrorCodeHttpStatus[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_FAILED, message, details);
  }

  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError(ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have access to this resource'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`);
  }

  /** Ownership failure (NFR-SEC-02) — deliberately not 404: no existence oracle. */
  static notOwner(message = 'You do not have access to this record'): AppError {
    return new AppError(ErrorCode.NOT_RESOURCE_OWNER, message);
  }

  static conflict(code: ErrorCodeValue, message: string, details?: unknown): AppError {
    return new AppError(code, message, details);
  }

  static notImplemented(what: string): AppError {
    return new AppError(ErrorCode.NOT_IMPLEMENTED, `${what} is not available on this deployment`);
  }
}
