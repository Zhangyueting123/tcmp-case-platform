/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Attachment, Round, RoundCaseInstance } from '../../entities';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { CaseSetsModule } from '../case-sets/case-sets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoundCaseInstance, Round, Attachment]),
    MulterModule.register({}),
    CaseSetsModule,
  ],
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
