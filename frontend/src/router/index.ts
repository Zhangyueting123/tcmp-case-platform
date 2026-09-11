/**
 * @author zhangyueting
 * @date 2026-06-10
 */
import { createRouter, createWebHistory } from 'vue-router';
import Layout from '@/views/Layout.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/Login.vue') },
    { path: '/register', component: () => import('@/views/Register.vue') },
    {
      path: '/',
      component: Layout,
      redirect: '/workbench',
      children: [
        { path: 'workbench', component: () => import('@/views/Workbench.vue') },
        { path: 'case-sets', component: () => import('@/views/CaseSets/List.vue') },
        { path: 'case-sets/group/:gid', component: () => import('@/views/CaseSets/GroupDetail.vue') },
        { path: 'case-sets/:id', component: () => import('@/views/CaseSets/Detail.vue') },
        { path: 'my-reviews', component: () => import('@/views/CaseReviews/MyReviews.vue') },
        { path: 'reviews/:id', component: () => import('@/views/CaseReviews/ReviewDetail.vue') },
        { path: 'projects', component: () => import('@/views/Projects/List.vue') },
        { path: 'projects/:id', component: () => import('@/views/Projects/Detail.vue') },
        {
          path: 'projects/:id/rounds/:roundId',
          component: () => import('@/views/Rounds/Detail.vue'),
        },
        {
          path: 'projects/:id/rounds/:roundId/execute',
          component: () => import('@/views/Rounds/Execute.vue'),
        },
        {
          path: 'projects/:id/rounds/:roundId/report',
          component: () => import('@/views/Rounds/Report.vue'),
        },
        {
          path: 'projects/:id/defects',
          component: () => import('@/views/Defects/Dashboard.vue'),
        },
        { path: 'admin', component: () => import('@/views/Admin.vue') },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem('accessToken');
  if (!token && to.path !== '/login' && to.path !== '/register') return '/login';
  if (token && (to.path === '/login' || to.path === '/register')) return '/workbench';
});

export default router;
