/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DefectsService } from './defects.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('defects')
@Controller()
export class DefectsController {
  constructor(private readonly svc: DefectsService) {}

  @Post('round-cases/:instanceId/defects')
  submit(
    @Param('instanceId', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Body() dto: any,
  ) {
    return this.svc.submit(id, u.sub, dto);
  }

  /** 手动模式：本系统先落草稿，返回 TB 跳转 URL，由用户手动在 TB 上提任务 */
  @Post('round-cases/:instanceId/defects/manual')
  submitManual(
    @Param('instanceId', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Body() dto: any,
  ) {
    return this.svc.submitManual(id, u.sub, dto);
  }

  /** 用户在 TB 上提完后，把 TB 任务 URL 或 taskId 粘回来关联 */
  @Post('defects/:id/attach-tb')
  attachTbTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { tbUrl?: string; taskId?: string; title?: string },
  ) {
    return this.svc.attachTbTask(id, dto);
  }

  /** 手动同步 TB 状态（油猜脚本读取 TB 页面状态后回填） */
  @Post('defects/:id/sync-status')
  syncTbStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { status: string; title?: string },
  ) {
    return this.svc.syncTbStatus(id, dto.status, dto.title);
  }

  @Delete('defects/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Get('round-cases/:instanceId/defects')
  listByInstance(@Param('instanceId', ParseIntPipe) id: number) {
    return this.svc.listByInstance(id);
  }

  @Get('projects/:id/defects')
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('q') q?: string,
  ) {
    return this.svc.listByProject(id, { status, severity, q });
  }

  @Get('projects/:id/defects/dashboard')
  dashboard(@Param('id', ParseIntPipe) id: number) {
    return this.svc.dashboard(id);
  }

  @Post('defects/sync')
  sync() {
    return this.svc.manualSync();
  }
}
