/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoundsService } from './rounds.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('rounds')
@Controller()
export class RoundsController {
  constructor(private readonly svc: RoundsService) {}

  @Get('projects/:id/rounds')
  list(@Param('id', ParseIntPipe) id: number) {
    return this.svc.list(id);
  }

  @Post('projects/:id/rounds')
  create(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.create(id, u.sub, dto);
  }

  @Get('rounds/:id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Patch('rounds/:id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Get('rounds/:id/preview') preview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.preview(id);
  }

  @Post('rounds/:id/publish') publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Post('rounds/:id/close') close(@Param('id', ParseIntPipe) id: number) {
    return this.svc.close(id);
  }

  @Post('rounds/:id/pause') pause(@Param('id', ParseIntPipe) id: number) {
    return this.svc.pause(id);
  }

  @Post('rounds/:id/assign') assign(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.assign(id, dto);
  }

  @Post('rounds/:id/unassign') unassign(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.unassign(id, dto);
  }

  @Post('rounds/:id/exclude-cases')
  excludeCases(@Param('id', ParseIntPipe) id: number, @Body() dto: { caseIds: number[] }) {
    return this.svc.excludeCases(id, dto?.caseIds || []);
  }

  @Post('rounds/:id/restore-cases')
  restoreCases(@Param('id', ParseIntPipe) id: number, @Body() dto: { caseIds?: number[] }) {
    return this.svc.restoreCases(id, dto?.caseIds);
  }

  @Get('rounds/:id/assigned') assigned(@Param('id', ParseIntPipe) id: number) {
    return this.svc.assignedOverview(id);
  }

  @Get('rounds/:id/cases')
  cases(
    @Param('id', ParseIntPipe) id: number,
    @Query('assigneeUserId') assigneeUserId?: string,
    @Query('result') result?: string,
  ) {
    return this.svc.listInstances(id, {
      assigneeUserId: assigneeUserId ? Number(assigneeUserId) : undefined,
      result,
    });
  }
}
