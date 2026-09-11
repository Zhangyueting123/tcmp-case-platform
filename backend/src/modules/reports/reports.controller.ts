/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('rounds')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get(':id/report')
  report(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getReport(id);
  }

  @Get(':id/report/export')
  async export(
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const buf = await this.svc.exportExcel(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="round-${id}-report.xlsx"`);
    res.end(buf);
  }
}
