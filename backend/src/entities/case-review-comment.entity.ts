/**
 * @author zhangyueting
 * @date 2026-07-28
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 评审意见：某评审单内针对某条用例(caseId)的一条评论。
 * resolved 供发起者在修订时标记该意见已处理。
 */
@Entity('case_review_comments')
export class CaseReviewComment {
  @PrimaryGeneratedColumn() id: number;

  @Index() @Column() reviewId: number;
  @Index() @Column() caseId: number;

  @Column() authorUserId: number;

  @Column({ type: 'text' }) content: string;

  @Column({ default: false }) resolved: boolean;

  @CreateDateColumn() createdAt: Date;
}
