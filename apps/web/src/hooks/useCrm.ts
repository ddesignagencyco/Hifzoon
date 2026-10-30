'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateLeadInput,
  CreateTaskInput,
  crmApi,
  LeadFilters,
  TaskFilters,
  UpdateLeadStatusInput,
} from '@/lib/api/modules/crm';

export const crmKeys = {
  all: ['crm'] as const,
  pipeline: ['crm', 'pipeline'] as const,
  leads: (filters: LeadFilters) => ['crm', 'leads', filters] as const,
  tasks: (filters: TaskFilters) => ['crm', 'tasks', filters] as const,
  byArea: (country: string) => ['crm', 'by-area', country] as const,
};

export function useLeadsByArea(country: string) {
  return useQuery({
    queryKey: crmKeys.byArea(country),
    queryFn: () => crmApi.leadsByArea(country || undefined),
    staleTime: 60 * 1000,
  });
}

export function useCrmPipeline(enabled = true) {
  return useQuery({ queryKey: crmKeys.pipeline, queryFn: crmApi.pipeline, enabled, staleTime: 30 * 1000 });
}

export function useCrmLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: crmKeys.leads(filters),
    queryFn: () => crmApi.listLeads(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCrmTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: crmKeys.tasks(filters),
    queryFn: () => crmApi.listTasks(filters),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: crmKeys.all });
}

export function useCreateLead() {
  const invalidate = useInvalidateCrm();
  return useMutation({ mutationFn: (body: CreateLeadInput) => crmApi.createLead(body), onSuccess: invalidate });
}

export function useUpdateLeadStatus() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ leadId, ...body }: UpdateLeadStatusInput & { leadId: string }) =>
      crmApi.updateLeadStatus(leadId, body),
    onSuccess: invalidate,
  });
}

export function useCreateCrmTask() {
  const invalidate = useInvalidateCrm();
  return useMutation({ mutationFn: (body: CreateTaskInput) => crmApi.createTask(body), onSuccess: invalidate });
}

export function useCompleteCrmTask() {
  const invalidate = useInvalidateCrm();
  return useMutation({ mutationFn: (taskId: string) => crmApi.completeTask(taskId), onSuccess: invalidate });
}
