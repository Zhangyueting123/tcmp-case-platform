/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/** 4-level module tree: 1=模块 / 2=子模块 / 3=子功能 / 4=测试项 */
@Entity('modules')
export class ModuleNode {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() caseSetId: number;
  @Column({ nullable: true }) parentId: number;
  @Column('int') level: number;
  @Column({ length: 64 }) name: string;
  @Column({ length: 32, nullable: true }) code: string;
  @Column({ length: 500 }) path: string;
  @Column({ type: 'int', default: 0 }) orderNo: number;

  // Only meaningful on level=1
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ type: 'text', nullable: true }) testEnvironment: string;
  @Column({ type: 'date', nullable: true }) baselineDate: Date;
  @Column({ type: 'simple-json', nullable: true }) owners: string[];
}
