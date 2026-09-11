/**
 * @author zhangyueting
 * @date 2026-07-15
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 用例集分组（"用例集项目"）——用例集的上层归类，每个用例集必须属于一个分组 */
@Entity('case_set_groups')
export class CaseSetGroup {
  @PrimaryGeneratedColumn() id: number;

  @Index({ unique: true })
  @Column({ length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ nullable: true }) createdBy: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
