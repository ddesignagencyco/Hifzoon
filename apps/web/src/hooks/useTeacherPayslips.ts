'use client';

import { useQuery } from '@tanstack/react-query';
import { payrollTeacherApi } from '@/lib/api/modules/payroll-teacher';
import { teacherKeys } from '@/hooks/useTeacher';

export function useTeacherPayslips() {
  return useQuery({
    queryKey: teacherKeys.payslips,
    queryFn: payrollTeacherApi.myPayslips,
    staleTime: 5 * 60 * 1000,
  });
}
