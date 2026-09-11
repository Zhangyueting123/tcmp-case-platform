/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CaseSet,
  CaseSetCase,
  DefectLink,
  ModuleNode,
  Project,
  ProjectCaseRef,
  Round,
  UserProjectRole,
} from '../../entities';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectCaseRef,
      UserProjectRole,
      CaseSetCase,
      CaseSet,
      ModuleNode,
      Round,
      DefectLink,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
