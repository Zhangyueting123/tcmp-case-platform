/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CaseSet,
  CaseSetCase,
  DingtalkPushLog,
  ModuleNode,
  ProjectCaseRef,
  Round,
  RoundCaseInstance,
} from '../../entities';
import { RoundsController } from './rounds.controller';
import { RoundsService } from './rounds.service';
import { FilterCompiler } from './filter-compiler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Round,
      RoundCaseInstance,
      ProjectCaseRef,
      CaseSet,
      CaseSetCase,
      ModuleNode,
      DingtalkPushLog,
    ]),
  ],
  controllers: [RoundsController],
  providers: [RoundsService, FilterCompiler],
  exports: [RoundsService, FilterCompiler],
})
export class RoundsModule {}
