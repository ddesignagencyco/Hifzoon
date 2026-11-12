'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RevisionListParams,
  RevisionReason,
  revisionRequestsApi,
} from '@/lib/api/modules/revision-requests';
import { messagingKeys } from '@/hooks/useMessaging';

export const revisionKeys = {
  all: ['revision-requests'] as const,
  list: (params: RevisionListParams) => ['revision-requests', 'list', params] as const,
};

/** The family's earlier questions about a card (each links to its conversation). */
export function useRevisionRequests(params: RevisionListParams, enabled = true) {
  return useQuery({
    queryKey: revisionKeys.list(params),
    queryFn: () => revisionRequestsApi.list(params),
    enabled,
  });
}

/**
 * Asks the teacher about a lesson card. The API posts the question into the family–teacher
 * conversation, so the guardian's inbox is refreshed too.
 */
export function useCreateRevisionRequest(lessonCardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: RevisionReason; message: string }) =>
      revisionRequestsApi.create(lessonCardId, body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: revisionKeys.all }),
        qc.invalidateQueries({ queryKey: messagingKeys.side('guardian') }),
      ]),
  });
}

/** Closing or answering changes the status shown on every list of requests. */
export function useCloseRevisionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revisionRequestsApi.close(id),
    onSettled: () => qc.invalidateQueries({ queryKey: revisionKeys.all }),
  });
}

export function useRespondRevisionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; response: string }) => revisionRequestsApi.respond(v.id, v.response),
    onSettled: () => qc.invalidateQueries({ queryKey: revisionKeys.all }),
  });
}
