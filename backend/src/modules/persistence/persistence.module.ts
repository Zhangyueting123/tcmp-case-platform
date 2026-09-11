/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';

@Module({
  providers: [BackupService],
  exports: [BackupService],
})
export class PersistenceModule {}
