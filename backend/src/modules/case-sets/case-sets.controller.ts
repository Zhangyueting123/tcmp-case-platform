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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CaseSetsService } from './case-sets.service';
import { ImportExportService } from './import-export.service';
import { XmindImportService } from './xmind-import.service';
import { CurrentUser, Public } from '../../common/decorators';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

class CreateCaseSetDto {
  @IsOptional() @IsString() @Length(2, 32) code?: string;
  @IsString() @Length(1, 128) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() groupId?: number;
}

class GroupDto {
  @IsString() @Length(1, 128) name: string;
  @IsOptional() @IsString() description?: string;
}

class MoveGroupDto {
  @IsInt() groupId: number;
}

class MoveGroupBatchDto {
  @IsArray() caseSetIds: number[];
  @IsInt() groupId: number;
}

class RepositionModuleDto {
  @IsInt() dragId: number;
  @IsInt() dropId: number;
  @IsIn(['before', 'after', 'inner']) position: 'before' | 'after' | 'inner';
}

@ApiTags('case-sets')
@Controller('case-sets')
export class CaseSetsController {
  constructor(
    private readonly svc: CaseSetsService,
    private readonly ie: ImportExportService,
    private readonly xmind: XmindImportService,
  ) {}

  // ====== 用例集分组（"用例集项目"）—— 路由须在 :id 之前 ======
  @Get('groups') listGroups() {
    return this.svc.listGroups();
  }

  @Post('groups') createGroup(@CurrentUser() u: any, @Body() dto: GroupDto) {
    return this.svc.createGroup(u.sub, dto);
  }

  @Patch('groups/:gid') updateGroup(@Param('gid', ParseIntPipe) gid: number, @Body() dto: any) {
    return this.svc.updateGroup(gid, dto);
  }

  @Delete('groups/:gid') removeGroup(@Param('gid', ParseIntPipe) gid: number) {
    return this.svc.removeGroup(gid);
  }

  @Get() list(@Query('groupId') groupId?: string, @Query('keyword') keyword?: string) {
    return this.svc.list(groupId != null ? Number(groupId) : undefined, keyword);
  }

  @Post('move-group/batch')
  moveGroupBatch(@Body() dto: MoveGroupBatchDto) {
    return this.svc.moveManyToGroup(dto.caseSetIds, dto.groupId);
  }

  @Post() create(@CurrentUser() u: any, @Body() dto: CreateCaseSetDto) {
    return this.svc.create(u.sub, dto);
  }

  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Post(':id/move-group')
  moveGroup(@Param('id', ParseIntPipe) id: number, @Body() dto: MoveGroupDto) {
    return this.svc.moveToGroup(id, dto.groupId);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) {
    return this.svc.remove(id, u);
  }

  @Delete(':id/purge')
  purge(@Param('id', ParseIntPipe) id: number) {
    return this.svc.purgeAll(id);
  }

  @Get(':id/modules') modules(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getModuleTree(id);
  }

  @Post(':id/modules/reposition')
  repositionModule(@Param('id', ParseIntPipe) id: number, @Body() dto: RepositionModuleDto) {
    return this.svc.repositionModule(id, dto.dragId, dto.dropId, dto.position);
  }

  @Patch('modules/:moduleId')
  updateModule(@Param('moduleId', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateModule(id, dto);
  }

  @Post(':id/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importExcel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ie.importExcel(id, u.sub, file.buffer);
  }

  @Post(':id/import-xmind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async importXmind(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() u: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.xmind.importXmind(id, u.sub, file.buffer);
  }

  @Get(':id/export')
  async exportExcel(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buf = await this.ie.exportExcel(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="case-set-${id}.xlsx"`);
    res.end(buf);
  }

  @Public()
  @Get('template/blank')
  async template(@Res() res: Response) {
    const buf = this.ie.buildTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="case-template.xlsx"`);
    res.end(buf);
  }
}
