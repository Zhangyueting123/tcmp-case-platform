/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('dingtalk_push_logs')
export class DingtalkPushLog {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() userId: number;
  @Index() @Column({ nullable: true }) roundId: number;
  @Column({ type: 'simple-json' }) payload: any;
  @Column({ length: 16, default: 'SUCCESS' }) status: string;
  @Column({ type: 'int', default: 0 }) retryCount: number;
  @Column({ type: 'text', nullable: true }) lastError: string;
  @CreateDateColumn() createdAt: Date;
}
