/**
 * 本地干跑：解析 test-xmind/*.xmind，打印会入库的每一条用例（不落库）。
 * 用法：npx ts-node -T backend/scripts/xmind-dryrun.ts <可选 xmind 文件路径>
 * 无参时默认扫 test-xmind/*.xmind 第一个。
 */
import * as fs from 'fs';
import * as path from 'path';
import { XmindImportService } from '../src/modules/case-sets/xmind-import.service';

async function main() {
  const argPath = process.argv[2];
  let target = argPath;
  if (!target) {
    const dir = path.resolve(__dirname, '../../test-xmind');
    if (!fs.existsSync(dir)) throw new Error(`目录不存在：${dir}`);
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xmind'));
    if (!files.length) throw new Error(`test-xmind 下没有 .xmind 文件`);
    target = path.join(dir, files[0]);
  }
  console.log('reading', target);
  const buf = fs.readFileSync(target);

  const fakeCases = {
    bulkCreate: async (_csId: number, _uid: number, items: any[]) => ({
      ok: items.length,
      fail: 0,
      results: items.map((_, i) => ({ index: i, ok: true, id: i + 1, code: `X_${i}` })),
    }),
  } as any;
  const fakeRepo = { find: async () => [] } as any;
  const svc = new XmindImportService(fakeCases, fakeRepo);

  // 直接调 importXmind：因为 fakeCases 我们注入了假的 bulkCreate，
  // 里面会走完整流程；但我们想要看每一条 CaseInput，因此改成先拦截 inputs。
  // 简单做法：monkey-patch fakeCases.bulkCreate 打印 items。
  fakeCases.bulkCreate = async (_csId: number, _uid: number, items: any[]) => {
    console.log('\n==== 将要写入的用例（共', items.length, '条） ====\n');
    items.forEach((it, i) => {
      console.log(`--- #${i + 1} ---`);
      console.log('modulePath  :', it.modulePath.join(' / '));
      console.log('title       :', it.title);
      console.log('priority    :', it.priority);
      console.log('precondition:', it.precondition || '');
      console.log('steps       :', (it.steps || '').replace(/\n/g, '⏎ '));
      console.log('expected    :', (it.expectedResult || '').replace(/\n/g, '⏎ '));
      console.log('testData    :', it.testData || '');
      console.log('tags        :', (it.tags || []).join(','));
      console.log('');
    });
    return {
      ok: items.length,
      fail: 0,
      results: items.map((_, i) => ({ index: i, ok: true, id: i + 1, code: `X_${i}` })),
    };
  };

  const res = await svc.importXmind(1, 1, buf);
  console.log('\n==== 汇总 ====');
  console.log('imported:', res.imported, 'skipped:', res.skipped);
  if (res.errors && res.errors.length) {
    console.log('errors:');
    for (const e of res.errors) console.log('  ', e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
