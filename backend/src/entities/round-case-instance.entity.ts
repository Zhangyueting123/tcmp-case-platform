/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export type ExecutionResult = 'PENDING' | 'P' | 'F' | 'BLOCK' | 'NP' | 'NT';

@Entity('round_case_instances')
export class RoundCaseInstance {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() roundId: number;
  @Index() @Column() caseId: number;
  @Column('int') caseVersion: number;
  @Index() @Column() assigneeUserId: number;
  @Column({ nullable: true }) executorUserId: number;

  @Column({ length: 16, default: 'PENDING' }) result: ExecutionResult;
  @Column({ type: 'text', nullable: true }) actualResult: string;
  @Column({ type: 'text', nullable: true }) comment: string;
  @Column({ type: 'simple-json', nullable: true }) attachmentIds: number[];

  @Column({ type: 'datetime', nullable: true }) executedAt: Date;
  @Column({ type: 'int', nullable: true }) durationSeconds: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;

  // 乐观锁：并发更新同一执行实例时，TypeORM 在 save() 自动校验版本，冲突即抛错，防止后写覆盖前写
  @VersionColumn() version: number;
}
