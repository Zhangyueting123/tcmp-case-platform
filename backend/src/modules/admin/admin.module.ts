/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Controller, Get, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, DingtalkPushLog } from '../../entities';

@ApiTags('admin')
@Controller('admin')
class AdminController {
  constructor(
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(DingtalkPushLog) private readonly dingRepo: Repository<DingtalkPushLog>,
  ) {}

  @Get('audit-logs') auditLogs() {
    return this.auditRepo.find({ order: { id: 'DESC' }, take: 200 });
  }

  @Get('dingtalk-logs') dingLogs() {
    return this.dingRepo.find({ order: { id: 'DESC' }, take: 200 });
  }

  @Get('config') config() {
    const tbMode = (process.env.TB_MODE || '').toUpperCase() === 'REAL' ? 'REAL' : 'MOCK';
    const tbAuth = process.env.TB_ACCESS_TOKEN
      ? 'PAT'
      : process.env.TB_APP_ID && process.env.TB_APP_SECRET
        ? 'OAuth'
        : 'NONE';
    const rawDingMode = (process.env.DINGTALK_MODE || '').toUpperCase();
    const dingMode = rawDingMode === 'WEBHOOK' ? 'WEBHOOK' : 'MOCK';
    return {
      dingtalk: {
        mode: dingMode,
        auth:
          dingMode === 'WEBHOOK'
            ? process.env.DINGTALK_WEBHOOK
              ? process.env.DINGTALK_SECRET
                ? 'Webhook+Sign'
                : 'Webhook'
              : 'NONE'
            : 'NONE',
        note:
          dingMode === 'WEBHOOK'
            ? '钉钉群机器人 Webhook 推送：发送到群内并按系统用户手机号 @ 执行人'
            : '钉钉适配器为 Mock，推送写入数据库与控制台',
      },
      teambition: {
        mode: tbMode,
        auth: tbAuth,
        baseUrl: process.env.TB_API_BASE || 'https://open.teambition.com',
        note:
          tbMode === 'REAL'
            ? `Teambition 真实模式 (鉴权=${tbAuth})，提交会调用 Teambition Open API 创建任务`
            : 'Teambition 适配器为 Mock，仅生成假 task id，不会写入 Teambition',
      },
      mail: { mode: 'MOCK', note: '邮件适配器为 Mock，验证码输出到 backend 控制台' },
      emailWhitelist: (process.env.EMAIL_DOMAIN_WHITELIST || 'company.com').split(','),
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, DingtalkPushLog])],
  controllers: [AdminController],
})
export class AdminModule {}
