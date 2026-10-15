'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  AuthUserRecord, 
  UserSessionRecord, 
  TwoFactorSetupResponse, 
  RegisterRequest, 
  LoginRequest, 
  ResetPasswordRequest 
} from '@/lib/types';
import { 
  loginUser, 
  logoutUser, 
  registerUser, 
  refreshTokens, 
  fetchCurrentUser, 
  fetchActiveSessions, 
  setupTwoFactor, 
  confirmTwoFactor, 
  disableTwoFactor, 
  requestPasswordReset, 
  completePasswordReset,
  getAccessToken,
  getActiveUser,
  LoginResult 
} from '@/lib/api/client';

export interface AuthContextState {
  currentUser: AuthUserRecord | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once the initial session check (refresh cookie → /auth/me) has finished, signed in or not. */
  isResolved: boolean;
  login: (emailOrPayload: string | LoginRequest, password?: string) => Promise<LoginResult>;
  register: (payload: RegisterRequest) => Promise<{ success: boolean; user?: AuthUserRecord; error?: string }>;
  logout: (allSessions?: boolean) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<boolean>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string; error?: string }>;
  resetPassword: (payload: ResetPasswordRequest) => Promise<{ success: boolean; message: string; error?: string }>;
}

/**
 * Primary React Query Hook for Authentication & Current User Lifecycle.
 * Operates purely in-memory with automatic httpOnly cookie token rotation (FR-AUTH-01 to FR-AUTH-07).
 */
export function useAuth(): AuthContextState {
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      // If we don't have an in-memory token, try a silent refresh via httpOnly cookie first
      if (!getAccessToken()) {
        const refreshed = await refreshTokens();
        if (!refreshed.success) {
          return null;
        }
      }
      return fetchCurrentUser();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: getActiveUser(),
  });

  const currentUser = userQuery.data ?? getActiveUser();

  const loginMutation = useMutation({
    mutationFn: async (payload: { emailOrPayload: string | LoginRequest; password?: string }) => {
      return loginUser(payload.emailOrPayload, payload.password);
    },
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterRequest) => {
      return registerUser(payload);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async (allSessions: boolean = false) => {
      return logoutUser({ allSessions });
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      return requestPasswordReset(email);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (payload: ResetPasswordRequest) => {
      return completePasswordReset(payload);
    },
  });

  return {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading: userQuery.isLoading || loginMutation.isPending,
    isResolved: userQuery.isFetched || userQuery.isError,
    login: async (emailOrPayload, password) => {
      return loginMutation.mutateAsync({ emailOrPayload, password });
    },
    register: async (payload) => {
      return registerMutation.mutateAsync(payload);
    },
    logout: async (allSessions = false) => {
      return logoutMutation.mutateAsync(allSessions);
    },
    refresh: async () => {
      const res = await refreshTokens();
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        return true;
      }
      return false;
    },
    forgotPassword: async (email: string) => {
      return forgotPasswordMutation.mutateAsync(email);
    },
    resetPassword: async (payload: ResetPasswordRequest) => {
      return resetPasswordMutation.mutateAsync(payload);
    },
  };
}

/**
 * Hook to inspect and manage active user sessions (FR-AUTH-07).
 */
export function useSessions() {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: fetchActiveSessions,
    staleTime: 60 * 1000,
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      return logoutUser({ allSessions: true });
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.setQueryData(['auth', 'sessions'], []);
    },
  });

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    refetch: sessionsQuery.refetch,
    revokeAllSessions: () => revokeAllMutation.mutateAsync(),
    isRevoking: revokeAllMutation.isPending,
  };
}

/**
 * Hook for Staff Two-Factor Authentication Enrolment & Verification (FR-AUTH-01).
 */
export function useTwoFactor() {
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: async (password: string) => {
      return setupTwoFactor(password);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (code: string) => {
      return confirmTwoFactor(code);
    },
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      return disableTwoFactor();
    },
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
  });

  return {
    setup: (password: string) => setupMutation.mutateAsync(password),
    confirm: (code: string) => confirmMutation.mutateAsync(code),
    disable: () => disableMutation.mutateAsync(),
    isSettingUp: setupMutation.isPending,
    isConfirming: confirmMutation.isPending,
    isDisabling: disableMutation.isPending,
  };
}
