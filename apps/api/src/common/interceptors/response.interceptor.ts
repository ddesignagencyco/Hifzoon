import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ApiSuccessResponse } from '@hifzoon/shared';
import { Observable, map } from 'rxjs';

/**
 * Wraps every successful response in `{ data, meta }` (TRD section 5.1) so the FE
 * client has one contract for all endpoints.
 *
 * Handlers that build their own envelope (`paginated()` helper) are passed through
 * untouched — the marker key is non-enumerable so it never reaches the client.
 */
export const ENVELOPE_MARKER = Symbol('api-envelope');

export interface EnvelopedResponse<T> extends ApiSuccessResponse<T> {
  [ENVELOPE_MARKER]?: true;
}

export function markEnveloped<T>(response: ApiSuccessResponse<T>): EnvelopedResponse<T> {
  Object.defineProperty(response, ENVELOPE_MARKER, { value: true, enumerable: false });
  return response;
}

export function isEnveloped(value: unknown): boolean {
  return typeof value === 'object' && value !== null && ENVELOPE_MARKER in value;
}

interface RequestWithId {
  id?: string;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, ApiSuccessResponse<unknown>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<ApiSuccessResponse<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const requestId = request?.id;

    return next.handle().pipe(
      map((payload: unknown): ApiSuccessResponse<unknown> => {
        if (isEnveloped(payload)) return payload as ApiSuccessResponse<unknown>;
        return {
          data: payload ?? null,
          meta: { requestId },
        };
      }),
    );
  }
}
