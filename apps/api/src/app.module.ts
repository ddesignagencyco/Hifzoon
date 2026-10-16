import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from './config/app-config.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CommonModule } from './common/common.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.service';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConsentModule } from './modules/consent/consent.module';
import { FamiliesModule } from './modules/families/families.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { CoursesModule } from './modules/courses/courses.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { MushafModule } from './modules/mushaf/mushaf.module';
import { ClassroomModule } from './modules/classroom/classroom.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { HifzModule } from './modules/hifz/hifz.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { AdminModule } from './modules/admin/admin.module';
import { CrmModule } from './modules/crm/crm.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { ParentPortalModule } from './modules/parent-portal/parent-portal.module';
import { QaModule } from './modules/qa/qa.module';
import { BillingModule } from './modules/billing/billing.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

/**
 * Root module (TRD section 4.1 — modular monolith).
 *
 * Everything cross-cutting is registered here as a global provider so no feature
 * module has to remember to apply it: authentication, role checks, the response
 * envelope, the error shape and rate limiting. A new module is then just a folder
 * with a module file and it inherits all of it.
 */
@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    IntegrationsModule,

    // NFR-SEC-04: a single global ceiling. Auth endpoints tighten it for themselves
    // with @Throttle({ default: … }) rather than adding named limiters here, because
    // ThrottlerGuard enforces *every* named limiter on *every* route — which would
    // apply the strict auth limits to all traffic.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),

    HealthModule,
    AuthModule,
    ConsentModule,
    FamiliesModule,
    NotificationsModule,
    SchedulingModule,
    CoursesModule,
    TeachersModule,
    MushafModule,
    ClassroomModule,
    LessonsModule,
    HifzModule,

    AuditModule,
    AdminModule,
    CrmModule,
    SettingsModule,
    AdmissionsModule,
    ParentPortalModule,
    QaModule,
    BillingModule,

    // Public provider callbacks, authenticated by signature rather than a session.
    WebhooksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Runs after the response interceptor so it observes the already-enveloped body,
    // which is what the client actually received.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
