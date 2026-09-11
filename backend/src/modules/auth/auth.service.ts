/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserStatus } from '../../entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { MailAdapter } from '../../integrations/mail.adapter';
import { DingtalkAdapter } from '../../integrations/dingtalk.adapter';

const PWD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;
const PHONE_REGEX = /^1[3-9]\d{9}$/;

interface VCRecord {
  code: string;
  expireAt: number;
  attempts: number;
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger('AuthService');
  // in-memory verification codes (MVP)
  private readonly codes = new Map<string, VCRecord>();
  private readonly sendCounts = new Map<string, number[]>();
  private readonly purgeTimer: NodeJS.Timeout;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwt: JwtService,
    private readonly mail: MailAdapter,
    private readonly ding: DingtalkAdapter,
  ) {
    // 定期清理过期验证码与发送计数，避免内存无限增长
    this.purgeTimer = setInterval(() => this.purgeExpired(), 10 * 60 * 1000);
    this.purgeTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.purgeTimer);
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [k, v] of this.codes) {
      if (v.expireAt < now) this.codes.delete(k);
    }
    for (const [k, arr] of this.sendCounts) {
      const kept = arr.filter((t) => now - t < 24 * 3600 * 1000);
      if (kept.length) this.sendCounts.set(k, kept);
      else this.sendCounts.delete(k);
    }
  }

  private get emailWhitelist(): string[] {
    return (process.env.EMAIL_DOMAIN_WHITELIST || 'mech-mind.net')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private assertEmailDomain(email: string) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !this.emailWhitelist.includes(domain)) {
      throw new BizException('E1001', `邮箱域名不允许，需 @${this.emailWhitelist.join('/')}`);
    }
  }

  async sendCode(email: string) {
    this.assertEmailDomain(email);
    const now = Date.now();
    const arr = (this.sendCounts.get(email) || []).filter((t) => now - t < 24 * 3600 * 1000);
    if (arr.length >= 5) {
      throw new BizException('E1005', '24 小时内验证码发送次数过多');
    }
    arr.push(now);
    this.sendCounts.set(email, arr);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.codes.set(email, { code, expireAt: now + 10 * 60 * 1000, attempts: 0 });
    await this.mail.sendVerificationCode(email, code);
    return { sent: true };
  }

  /**
   * 忘记密码：给邮箱对应的用户发送验证码。
   * 邮件由 MailAdapter（当前是 Mock 只写日志）发送；
   * 若用户已填手机号且钉钉群机器人已配置，同时推送到群里（@ 该手机号）。
   */
  async forgotPasswordSendCode(email: string) {
    this.assertEmailDomain(email);
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BizException('E2006', '该邮箱未注册', 404 as any);
    const now = Date.now();
    const arr = (this.sendCounts.get(email) || []).filter((t) => now - t < 24 * 3600 * 1000);
    if (arr.length >= 5) throw new BizException('E1005', '24 小时内验证码发送次数过多');
    arr.push(now);
    this.sendCounts.set(email, arr);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.codes.set(email, { code, expireAt: now + 10 * 60 * 1000, attempts: 0 });
    await this.mail.sendVerificationCode(email, code);
    if (user.phone) {
      try {
        await this.ding.push({
          toUserIds: [user.id],
          title: '【TCMP】密码重置验证码',
          text: `账号 ${user.email} 申请重置密码，验证码：**${code}**（10 分钟内有效）。如果不是本人操作，请忽略。`,
        });
      } catch {
        // 钉钉推送失败不影响主流程，用户仍可从邮箱/日志拿到验证码
      }
    }
    return { sent: true };
  }

  /**
   * 忘记密码：用邮箱 + 验证码 + 新密码 完成重置。
   * 校验码通过后清空 failedLoginCount / lockedUntil，避免刚锁定的账号即便重置密码仍无法登录。
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    this.assertEmailDomain(email);
    const rec = this.codes.get(email);
    if (!rec) throw new BizException('E1011', '请先获取验证码');
    if (rec.expireAt < Date.now()) {
      this.codes.delete(email);
      throw new BizException('E1012', '验证码已过期，请重新获取');
    }
    rec.attempts += 1;
    if (rec.attempts > 5) {
      this.codes.delete(email);
      throw new BizException('E1013', '验证码尝试次数过多，请重新获取');
    }
    if (rec.code !== String(code || '').trim()) {
      throw new BizException('E1014', '验证码不正确');
    }
    if (!PWD_REGEX.test(newPassword)) {
      throw new BizException('E1003', '密码强度不足：8-64 位且包含字母+数字+特殊字符');
    }
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BizException('E2006', '用户不存在', 404 as any);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.userRepo.save(user);
    this.codes.delete(email);
    return { ok: true };
  }

  async register(input: {
    email: string;
    password: string;
    name: string;
    phone: string;
    code?: string;
  }) {
    this.assertEmailDomain(input.email);
    const phone = input.phone?.trim();
    if (!phone) {
      throw new BizException('E1006', '手机号必填，用于钉钉群内 @ 执行人');
    }
    if (!PHONE_REGEX.test(phone)) {
      throw new BizException('E1007', '手机号格式不正确');
    }
    if (!PWD_REGEX.test(input.password)) {
      throw new BizException('E1003', '密码强度不足：8-64 位且包含字母+数字+特殊字符');
    }
    const exist = await this.userRepo.findOne({ where: { email: input.email } });
    if (exist) throw new BizException('E1002', '邮箱已注册');

    // bcrypt cost 10：在安全与登录性能间取平衡（业界主流），避免 50 人同时登录时 cost 12 造成的堵塞
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email: input.email,
        name: input.name,
        phone,
        passwordHash,
        status: UserStatus.ACTIVE,
      }),
    );
    return this.issueTokens(user);
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BizException('E2003', '邮箱或密码错误', 401 as any);
    if (user.status === UserStatus.LOCKED || user.status === UserStatus.DISABLED) {
      throw new BizException('E2004', `账号状态异常: ${user.status}`, 401 as any);
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new BizException('E2005', '账号已锁定，请稍后再试', 401 as any);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      if (user.failedLoginCount >= 5) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.failedLoginCount = 0;
      }
      await this.userRepo.save(user);
      throw new BizException('E2003', '邮箱或密码错误', 401 as any);
    }
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.userRepo.save(user);
    return this.issueTokens(user);
  }

  private issueTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      systemRoles: (user.systemRoles || '').split(',').filter(Boolean),
    };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: process.env.JWT_ACCESS_EXPIRES || '2h' }),
      refreshToken: this.jwt.sign(payload, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
      }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        systemRoles: payload.systemRoles,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken);
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new Error();
      return this.issueTokens(user);
    } catch {
      throw new BizException('E2002', '刷新令牌无效', 401 as any);
    }
  }

  async me(userId: number) {
    const u = await this.userRepo.findOne({ where: { id: userId } });
    if (!u) throw new BizException('E2006', '用户不存在', 404 as any);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      systemRoles: (u.systemRoles || '').split(',').filter(Boolean),
      status: u.status,
    };
  }

  async updateProfile(
    userId: number,
    dto: {
      name?: string;
      phone?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BizException('E2006', '用户不存在', 404 as any);

    let changed = false;

    if (dto.name !== undefined) {
      const name = String(dto.name).trim();
      if (!name) throw new BizException('E1008', '用户名不能为空');
      if (name.length > 32) throw new BizException('E1008', '用户名过长（最多 32 字）');
      if (name !== user.name) {
        user.name = name;
        changed = true;
      }
    }

    if (dto.phone !== undefined) {
      const phone = String(dto.phone).trim();
      if (!phone) throw new BizException('E1006', '手机号必填');
      if (!PHONE_REGEX.test(phone)) throw new BizException('E1007', '手机号格式不正确');
      if (phone !== user.phone) {
        user.phone = phone;
        changed = true;
      }
    }

    if (dto.newPassword) {
      if (!dto.currentPassword) throw new BizException('E1009', '请输入当前密码');
      const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!ok) throw new BizException('E1010', '当前密码不正确');
      if (!PWD_REGEX.test(dto.newPassword)) {
        throw new BizException('E1003', '密码强度不足：8-64 位且包含字母+数字+特殊字符');
      }
      user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
      changed = true;
    }

    if (changed) {
      await this.userRepo.save(user);
    }
    return this.me(userId);
  }
}
