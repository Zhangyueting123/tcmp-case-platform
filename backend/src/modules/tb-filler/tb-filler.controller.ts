/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TbFillerService } from './tb-filler.service';
import { Public } from '../../common/decorators';

@Controller()
export class TbFillerController {
  constructor(private readonly svc: TbFillerService) {}

  @Get('tb-filler/status')
  status() {
    return this.svc.status();
  }

  @Post('tb-filler/launch')
  launch(@Body() body: { openUrl?: string }) {
    return this.svc.launchBrowser(body?.openUrl);
  }

  @Post('defects/:id/auto-fill')
  autoFill(@Param('id', ParseIntPipe) id: number) {
    return this.svc.autoFillDefect(id);
  }

  /** Tampermonkey 安装入口：直接访问会被识别为 UserScript */
  @Public()
  @Get('tb-filler/userscript')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  userscript(@Req() req: Request, @Res() res: Response) {
    const p = join(process.cwd(), 'scripts', 'tcmp-tb-filler.user.js');
    if (!existsSync(p)) {
      res.status(404).send('// userscript not found');
      return;
    }
    let src = readFileSync(p, 'utf-8');
    // 按实际访问地址动态注入 @updateURL / @downloadURL，
    // 保证 Tampermonkey「检查更新」回到本服务器（而不是当初安装时的 localhost:3000）。
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    if (host) {
      const selfUrl = `${proto}://${host}/api/v1/tb-filler/userscript`;
      const meta = `// @updateURL     ${selfUrl}\n// @downloadURL   ${selfUrl}\n`;
      // 去掉可能已有的旧 update/download 行，再在 @version 之后插入最新的
      src = src.replace(/^\/\/ @(updateURL|downloadURL).*\r?\n/gim, '');
      src = src.replace(/(^\/\/ @version\s+.*\r?\n)/im, `$1${meta}`);
    }
    res.send(src);
  }
}
