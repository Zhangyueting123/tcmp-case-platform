/**
 * @author zhangyueting
 * @date 2026-07-28
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type CaseReviewStatus = 'IN_REVIEW' | 'REVISING' | 'CLOSED';

/**
 * 用例评审单：对一个用例集（可限定某模块子树）发起的一次评审。
 * 状态机：IN_REVIEW（评审中）→ REVISING（修订中）→ CLOSED（已关闭）。
 */
@Entity('case_reviews')
export class CaseReview {
  @PrimaryGeneratedColumn() id: number;

  // 主用例集 id（单集评审即该集；多集评审为所选集合的第一个，用于兼容旧逻辑）
  @Index() @Column() caseSetId: number;

  // 多用例集评审：本次评审覆盖的全部用例集 id。为空/仅一项时等价于单集评审。
  @Column({ type: 'simple-json', nullable: true }) caseSetIds: number[] | null;

  // 评审范围子树根模块 id；null=整个用例集
  @Column({ type: 'int', nullable: true }) moduleId: number | null;

  @Column({ length: 200 }) title: string;

  @Column({ length: 16, default: 'IN_REVIEW' }) status: CaseReviewStatus;

  @Index() @Column() initiatorUserId: number;

  // 评审成员的用户 id 列表
  @Column({ type: 'simple-json', nullable: true }) reviewerUserIds: number[];

  // 已点「评审完成」的评审成员 id 列表
  @Column({ type: 'simple-json', nullable: true }) completedReviewerIds: number[];

  // 发起时范围内活跃用例 id 快照
  @Column({ type: 'simple-json', nullable: true }) caseIdsSnapshot: number[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @Column({ type: 'datetime', nullable: true }) closedAt: Date | null;
}
