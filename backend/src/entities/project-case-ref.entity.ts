/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, Unique, Index, CreateDateColumn } from 'typeorm';

@Entity('project_case_refs')
@Unique(['projectId', 'caseId'])
export class ProjectCaseRef {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() projectId: number;
  @Index() @Column() caseId: number;
  @Column('int') pinnedVersion: number;
  @Column({ nullable: true }) addedBy: number;
  @CreateDateColumn() addedAt: Date;
}
