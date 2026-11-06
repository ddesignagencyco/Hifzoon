'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  rememberComplete,
  teacherOnboardingApi,
  type OnboardingSubmission,
} from '@/lib/api/modules/teacher-onboarding';

export const onboardingKey = ['teacher', 'onboarding'] as const;

/** `GET /teachers/me/onboarding`; `enabled: false` once completion is remembered on this device. */
export function useTeacherOnboarding(enabled = true) {
  return useQuery({
    queryKey: onboardingKey,
    queryFn: teacherOnboardingApi.status,
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

/** `POST /teachers/me/onboarding`. On success the portal unlocks for good. */
export function useSubmitOnboarding(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardingSubmission) => teacherOnboardingApi.submit(body),
    onSuccess: (status) => {
      queryClient.setQueryData(onboardingKey, status);
      if (status.complete && userId) rememberComplete(userId);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'me'] });
    },
  });
}
