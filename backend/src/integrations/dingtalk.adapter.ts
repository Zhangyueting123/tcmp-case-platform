/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DingtalkPushLog, User } from '../entities';
import { createHmac } from 'crypto';

export interface DingtalkMessage {
  toUserIds: number[]; // local userIds
  title: string;
  text: string;
  url?: string;
  roundId?: number;
}

export abstract class DingtalkAdapter {
  abstract push(msg: DingtalkMessage): Promise<{ ok: boolean; failed: number[] }>;
}

@Injectable()
export class MockDingtalkAdapter extends DingtalkAdapter {
  private readonly logger = new Logger('MockDingtalk');
  constructor(
    @InjectRepository(DingtalkPushLog) private readonly logRepo: Repository<DingtalkPushLog>,
  ) {
    super();
  }
  async push(msg: DingtalkMessage) {
    this.logger.log(`[MOCK PUSH] -> users=${msg.toUserIds.join(',')} title="${msg.title}"`);
    this.logger.debug(msg.text);
    for (const uid of msg.toUserIds) {
      await this.logRepo.save(
        this.logRepo.create({
          userId: uid,
          roundId: msg.roundId,
          payload: msg,
          status: 'SUCCESS',
        }),
      );
    }
    return { ok: true, failed: [] };
  }
}

@Injectable()
export class WebhookDingtalkAdapter extends DingtalkAdapter {
  private readonly logger = new Logger('WebhookDingtalk');

  constructor(
    @InjectRepository(DingtalkPushLog) private readonly logRepo: Repository<DingtalkPushLog>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super();
  }

  async push(msg: DingtalkMessage) {
    const users = await this.userRepo.find({ where: { id: In(msg.toUserIds) } });
    const mobiles = users
      .map((user) => user.phone?.trim())
      .filter((phone): phone is string => Boolean(phone));

    try {
      await this.postWebhook(this.buildWebhookUrl(), {
        msgtype: 'markdown',
        markdown: {
          title: msg.title,
          text: this.buildMarkdown(msg, mobiles),
        },
        at: {
          atMobiles: mobiles,
          isAtAll: false,
        },
      });

      for (const uid of msg.toUserIds) {
        await this.saveLog(uid, msg, 'SUCCESS');
      }
      return { ok: true, failed: [] };
    } catch (e: any) {
      const message = e?.message || String(e);
      this.logger.warn(`webhook push failed: ${message}`);
      for (const uid of msg.toUserIds) {
        await this.saveLog(uid, msg, 'FAILED', message);
      }
      return { ok: false, failed: msg.toUserIds };
    }
  }

  private buildMarkdown(msg: DingtalkMessage, mobiles: string[]) {
    const publicBaseUrl = (process.env.DINGTALK_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const link =
      msg.url && publicBaseUrl && msg.url.startsWith('/')
        ? `${publicBaseUrl}${msg.url}`
        : msg.url;
    const linkText = link ? `\n\n[打开任务](${link})` : '';
    const atText = mobiles.length ? `\n\n${mobiles.map((mobile) => `@${mobile}`).join(' ')}` : '';
    return `### ${msg.title}\n\n${msg.text}${linkText}${atText}`;
  }

  private buildWebhookUrl() {
    const webhook = process.env.DINGTALK_WEBHOOK;
    if (!webhook) throw new Error('未配置 DINGTALK_WEBHOOK');
    const secret = process.env.DINGTALK_SECRET;
    if (!secret) return webhook;

    const timestamp = Date.now().toString();
    const sign = createHmac('sha256', secret)
      .update(`${timestamp}\n${secret}`)
      .digest('base64');
    const url = new URL(webhook);
    url.searchParams.set('timestamp', timestamp);
    url.searchParams.set('sign', sign);
    return url.toString();
  }

  private async postWebhook(url: string, body: any) {
    const request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
    let response: Response | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetch(url, request);
        break;
      } catch (e: any) {
        lastError = e;
        if (attempt < 3) await this.sleep(500 * attempt);
      }
    }

    if (!response) {
      throw new Error(this.describeFetchError(lastError));
    }

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`钉钉机器人 HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    if (data?.errcode && data.errcode !== 0) {
      throw new Error(this.describeDingtalkResponse(data));
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async saveLog(
    userId: number,
    payload: DingtalkMessage,
    status: 'SUCCESS' | 'FAILED',
    lastError?: string,
  ) {
    await this.logRepo.save(
      this.logRepo.create({
        userId,
        roundId: payload.roundId,
        payload,
        status,
        lastError,
      }),
    );
  }

  private describeFetchError(e: any) {
    const parts = [e?.message || String(e)];
    const cause = e?.cause;
    if (cause) {
      const code = cause.code ? `code=${cause.code}` : '';
      const message = cause.message || String(cause);
      parts.push(`cause=${[code, message].filter(Boolean).join(' ')}`);
    }
    return parts.join('; ');
  }

  private describeDingtalkResponse(data: any) {
    if (!data) return 'empty response';
    const errcode = data.errcode ?? data.errorCode;
    const errmsg = data.errmsg ?? data.errorMessage ?? data.message;
    return `errcode=${errcode ?? '-'} errmsg=${errmsg ?? JSON.stringify(data).slice(0, 200)}`;
  }
}
