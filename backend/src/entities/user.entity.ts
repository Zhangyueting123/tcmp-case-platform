/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  DISABLED = 'DISABLED',
  PENDING_VERIFY = 'PENDING_VERIFY',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;

  @Index({ unique: true })
  @Column({ length: 128 })
  email: string;

  @Column({ length: 128 }) passwordHash: string;
  @Column({ length: 64 }) name: string;
  @Column({ length: 20, nullable: true }) phone: string;
  @Column({ length: 64, nullable: true }) dingtalkUserId: string;

  @Column({ default: UserStatus.ACTIVE }) status: UserStatus;

  /** 系统级角色: SysAdmin, 用逗号分隔 */
  @Column({ length: 128, default: '' }) systemRoles: string;

  @Column({ type: 'int', default: 0 }) failedLoginCount: number;
  @Column({ type: 'datetime', nullable: true }) lockedUntil: Date;

  // === Teambition OAuth (per-user) ===
  @Column({ length: 512, nullable: true }) tbAccessToken: string;
  @Column({ length: 512, nullable: true }) tbRefreshToken: string;
  @Column({ type: 'datetime', nullable: true }) tbTokenExpiresAt: Date;
  @Column({ length: 64, nullable: true }) tbUserId: string;
  @Column({ length: 128, nullable: true }) tbUserName: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
