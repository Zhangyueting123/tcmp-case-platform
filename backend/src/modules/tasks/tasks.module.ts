/**
 * @author zhangyueting
 * @date 2026-07-29
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseReview, CaseSet, Project, Round, RoundCaseInstance } from '../../entities';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoundCaseInstance, Round, Project, CaseReview, CaseSet]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
