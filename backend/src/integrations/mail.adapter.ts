/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';

export abstract class MailAdapter {
  abstract sendVerificationCode(email: string, code: string): Promise<void>;
}

@Injectable()
export class MockMailAdapter extends MailAdapter {
  private readonly logger = new Logger('MockMail');
  async sendVerificationCode(email: string, code: string): Promise<void> {
    this.logger.log(`[MOCK MAIL] to=${email}  code=${code}  (有效 10 分钟)`);
  }
}
