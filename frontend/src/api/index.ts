/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import http from './http';

export const authApi = {
  sendCode: (email: string) => http.post('/auth/send-code', { email }),
  register: (dto: any) => http.post('/auth/register', dto),
  login: (email: string, password: string) => http.post('/auth/login', { email, password }),
  refresh: (refreshToken: string) => http.post('/auth/refresh', { refreshToken }),
  me: () => http.get('/auth/me'),
  updateProfile: (dto: {
    name?: string;
    phone?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => http.patch('/auth/me', dto),
  forgotPasswordSendCode: (email: string) => http.post('/auth/forgot-password/send-code', { email }),
  resetPassword: (dto: { email: string; code: string; newPassword: string }) =>
    http.post('/auth/reset-password', dto),
};

export const userApi = {
  list: (q?: string) => http.get('/users', { params: { q } }),
};

export const caseSetApi = {
  list: (groupId?: number, keyword?: string) =>
    http.get('/case-sets', {
      params: {
        ...(groupId != null ? { groupId } : {}),
        ...(keyword ? { keyword } : {}),
      },
    }),
  detail: (id: number) => http.get(`/case-sets/${id}`),
  create: (dto: any) => http.post('/case-sets', dto),
  update: (id: number, dto: any) => http.patch(`/case-sets/${id}`, dto),
  moveToGroup: (id: number, groupId: number) =>
    http.post(`/case-sets/${id}/move-group`, { groupId }),
  moveToGroupBatch: (caseSetIds: number[], groupId: number) =>
    http.post('/case-sets/move-group/batch', { caseSetIds, groupId }),
  remove: (id: number) => http.delete(`/case-sets/${id}`),
  // 用例集分组（"用例集项目"）
  groups: () => http.get('/case-sets/groups'),
  createGroup: (dto: any) => http.post('/case-sets/groups', dto),
  updateGroup: (gid: number, dto: any) => http.patch(`/case-sets/groups/${gid}`, dto),
  removeGroup: (gid: number) => http.delete(`/case-sets/groups/${gid}`),
  purgeAll: (id: number) => http.delete(`/case-sets/${id}/purge`),
  repositionModule: (caseSetId: number, dragId: number, dropId: number, position: 'before' | 'after' | 'inner') =>
    http.post(`/case-sets/${caseSetId}/modules/reposition`, { dragId, dropId, position }),
  modules: (id: number) => http.get(`/case-sets/${id}/modules`),
  updateModule: (moduleId: number, dto: { name?: string }) =>
    http.patch(`/case-sets/modules/${moduleId}`, dto),
  cases: (id: number, params?: any) => http.get(`/case-sets/${id}/cases`, { params }),
  createCase: (id: number, dto: any) => http.post(`/case-sets/${id}/cases`, dto),
  bulkCreateCases: (id: number, items: any[]) => http.post(`/case-sets/${id}/cases/bulk`, { items }),
  renumberCases: (id: number, orderedIds: number[]) =>
    http.post(`/case-sets/${id}/cases/renumber`, { orderedIds }),
  bulkDeleteCases: (id: number, caseIds: number[]) =>
    http.post(`/case-sets/${id}/cases/bulk-delete`, { caseIds }),
  updateCase: (id: number, dto: any) => http.patch(`/cases/${id}`, dto),
  deleteCase: (id: number) => http.delete(`/cases/${id}`),
  caseDetail: (id: number) => http.get(`/cases/${id}`),
};

export const projectApi = {
  list: () => http.get('/projects'),
  tree: () => http.get('/projects/tree'),
  defectBoard: (id: number) => http.get(`/projects/${id}/defect-board`),
  create: (dto: any) => http.post('/projects', dto),
  detail: (id: number) => http.get(`/projects/${id}`),
  update: (id: number, dto: any) => http.patch(`/projects/${id}`, dto),
  remove: (id: number) => http.delete(`/projects/${id}`),
  members: (id: number) => http.get(`/projects/${id}/members`),
  addMember: (id: number, dto: any) => http.post(`/projects/${id}/members`, dto),
  removeMember: (mid: number) => http.delete(`/projects/members/${mid}`),
  cases: (id: number) => http.get(`/projects/${id}/cases`),
  addCases: (id: number, caseIds: number[]) => http.post(`/projects/${id}/cases`, { caseIds }),
  removeCase: (id: number, cid: number) => http.delete(`/projects/${id}/cases/${cid}`),
  caseSources: (id: number) => http.get(`/projects/${id}/case-sources`),
  testTb: (id: number) => http.post(`/projects/${id}/test-tb`),
};

export const roundApi = {
  list: (pid: number) => http.get(`/projects/${pid}/rounds`),
  create: (pid: number, dto: any) => http.post(`/projects/${pid}/rounds`, dto),
  detail: (id: number) => http.get(`/rounds/${id}`),
  update: (id: number, dto: any) => http.patch(`/rounds/${id}`, dto),
  preview: (id: number) => http.get(`/rounds/${id}/preview`),
  publish: (id: number) => http.post(`/rounds/${id}/publish`),
  close: (id: number) => http.post(`/rounds/${id}/close`),
  pause: (id: number) => http.post(`/rounds/${id}/pause`),
  assign: (id: number, dto: any) => http.post(`/rounds/${id}/assign`, dto),
  unassign: (id: number, dto: any) => http.post(`/rounds/${id}/unassign`, dto),
  excludeCases: (id: number, caseIds: number[]) => http.post(`/rounds/${id}/exclude-cases`, { caseIds }),
  restoreCases: (id: number, caseIds?: number[]) => http.post(`/rounds/${id}/restore-cases`, caseIds ? { caseIds } : {}),
  assigned: (id: number) => http.get(`/rounds/${id}/assigned`),
  cases: (id: number, params?: any) => http.get(`/rounds/${id}/cases`, { params }),
};

export const execApi = {
  detail: (id: number) => http.get(`/round-cases/${id}`),
  setResult: (id: number, dto: any) => http.patch(`/round-cases/${id}/result`, dto),
  reviseCase: (id: number, dto: any) => http.patch(`/round-cases/${id}/case`, dto),
  removeInstance: (id: number) => http.delete(`/round-cases/${id}`),
};

export const defectApi = {
  submit: (id: number, dto: any) => http.post(`/round-cases/${id}/defects`, dto),
  submitManual: (id: number, dto: any) => http.post(`/round-cases/${id}/defects/manual`, dto),
  attachTb: (id: number, tbUrl: string, taskId?: string, title?: string) =>
    http.post(`/defects/${id}/attach-tb`, { tbUrl, taskId, title }),
  syncStatus: (id: number, status: string, title?: string) =>
    http.post(`/defects/${id}/sync-status`, { status, title }),
  remove: (id: number) => http.delete(`/defects/${id}`),
  listByInstance: (id: number) => http.get(`/round-cases/${id}/defects`),
  list: (pid: number, params?: any) => http.get(`/projects/${pid}/defects`, { params }),
  dashboard: (pid: number) => http.get(`/projects/${pid}/defects/dashboard`),
};

export const tbAuthApi = {
  start: () => http.get('/auth/tb/start'),
  status: () => http.get('/auth/tb/status'),
  revoke: () => http.post('/auth/tb/revoke'),
};

export const tbFillerApi = {
  status: () => http.get('/tb-filler/status'),
  launch: (openUrl?: string) => http.post('/tb-filler/launch', { openUrl }),
  autoFill: (defectId: number) => http.post(`/defects/${defectId}/auto-fill`),
};

export const reportApi = {
  get: (rid: number) => http.get(`/rounds/${rid}/report`),
  exportUrl: (rid: number) => `/api/v1/rounds/${rid}/report/export`,
};

export const reviewApi = {
  create: (caseSetId: number, dto: any) => http.post(`/case-sets/${caseSetId}/reviews`, dto),
  // 跨多个用例集发起评审
  createMulti: (dto: { title: string; caseSetIds: number[]; reviewerUserIds: number[] }) =>
    http.post('/reviews', dto),
  listByCaseSet: (caseSetId: number) => http.get(`/case-sets/${caseSetId}/reviews`),
  mine: () => http.get('/reviews/mine'),
  detail: (id: number) => http.get(`/reviews/${id}`),
  addComment: (id: number, dto: { caseId: number; content: string }) =>
    http.post(`/reviews/${id}/comments`, dto),
  comments: (id: number, caseId?: number) =>
    http.get(`/reviews/${id}/comments`, { params: caseId != null ? { caseId } : {} }),
  resolveComment: (id: number, cid: number, resolved: boolean) =>
    http.patch(`/reviews/${id}/comments/${cid}/resolve`, { resolved }),
  complete: (id: number, completed: boolean) => http.patch(`/reviews/${id}/complete`, { completed }),
  endReview: (id: number) => http.patch(`/reviews/${id}/end-review`),
  close: (id: number) => http.patch(`/reviews/${id}/close`),
  setReviewers: (id: number, reviewerUserIds: number[]) =>
    http.patch(`/reviews/${id}/reviewers`, { reviewerUserIds }),
  // 评审中补充/移除用例
  candidateCases: (id: number, caseSetId?: number) =>
    http.get(`/reviews/${id}/candidate-cases`, { params: caseSetId != null ? { caseSetId } : {} }),
  addCases: (id: number, caseIds: number[]) => http.post(`/reviews/${id}/cases`, { caseIds }),
  removeCase: (id: number, caseId: number) => http.delete(`/reviews/${id}/cases/${caseId}`),
  exportUrl: (id: number) => `/api/v1/reviews/${id}/export`,
};

export const taskApi = {
  mine: () => http.get('/me/tasks'),
};
