/**
 * @author zhangyueting
 * @date 2026-06-10
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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list(@CurrentUser() u: any, @Query('all') all?: string) {
    return this.svc.list(u.sub, all === '1' || all === 'true');
  }

  @Get('tree')
  tree(@CurrentUser() u: any, @Query('all') all?: string) {
    return this.svc.tree(u.sub, all === '1' || all === 'true');
  }

  @Post()
  create(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.create(u.sub, dto);
  }

  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Get(':id/defect-board') defectBoard(@Param('id', ParseIntPipe) id: number) {
    return this.svc.defectBoard(id);
  }

  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Post(':id/test-tb') testTb(@Param('id', ParseIntPipe) id: number) {
    return this.svc.testTb(id);
  }

  @Get(':id/members') members(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listMembers(id);
  }

  @Post(':id/members')
  addMember(@Param('id', ParseIntPipe) id: number, @Body() dto: { userId: number; roleCode: string }) {
    return this.svc.addMember(id, dto.userId, dto.roleCode);
  }

  @Delete('members/:memberId') removeMember(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.svc.removeMember(memberId);
  }

  @Get(':id/cases') cases(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listCases(id);
  }

  @Get(':id/case-sources') caseSources(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listCaseSources(id);
  }

  @Post(':id/cases')
  addCases(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Body() dto: { caseIds: number[] },
  ) {
    return this.svc.addCases(id, u.sub, dto.caseIds);
  }

  @Delete(':id/cases/:caseId')
  removeCase(@Param('id', ParseIntPipe) id: number, @Param('caseId', ParseIntPipe) caseId: number) {
    return this.svc.removeCase(id, caseId);
  }

  @Post(':id/cases/refresh-versions')
  refreshVersions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.refreshVersions(id);
  }
}
