/**
 * @author zhangyueting
 * @date 2026-06-10
 */
export * from './user.entity';
export * from './user-project-role.entity';
export * from './case-set.entity';
export * from './case-set-group.entity';
export * from './module.entity';
export * from './case-set-case.entity';
export * from './case-version.entity';
export * from './project.entity';
export * from './project-case-ref.entity';
export * from './round.entity';
export * from './round-case-instance.entity';
export * from './defect-link.entity';
export * from './audit-log.entity';
export * from './dingtalk-push-log.entity';
export * from './attachment.entity';
export * from './case-review.entity';
export * from './case-review-comment.entity';

import { User } from './user.entity';
import { UserProjectRole } from './user-project-role.entity';
import { CaseSet } from './case-set.entity';
import { CaseSetGroup } from './case-set-group.entity';
import { ModuleNode } from './module.entity';
import { CaseSetCase } from './case-set-case.entity';
import { CaseVersion } from './case-version.entity';
import { Project } from './project.entity';
import { ProjectCaseRef } from './project-case-ref.entity';
import { Round } from './round.entity';
import { RoundCaseInstance } from './round-case-instance.entity';
import { DefectLink } from './defect-link.entity';
import { AuditLog } from './audit-log.entity';
import { DingtalkPushLog } from './dingtalk-push-log.entity';
import { Attachment } from './attachment.entity';
import { CaseReview } from './case-review.entity';
import { CaseReviewComment } from './case-review-comment.entity';

export const entities = [
  User,
  UserProjectRole,
  CaseSet,
  CaseSetGroup,
  ModuleNode,
  CaseSetCase,
  CaseVersion,
  Project,
  ProjectCaseRef,
  Round,
  RoundCaseInstance,
  DefectLink,
  AuditLog,
  DingtalkPushLog,
  Attachment,
  CaseReview,
  CaseReviewComment,
];
