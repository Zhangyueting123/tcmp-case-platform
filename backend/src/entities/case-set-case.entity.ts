/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export type CasePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type CaseType =
  | 'BUSINESS'
  | 'FUNCTION'
  | 'API'
  | 'COMPAT'
  | 'PERF'
  | 'SECURITY'
  | 'UX'
  | 'OTHER';
export type ExecutionMode = 'MANUAL' | 'AUTO' | 'SEMI_AUTO';
export type TestStage = 'SMOKE' | 'SYSTEM' | 'REGRESSION' | 'ACCEPTANCE' | 'PRE_RELEASE';
export type CaseStatus = 'DRAFT' | 'REVIEW' | 'ACTIVE' | 'ARCHIVED';

@Entity('case_set_cases')
@Unique('uniq_caseset_code', ['caseSetId', 'code'])
export class CaseSetCase {
  @PrimaryGeneratedColumn() id: number;

  @Index() @Column() caseSetId: number;

  @Column({ length: 64 })
  code: string;

  @Column({ length: 200 }) title: string;
  @Index() @Column() moduleId: number;

  @Column({ length: 8, default: 'P2' }) priority: CasePriority;
  @Column({ length: 16, default: 'FUNCTION' }) type: CaseType;
  @Column({ length: 16, default: 'MANUAL' }) executionMode: ExecutionMode;
  @Column({ length: 16, default: 'SYSTEM' }) testStage: TestStage;

  @Column({ type: 'text', nullable: true }) precondition: string;
  @Column({ type: 'text' }) steps: string;
  @Column({ type: 'text', nullable: true }) testData: string;
  @Column({ type: 'text' }) expectedResult: string;

  @Column({ type: 'simple-json', nullable: true }) tags: string[];

  @Column({ type: 'int', default: 1 }) currentVersion: number;
  @Column({ length: 16, default: 'ACTIVE' }) status: CaseStatus;

  @Column({ nullable: true }) createdBy: number;
  @Column({ nullable: true }) updatedBy: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;

  @Column({ default: false }) deleted: boolean;
}
