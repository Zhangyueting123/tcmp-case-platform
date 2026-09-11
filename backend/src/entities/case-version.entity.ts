/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, Unique } from 'typeorm';

@Entity('case_versions')
@Unique(['caseId', 'version'])
export class CaseVersion {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() caseId: number;
  @Column('int') version: number;
  @Column({ type: 'simple-json' }) snapshot: any;
  @Column({ length: 500, nullable: true }) changeNote: string;
  @Column({ nullable: true }) changedBy: number;
  @CreateDateColumn() changedAt: Date;
}
