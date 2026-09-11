/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CaseSetCase,
  DefectLink,
  ModuleNode,
  Project,
  ProjectCaseRef,
  Round,
  RoundCaseInstance,
  User,
} from '../../entities';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Round,
      RoundCaseInstance,
      CaseSetCase,
      ModuleNode,
      ProjectCaseRef,
      DefectLink,
      Project,
      User,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
