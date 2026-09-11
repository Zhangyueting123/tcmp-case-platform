/**
 * @author zhangyueting
 * @date 2026-07-28
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CaseReview,
  CaseReviewComment,
  CaseSet,
  CaseSetCase,
  ModuleNode,
  User,
} from '../../entities';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CaseReview,
      CaseReviewComment,
      CaseSet,
      CaseSetCase,
      ModuleNode,
      User,
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
