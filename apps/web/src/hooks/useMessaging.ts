'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  messagingApi,
  MessagingSide,
  MessagingStudent,
  OpenThreadInput,
  ThreadDetail,
  ThreadMessage,
} from '@/lib/api/modules/messaging';

/** How often an open inbox/conversation re-checks for new messages. */
export const MESSAGING_POLL_MS = 15_000;
export const THREAD_DEFAULT_LIMIT = 50;
/** Id prefix of an optimistic (not yet confirmed) message bubble. */
export const PENDING_MESSAGE_PREFIX = 'pending-';

export const messagingKeys = {
  all: ['messaging'] as const,
  side: (side: MessagingSide) => ['messaging', side] as const,
  threads: (side: MessagingSide) => ['messaging', side, 'threads'] as const,
  thread: (side: MessagingSide, threadId: string) => ['messaging', side, 'thread', threadId] as const,
  families: ['messaging', 'lookup', 'families'] as const,
  students: (familyId: string) => ['messaging', 'lookup', 'students', familyId] as const,
  enrolments: (studentId: string) => ['messaging', 'lookup', 'enrolments', studentId] as const,
};

export function useThreads(side: MessagingSide) {
  return useQuery({
    queryKey: messagingKeys.threads(side),
    queryFn: () => messagingApi.listThreads(side),
    refetchInterval: MESSAGING_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/** `limit` = how many of the latest messages to load (backend default 50, max 200). */
export function useThread(side: MessagingSide, threadId: string | undefined, limit = THREAD_DEFAULT_LIMIT) {
  return useQuery({
    queryKey: [...messagingKeys.thread(side, threadId ?? ''), limit] as const,
    queryFn: () => messagingApi.getThread(side, threadId as string, limit),
    enabled: Boolean(threadId),
    refetchInterval: MESSAGING_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

interface SendVars {
  threadId: string;
  body: string;
  sender: { id: string; name: string };
}

/**
 * Posts a message with an optimistic bubble (`pending-…` id) that is replaced by the
 * server copy when the thread refetches; rolled back if the post fails.
 */
export function useSendMessage(side: MessagingSide) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, body }: SendVars) => messagingApi.postMessage(side, threadId, body.trim()),
    onMutate: async ({ threadId, body, sender }) => {
      const key = messagingKeys.thread(side, threadId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueriesData<ThreadDetail>({ queryKey: key });
      const optimistic: ThreadMessage = {
        id: `${PENDING_MESSAGE_PREFIX}${Date.now()}`,
        threadId,
        senderId: sender.id,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        readAt: null,
        sender,
      };
      queryClient.setQueriesData<ThreadDetail>({ queryKey: key }, (current) =>
        current ? { ...current, messages: [...current.messages, optimistic] } : current,
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
    },
    onSettled: (_data, _error, { threadId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: messagingKeys.thread(side, threadId) }),
        queryClient.invalidateQueries({ queryKey: messagingKeys.threads(side) }),
      ]),
  });
}

/** Guardian: open (or reuse) a thread, then post the first message into it. */
export function useStartThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, body }: { input: OpenThreadInput; body: string }) => {
      const thread = await messagingApi.openThread(input);
      await messagingApi.postMessage('guardian', thread.id, body.trim());
      return thread;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: messagingKeys.side('guardian') }),
  });
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export function useMessagingFamilies(enabled = true) {
  return useQuery({
    queryKey: messagingKeys.families,
    queryFn: messagingApi.families,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFamilyStudents(familyId: string | undefined) {
  return useQuery({
    queryKey: messagingKeys.students(familyId ?? ''),
    queryFn: () => messagingApi.familyStudents(familyId as string),
    enabled: Boolean(familyId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStudentEnrolments(studentId: string | undefined) {
  return useQuery({
    queryKey: messagingKeys.enrolments(studentId ?? ''),
    queryFn: () => messagingApi.studentEnrolments(studentId as string),
    enabled: Boolean(studentId),
    staleTime: 60 * 1000,
  });
}

/**
 * Guardian thread rows carry `studentId` but not the child's name, so names are
 * resolved from the guardian's own families (`GET /families/:id/students`).
 */
export function useGuardianStudentNames(enabled: boolean): Map<string, string> {
  const families = useMessagingFamilies(enabled);
  return useQueries({
    queries: (families.data ?? []).map((f) => ({
      queryKey: messagingKeys.students(f.id),
      queryFn: () => messagingApi.familyStudents(f.id),
      enabled,
      staleTime: 5 * 60 * 1000,
    })),
    combine: combineStudentNames,
  });
}

function combineStudentNames(results: Array<{ data?: MessagingStudent[] }>): Map<string, string> {
  const map = new Map<string, string>();
  results.forEach((q) => q.data?.forEach((s) => map.set(s.id, s.displayName)));
  return map;
}
