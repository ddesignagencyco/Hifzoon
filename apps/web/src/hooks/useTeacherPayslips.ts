'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { payrollTeacherApi } from '@/lib/api/modules/payroll-teacher';
import { teacherKeys } from '@/hooks/useTeacher';

export function useTeacherPayslips(page = 1, limit = 20) {
  return useQuery({
    queryKey: [...teacherKeys.payslips, page, limit],
    queryFn: () => payrollTeacherApi.myPayslips(page, limit),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
