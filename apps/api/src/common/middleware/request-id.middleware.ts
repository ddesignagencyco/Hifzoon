import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Assigns a request id used in every log line, error body and audit row, so one
 * user complaint can be traced across the API, the worker and the database
 * (NFR-MNT-02).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const inbound = req.headers['x-request-id'];
    req.id = (Array.isArray(inbound) ? inbound[0] : inbound) || randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  }
}
