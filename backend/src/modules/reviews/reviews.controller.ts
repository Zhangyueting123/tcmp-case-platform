/**
 * @author zhangyueting
 * @date 2026-07-28
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Post('case-sets/:id/reviews')
  create(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.create(id, u.sub, dto);
  }

  // 跨多个用例集发起评审（用例集列表页勾选）
  @Post('reviews')
  createMulti(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.createMulti(u.sub, dto);
  }

  @Get('case-sets/:id/reviews')
  listByCaseSet(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listByCaseSet(id);
  }

  @Get('reviews/mine')
  mine(@CurrentUser() u: any) {
    return this.svc.listMine(u.sub);
  }

  @Get('reviews/:id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) {
    return this.svc.detail(id, u.sub);
  }

  @Get('reviews/:id/export')
  async export(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Res() res: Response,
  ) {
    const { buf, filename } = await this.svc.exportExcel(id, u.sub);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.end(buf);
  }

  @Post('reviews/:id/comments')
  addComment(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.addComment(id, u.sub, dto);
  }

  @Get('reviews/:id/comments')
  listComments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Query('caseId') caseId?: string,
  ) {
    return this.svc.listComments(id, u.sub, caseId ? Number(caseId) : undefined);
  }

  @Patch('reviews/:id/comments/:cid/resolve')
  resolveComment(
    @Param('id', ParseIntPipe) id: number,
    @Param('cid', ParseIntPipe) cid: number,
    @CurrentUser() u: any,
    @Body() dto: any,
  ) {
    return this.svc.resolveComment(id, cid, u.sub, dto?.resolved ?? true);
  }

  @Patch('reviews/:id/complete')
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.setMyCompletion(id, u.sub, dto?.completed ?? true);
  }

  @Patch('reviews/:id/end-review')
  endReview(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) {
    return this.svc.endReview(id, u.sub);
  }

  @Patch('reviews/:id/close')
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) {
    return this.svc.close(id, u.sub);
  }

  @Patch('reviews/:id/reviewers')
  setReviewers(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.setReviewers(id, u.sub, dto?.reviewerUserIds || []);
  }

  // 评审中补充用例
  @Get('reviews/:id/candidate-cases')
  candidateCases(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Query('caseSetId') caseSetId?: string,
  ) {
    const sid = caseSetId != null ? Number(caseSetId) : undefined;
    return this.svc.candidateCases(
      id,
      u.sub,
      sid != null && Number.isInteger(sid) ? sid : undefined,
    );
  }

  @Post('reviews/:id/cases')
  addCases(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.addCases(id, u.sub, dto?.caseIds || []);
  }

  @Delete('reviews/:id/cases/:cid')
  removeCase(
    @Param('id', ParseIntPipe) id: number,
    @Param('cid', ParseIntPipe) cid: number,
    @CurrentUser() u: any,
  ) {
    return this.svc.removeCase(id, u.sub, cid);
  }
}
