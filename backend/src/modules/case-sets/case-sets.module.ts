/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { CaseReview, CaseReviewComment, CaseSet, CaseSetCase, CaseSetGroup, CaseVersion, ModuleNode, ProjectCaseRef, RoundCaseInstance } from '../../entities';
import { CaseSetsController } from './case-sets.controller';
import { CaseSetsService } from './case-sets.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { ImportExportService } from './import-export.service';
import { XmindImportService } from './xmind-import.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CaseSet, CaseSetCase, CaseSetGroup, CaseVersion, ModuleNode, ProjectCaseRef, RoundCaseInstance, CaseReview, CaseReviewComment]),
    MulterModule.register({}),
  ],
  controllers: [CaseSetsController, CasesController],
  providers: [CaseSetsService, CasesService, ImportExportService, XmindImportService],
  exports: [CaseSetsService, CasesService],
})
export class CaseSetsModule {}
