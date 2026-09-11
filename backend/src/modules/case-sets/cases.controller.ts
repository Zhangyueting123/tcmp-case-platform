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
import { CasesService } from './cases.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('cases')
@Controller()
export class CasesController {
  constructor(private readonly svc: CasesService) {}

  @Get('case-sets/:id/cases')
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query('moduleId') moduleId?: string,
    @Query('q') q?: string,
    @Query('priority') priority?: string,
  ) {
    return this.svc.list(id, {
      moduleId: moduleId ? Number(moduleId) : undefined,
      q,
      priority,
    });
  }

  @Post('case-sets/:id/cases')
  create(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.create(id, u.sub, dto);
  }

  @Post('case-sets/:id/cases/bulk')
  bulkCreate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Body() body: { items: any[] },
  ) {
    return this.svc.bulkCreate(id, u.sub, body?.items || []);
  }

  @Post('case-sets/:id/cases/renumber')
  renumber(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Body() body: { orderedIds: number[] },
  ) {
    return this.svc.renumberByOrder(id, u.sub, body?.orderedIds || []);
  }

  @Post('case-sets/:id/cases/bulk-delete')
  bulkDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @Body() body: { caseIds: number[] },
  ) {
    return this.svc.bulkRemove(id, u.sub, body?.caseIds || []);
  }

  @Get('cases/:id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Patch('cases/:id')
  update(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.update(id, u.sub, dto);
  }

  @Delete('cases/:id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) {
    return this.svc.remove(id, u.sub);
  }

  @Get('cases/:id/versions') versions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.versions(id);
  }
}
