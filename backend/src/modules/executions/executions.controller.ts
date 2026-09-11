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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ExecutionsService } from './executions.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('executions')
@Controller()
export class ExecutionsController {
  constructor(private readonly svc: ExecutionsService) {}

  @Get('round-cases/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Patch('round-cases/:id/result')
  setResult(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.setResult(id, u.sub, dto);
  }

  @Patch('round-cases/:id/case')
  reviseCase(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any, @Body() dto: any) {
    return this.svc.reviseCase(id, u.sub, dto);
  }

  @Delete('round-cases/:id')
  removeInstance(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeInstance(id);
  }

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() u: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.saveAttachment(u.sub, file);
  }
}
