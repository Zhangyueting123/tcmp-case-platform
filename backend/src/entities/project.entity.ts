/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn() id: number;

  @Index({ unique: true })
  @Column({ length: 10 })
  projectKey: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ type: 'text', nullable: true }) description: string;

  /**
   * 项目层级树：parentId 指向上级项目，level 表示层级。
   * 1=项目（顶层，成员/权限在此层，下层继承） 2=子项目 3=模块功能测试项目（叶子，挂用例池/轮次）。
   * 现有扁平项目默认 level=1、parentId=null。
   */
  @Index() @Column({ type: 'int', nullable: true }) parentId: number;
  @Column({ type: 'int', default: 1 }) level: number;

  @Column({ length: 32, nullable: true }) tbProjectId: string;
  @Column({ length: 32, nullable: true }) tbBugSectionId: string;
  @Column({ length: 500, nullable: true }) tbBugSectionUrl: string;

  /** 版本迭代（子项目用）：如 3.0.1 或 迭代S1 */
  @Column({ length: 64, nullable: true }) versionIteration: string;

  @Column({ length: 16, default: 'ACTIVE' }) status: ProjectStatus;
  /** 内置项目（如 Vision/MSR/DLK/Viz/2D 智能相机）：由 seed 创建，不允许删除 */
  @Column({ type: 'boolean', default: false }) isBuiltin: boolean;
  @Column() createdBy: number;
  @CreateDateColumn() createdAt: Date;
}
