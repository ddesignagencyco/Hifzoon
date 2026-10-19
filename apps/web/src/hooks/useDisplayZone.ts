'use client';

import { useAuth } from '@/hooks/useAuth';
import { deviceTimeZone, isValidTimeZone } from '@/components/teacher/zoned-time';

/**
 * The time zone every screen shows class times in: the signed-in account's zone (set at
 * sign-up / in profile), falling back to the device's zone. One rule across the teacher
 * Today/timetable, the family timetable and the classroom, so a class never shows two
 * different clock times on two screens.
 */
export function useDisplayZone(): string {
  const { currentUser } = useAuth();
  const profile = currentUser?.timeZone;
  return isValidTimeZone(profile) ? profile : deviceTimeZone();
}
