/**
 * TCMP 本地/内网探测：安全基线 + 并发读 + 登录压测（不写入业务数据）
 * 用法: node scripts/platform-smoke-test.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api/v1`;

const ADMIN = { email: 'admin@mech-mind.net', password: 'Admin@123' };
const TESTER = { email: 'tester@mech-mind.net', password: 'Tester@123' };

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

async function req(method, path, { token, body, expectStatus } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, ms: performance.now() - t0, error: String(e.message || e) };
  }
  const ms = performance.now() - t0;
  let json = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  } else {
    await res.text().catch(() => '');
  }
  const ok = expectStatus
    ? res.status === expectStatus
    : res.ok || (res.status === 201 && path.includes('/auth/login'));
  return { ok, status: res.status, ms, json, error: ok ? null : `HTTP ${res.status}` };
}

async function login(creds) {
  const r = await req('POST', '/auth/login', { body: creds });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`login failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  if (!r.json?.data?.accessToken) {
    throw new Error(`login failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.json.data.accessToken;
}

async function parallel(n, fn) {
  const results = await Promise.all(Array.from({ length: n }, () => fn()));
  return results;
}

function summarize(label, results) {
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const failed = results.filter((r) => !r.ok);
  console.log(
    `[${label}] n=${results.length} ok=${results.length - failed.length} fail=${failed.length}` +
      ` | ms p50=${percentile(times, 50).toFixed(0)} p95=${percentile(times, 95).toFixed(0)} max=${times[times.length - 1]?.toFixed(0) ?? 0}`,
  );
  if (failed.length && failed.length <= 5) {
    failed.forEach((f) => console.log('  fail:', f.status, f.error));
  } else if (failed.length > 5) {
    const codes = [...new Set(failed.map((f) => f.status))];
    console.log('  fail status codes:', codes.join(', '));
  }
  return { failed: failed.length, total: results.length };
}

const report = { security: [], concurrency: [], reliability: [] };

console.log('TCMP platform smoke @', BASE);

// --- Security ---
const noAuth = await req('GET', '/projects', { expectStatus: 401 });
report.security.push({
  name: '未登录访问 /projects 应 401',
  pass: noAuth.ok,
  detail: `status=${noAuth.status}`,
});

const badJwt = await req('GET', '/auth/me', { token: 'Bearer.not.valid', expectStatus: 401 });
report.security.push({
  name: '无效 JWT 访问 /auth/me 应 401',
  pass: badJwt.ok,
  detail: `status=${badJwt.status}`,
});

const wrongPwd = await req('POST', '/auth/login', {
  body: { email: ADMIN.email, password: 'WrongPass!1' },
});
report.security.push({
  name: '错误密码登录应非 200',
  pass: wrongPwd.status === 401 || wrongPwd.status === 400,
  detail: `status=${wrongPwd.status}`,
});

const tpl = await fetch(`${API}/case-sets/template/blank`);
report.security.push({
  name: 'Public 模板下载可匿名访问',
  pass: tpl.status === 200,
  detail: `status=${tpl.status}`,
});

let adminToken;
let testerToken;
try {
  adminToken = await login(ADMIN);
  testerToken = await login(TESTER);
} catch (e) {
  console.error('无法登录 seed 账号，请先 npm run seed:', e.message);
  process.exit(1);
}

const meTester = await req('GET', '/auth/me', { token: testerToken, expectStatus: 200 });
const testerId = meTester.json?.data?.id;
const privEsc = await req('PATCH', `/users/${testerId}/system-roles`, {
  token: testerToken,
  body: { roles: ['SysAdmin'] },
});
report.security.push({
  name: 'tester 不能 PATCH 自己的 system-roles（应 403）',
  pass: privEsc.status === 403,
  detail: `status=${privEsc.status} code=${privEsc.json?.code ?? '-'}`,
});

const meAfter = await req('GET', '/auth/me', { token: testerToken, expectStatus: 200 });
const roles = meAfter.json?.data?.systemRoles || [];
report.security.push({
  name: '越权失败后 tester 仍未成为 SysAdmin',
  pass: !roles.includes('SysAdmin'),
  detail: `roles=${JSON.stringify(roles)}`,
});

// --- Concurrency (read-heavy + login) ---
const LOGIN_N = 40;
const loginBurst = await parallel(LOGIN_N, () =>
  req('POST', '/auth/login', { body: ADMIN }),
);
const loginSum = summarize('并发登录', loginBurst);
report.concurrency.push({ name: `${LOGIN_N} 并行登录`, ...loginSum });

const ME_N = 60;
const meBurst = await parallel(ME_N, () => req('GET', '/auth/me', { token: adminToken, expectStatus: 200 }));
const meSum = summarize('并发 /auth/me', meBurst);
report.concurrency.push({ name: `${ME_N} 并行 /auth/me`, ...meSum });

const PROJ_N = 50;
const projBurst = await parallel(PROJ_N, () => req('GET', '/projects', { token: adminToken, expectStatus: 200 }));
const projSum = summarize('并发 GET /projects', projBurst);
report.concurrency.push({ name: `${PROJ_N} 并行读项目列表`, ...projSum });

// --- Reliability: sequential wrong logins (nonexistent user, no lock side-effect on real accounts) ---
const failSeq = [];
for (let i = 0; i < 6; i++) {
  failSeq.push(
    await req('POST', '/auth/login', {
      body: { email: 'nobody@mech-mind.net', password: 'x' },
    }),
  );
}
report.reliability.push({
  name: '不存在账号连续错误登录均返回 401',
  pass: failSeq.every((r) => r.status === 401),
  detail: failSeq.map((r) => r.status).join(','),
});

console.log('\n=== 安全项 ===');
for (const s of report.security) {
  console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.name}  (${s.detail})`);
}

console.log('\n=== 可靠性 ===');
for (const r of report.reliability) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
}

const secFail = report.security.filter((s) => !s.pass).length;
const concFail = report.concurrency.reduce((a, c) => a + c.failed, 0);
const relFail = report.reliability.filter((r) => !r.pass).length;
console.log('\n汇总: 安全失败', secFail, '| 并发请求失败', concFail, '| 可靠性失败', relFail);
process.exit(secFail + relFail > 0 ? 1 : 0);
