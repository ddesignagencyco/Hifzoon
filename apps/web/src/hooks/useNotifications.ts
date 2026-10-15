'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, UpdateNotificationPreferences } from '@/lib/api/modules/notifications';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (page: number, limit: number) => ['notifications', 'list', page, limit] as const,
  preferences: ['notifications', 'preferences'] as const,
};

export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: notificationKeys.list(page, limit),
    queryFn: () => notificationsApi.list({ page, limit }),
    staleTime: 30 * 1000,
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
