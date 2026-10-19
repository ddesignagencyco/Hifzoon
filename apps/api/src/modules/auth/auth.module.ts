import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../../config/app-config.service';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppleOAuthProvider } from './oauth/apple.provider';
import { GoogleOAuthProvider } from './oauth/google.provider';
import { OAUTH_ADAPTERS, OAuthService } from './oauth/oauth.service';
import { OAuthController } from './oauth/oauth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.value.JWT_ACCESS_SECRET,
        signOptions: {
          expiresIn: config.value.JWT_ACCESS_TTL,
          issuer: config.value.JWT_ISSUER,
          audience: config.value.JWT_AUDIENCE,
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TwoFactorService,
    GoogleOAuthProvider,
    AppleOAuthProvider,
    // Adapters are resolved by name so `OAuthService` never branches on the provider —
    // adding one is a new class here, not an `if` in the service (NFR-PORT-01).
    {
      provide: OAUTH_ADAPTERS,
      inject: [GoogleOAuthProvider, AppleOAuthProvider],
      useFactory: (google: GoogleOAuthProvider, apple: AppleOAuthProvider) => ({
        google,
        apple,
      }),
    },
    OAuthService,
  ],
  exports: [AuthService, TwoFactorService, OAuthService],
})
export class AuthModule {}
