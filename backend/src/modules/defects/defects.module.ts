/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CaseSetCase,
  DefectLink,
  Project,
  Round,
  RoundCaseInstance,
} from '../../entities';
import { DefectsController } from './defects.controller';
import { DefectsService } from './defects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DefectLink, RoundCaseInstance, CaseSetCase, Round, Project]),
  ],
  controllers: [DefectsController],
  providers: [DefectsService],
})
export class DefectsModule {}
