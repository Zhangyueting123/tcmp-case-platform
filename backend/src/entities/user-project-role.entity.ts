/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { Entity, PrimaryGeneratedColumn, Column, Unique, Index } from 'typeorm';

@Entity('user_project_roles')
@Unique(['userId', 'projectId', 'roleCode'])
export class UserProjectRole {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() userId: number;
  @Index() @Column() projectId: number;
  /** PM | TestLead | Tester | CaseLibOwner | Viewer */
  @Column({ length: 32 }) roleCode: string;
}
