/**
 * OpenAPI enrichment applied to the generated document.
 *
 * The FE generates its typed client from this spec (TRD section 6), so anything the
 * client needs to know about the envelope or the shared error codes has to be in the
 * document rather than in tribal knowledge.
 */
export interface OpenApiDocument {
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  paths?: Record<string, unknown>;
}

export const AUTHENTICATED_USER_DOC = {
  name: 'AuthenticatedUser',
  description: 'The signed-in identity attached to the request by JwtAuthGuard',
} as const;
