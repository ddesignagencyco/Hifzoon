'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, UpdateNotificationPreferences } from '@/lib/api/modules/notifications';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (page: number, limit: number) => ['notifications', 'list', page, limit] as const,
  preferences: ['notifications', 'preferences'] as const,
  preferencesFor: (userId: string) => ['notifications', 'preferences', userId] as const,
};

/** Staff, read-only: another user's channels and quiet hours (ADMIN, SUPER_ADMIN, SUPERVISOR). */
export function useUserNotificationPreferences(userId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.preferencesFor(userId ?? ''),
    queryFn: () => notificationsApi.preferencesForUser(userId as string),
    enabled: Boolean(userId),
    retry: false,
  });
}

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: notificationKeys.list(page, limit),
    queryFn: () => notificationsApi.list({ page, limit }),
    staleTime: 30 * 1000,
  });
}

/** M59 — unread count for the header bell; refreshed every minute. */
export function useUnreadNotifications() {
  return useQuery({
    queryKey: [...notificationKeys.all, 'unread'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: notificationsApi.preferences,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferences) => notificationsApi.updatePreferences(body),
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.preferences, data);
    },
  });
}
