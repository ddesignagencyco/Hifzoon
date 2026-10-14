import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';

import { AUDIT_KEY, type AuditMetadata, type RequestWithUser } from '../../common/decorators';
import { AuditService } from './audit.service';

/**
 * Turns `@Audit()` on a controller method into a row in `audit_log` (FR-OPS-06).
 *
 * The design decision worth calling out is that this reads the *handler's own
 * return value* rather than re-reading the database. That is what makes the "after"
 * image trustworthy — it is the data that was actually sent to the client, including
 * server-generated fields like `updatedAt`, with no second query that could observe a
 * later concurrent write.
 *
 * Failures inside `AuditService.record` are swallowed by design: an audit problem must
 * not roll back or 500 a request that already succeeded. The service counts failures
 * and `AuditService.list` surfaces the count, so the condition is still visible to an
 * operator instead of being silently discarded.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    return next.handle().pipe(
      tap({
        next: (result: unknown) => {
          const targetId = this.resolveTargetId(metadata, request, result);
          void this.audit.record({
            actorId: request.user?.id ?? null,
            action: metadata.action,
            targetType: metadata.targetType,
            targetId,
            after: metadata.captureBody === false ? undefined : result,
            ip: clientIp(request),
            requestId: request.id,
          });
        },
        error: (error: Error & { status?: number }) => {
          // A failed action is still an action worth recording — a repeated sequence of
          // denials on one endpoint is exactly what a safeguarding review looks for.
          void this.audit.record({
            actorId: request.user?.id ?? null,
            action: `${metadata.action}.denied`,
            targetType: metadata.targetType,
            targetId: this.resolveTargetId(metadata, request),
            before: { error: error.message, status: error.status ?? 500 },
            ip: clientIp(request),
            requestId: request.id,
          });
        },
      }),
    );
  }

  /**
   * Prefers an id from the response, then one in the path, then one in the body.
   * The order matters: a resource created by this request has an id the client never
   * sent, so the response is the only place it exists.
   */
  private resolveTargetId(
    metadata: AuditMetadata,
    request: Request,
    result?: unknown,
  ): string | undefined {
    if (metadata.targetId) return metadata.targetId;

    const fromBody = (result as { data?: { id?: string } } | null)?.data;
    if (fromBody?.id) return fromBody.id;

    const pathId = (request.params as Record<string, string> | undefined)?.id;
    if (pathId) return pathId;

    const bodyId = (request.body as { id?: string } | undefined)?.id;
    return bodyId;
  }
}

/**
 * Honours the proxy headers Docker's nginx sets, but only the leftmost `X-Forwarded-For`
 * entry. Taking the *last* value instead would record the address of our own reverse
 * proxy, making every row say the same thing.
 */
function clientIp(request: RequestWithUser): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? request.socket?.remoteAddress ?? '').trim() || undefined;
}
