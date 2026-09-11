/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

export type RoundStatus = 'DRAFT' | 'IN_PROGRESS' | 'PAUSED' | 'CLOSED';

@Entity('rounds')
export class Round {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() projectId: number;
  @Column({ length: 64 }) name: string;
  @Column({ length: 64 }) softwareVersion: string;
  @Column({ nullable: true }) previousRoundId: number;

  /** Boolean tree, see PRD §5.3 */
  @Column({ type: 'simple-json', nullable: true }) filterExpr: any;

  /** 手动从筛选结果中排除的用例 ID（仅未发布/未分配阶段使用） */
  @Column({ type: 'simple-json', nullable: true }) excludedCaseIds: number[];

  @Column({ length: 16, default: 'DRAFT' }) status: RoundStatus;

  @Column({ type: 'datetime', nullable: true }) plannedStart: Date;
  @Column({ type: 'datetime', nullable: true }) plannedEnd: Date;
  @Column({ type: 'datetime', nullable: true }) actualStart: Date;
  @Column({ type: 'datetime', nullable: true }) actualEnd: Date;

  @Column({ type: 'text', nullable: true }) testEnvironment: string;
  @Column({ type: 'text', nullable: true }) softwarePath: string;
  @Column({ type: 'text', nullable: true }) summary: string;

  /**
   * 该轮次的 Teambition 缺陷分组（"TB 路径"）——按轮次配置，覆盖项目级配置。
   * 由 tbBugSectionUrl 解析出 tbProjectId / tbBugSectionId。
   */
  @Column({ length: 32, nullable: true }) tbProjectId: string;
  @Column({ length: 32, nullable: true }) tbBugSectionId: string;
  @Column({ length: 500, nullable: true }) tbBugSectionUrl: string;

  @Column() createdBy: number;
  @CreateDateColumn() createdAt: Date;
}
