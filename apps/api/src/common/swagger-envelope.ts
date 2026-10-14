import { ErrorCode } from '@hifzoon/shared';

import type { OpenApiDocument } from '../swagger';

/**
 * Registers the shared response envelope and error-code schemas on the generated
 * OpenAPI document. Nest cannot infer them because the interceptor builds them at
 * runtime, but the FE client needs them to type every endpoint (TRD section 6).
 */
export const ENVELOPE_SCHEMA = {
  inject(document: OpenApiDocument): void {
    document.components ??= {};
    document.components.schemas ??= {};

    document.components.schemas.ApiError = {
      type: 'object',
      required: ['statusCode', 'code', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 403 },
        code: {
          type: 'string',
          enum: Object.values(ErrorCode),
          example: ErrorCode.CONSENT_REQUIRED,
        },
        message: { type: 'string', example: 'Guardian consent is required for: AI_VOICE' },
        details: { type: 'object', nullable: true, additionalProperties: true },
        requestId: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    };

    document.components.schemas.PaginationMeta = {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrevious'],
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 137 },
        totalPages: { type: 'integer', example: 7 },
        hasNext: { type: 'boolean' },
        hasPrevious: { type: 'boolean' },
      },
    };

    document.components.schemas.ApiMeta = {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        pagination: { $ref: '#/components/schemas/PaginationMeta' },
      },
    };
  },
} as const;
