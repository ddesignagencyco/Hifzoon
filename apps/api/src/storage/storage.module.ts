import { Global, Module } from '@nestjs/common';

import { RecordingStorageService } from './recording-storage.service';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService, RecordingStorageService],
  exports: [StorageService, RecordingStorageService],
})
export class StorageModule {}
