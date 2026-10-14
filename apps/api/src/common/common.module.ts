import { Global, Module } from '@nestjs/common';

import { CryptoService } from './services/crypto.service';
import { PolicyService } from './services/policy.service';

/**
 * Cross-cutting services every feature module needs. Global so a new module folder
 * gets hashing, token handling and ownership checks without extra wiring — and so
 * there is exactly one implementation of each (TRD section 5.1).
 */
@Global()
@Module({
  providers: [CryptoService, PolicyService],
  exports: [CryptoService, PolicyService],
})
export class CommonModule {}
