import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';

import type { RequestWithUser } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { isOnboardingExempt } from './teacher-onboarding.service';

/**
 * Refuses the key teaching actions (availability, joining a class, lesson cards) with
 * 403 PROFILE_INCOMPLETE until a teacher has finished the one-time profile setup.
 *
 * Only a plain teacher is ever refused: a caller without TEACHER, or staff who also hold it
 * (admin, super admin, supervisor), pass straight through. Completion is one-way, so a
 * teacher seen complete is remembered and never looked up again by this process.
 *
 * Applied per route with `@UseGuards(ProfileCompleteGuard)`; it runs after the global JWT
 * and roles guards, so `request.user` is already set.
 */
@Injectable()
export class ProfileCompleteGuard implements CanActivate {
  private static readonly completed = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || isOnboardingExempt(user.roles)) return true;
    if (ProfileCompleteGuard.completed.has(user.id)) return true;

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { profileCompletedAt: true },
    });
    // No profile at all is not this guard's concern; the route answers for it.
    if (!profile) return true;
    if (profile.profileCompletedAt) {
      ProfileCompleteGuard.completed.add(user.id);
      return true;
    }
    throw new AppError(
      ErrorCode.PROFILE_INCOMPLETE,
      'Finish your profile setup before using the teacher portal',
      { setupPath: '/teacher/onboarding' },
    );
  }

  /** Test hook: forget remembered completions. */
  static reset(): void {
    ProfileCompleteGuard.completed.clear();
  }
}
