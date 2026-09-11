/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Global, Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DingtalkPushLog, User } from '../entities';
import { DingtalkAdapter, MockDingtalkAdapter, WebhookDingtalkAdapter } from './dingtalk.adapter';
import { TeambitionAdapter, MockTeambitionAdapter } from './teambition.adapter';
import { RealTeambitionAdapter } from './teambition.real.adapter';
import { MailAdapter, MockMailAdapter } from './mail.adapter';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DingtalkPushLog, User])],
  providers: [
    MockDingtalkAdapter,
    WebhookDingtalkAdapter,
    {
      provide: DingtalkAdapter,
      useFactory: (mock: MockDingtalkAdapter, webhook: WebhookDingtalkAdapter) => {
        const mode = (process.env.DINGTALK_MODE || '').toUpperCase();
        const impl = mode === 'WEBHOOK' ? webhook : mock;
        new Logger('IntegrationsModule').log(
          `Dingtalk adapter -> ${impl.constructor.name} (DINGTALK_MODE=${process.env.DINGTALK_MODE || '(unset)'})`,
        );
        return impl;
      },
      inject: [MockDingtalkAdapter, WebhookDingtalkAdapter],
    },
    MockTeambitionAdapter,
    RealTeambitionAdapter,
    {
      provide: TeambitionAdapter,
      // 运行期决定，确保 ConfigModule 已经把 .env 加载到 process.env
      useFactory: (mock: MockTeambitionAdapter, real: RealTeambitionAdapter) => {
        const mode = (process.env.TB_MODE || '').toUpperCase();
        const impl = mode === 'REAL' ? real : mock;
        new Logger('IntegrationsModule').log(
          `Teambition adapter -> ${impl.constructor.name} (TB_MODE=${process.env.TB_MODE || '(unset)'})`,
        );
        return impl;
      },
      inject: [MockTeambitionAdapter, RealTeambitionAdapter],
    },
    { provide: MailAdapter, useClass: MockMailAdapter },
  ],
  exports: [DingtalkAdapter, TeambitionAdapter, MailAdapter, RealTeambitionAdapter],
})
export class IntegrationsModule {}
