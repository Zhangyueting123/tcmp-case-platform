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
} from 'typeorm';

export enum CaseSetVisibility {
  PRIVATE = 'PRIVATE',
  PROJECT = 'PROJECT',
  PUBLIC = 'PUBLIC',
}

export enum CaseSetStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity('case_sets')
export class CaseSet {
  @PrimaryGeneratedColumn() id: number;

  @Index({ unique: true })
  @Column({ length: 32 })
  code: string;

  @Index({ unique: true })
  @Column({ length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ default: CaseSetVisibility.PUBLIC }) visibility: CaseSetVisibility;
  @Column() ownerUserId: number;
  @Index() @Column({ type: 'int', nullable: true }) groupId: number;
  @Column({ default: CaseSetStatus.ACTIVE }) status: CaseSetStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
