/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// 出现概率：STABLE = 稳定复现，HIGH = 高频偶发，LOW = 低频偶发
export type OccurrenceProb = 'STABLE' | 'HIGH' | 'LOW';

@Entity('defect_links')
export class DefectLink {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() roundCaseInstanceId: number;
  @Index() @Column() projectId: number;

  @Column({ length: 32 }) tbProjectId: string;
  @Column({ length: 64 }) tbTaskId: string;
  @Column({ length: 32, nullable: true }) tbBugSectionId: string;
  @Column({ length: 500, nullable: true }) tbUrl: string;

  @Column({ length: 200 }) title: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ length: 16, default: '一般' }) severity: string;
  @Column({ length: 8, default: '普通' }) priority: string;
  @Column({ length: 32, default: '未开始' }) tbStatus: string;
  @Column({ length: 16, default: 'LOW' }) occurrenceProb: OccurrenceProb;
  @Column({ length: 64, nullable: true }) tbExecutorId: string;
  // 待认领人（系统内用户 id；可能与 tbExecutorId 不一致——前者用于本系统跟踪，后者用于 TB 任务执行人）
  @Column({ nullable: true }) assigneeUserId: number;

  @Column({ type: 'datetime', nullable: true }) lastSyncedAt: Date;
  @Column() createdBy: number;
  @CreateDateColumn() createdAt: Date;
}
