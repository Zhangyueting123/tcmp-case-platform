// @author zhangyueting
// @date 2026-06-12
// 清理示例项目中的演示轮次（id=5）及其用例实例、缺陷关联。
const fs = require('fs');
const path = require('path');

const BACKEND = 'C:/tcmp/app/backend';
const DB_FILE = path.join(BACKEND, 'data', 'tcmp.db');
const WASM = path.join(BACKEND, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const ROUND_ID = 5;

(async () => {
  const initSqlJs = require(path.join(BACKEND, 'node_modules', 'sql.js'));
  const SQL = await initSqlJs({ locateFile: () => WASM });
  const buf = fs.readFileSync(DB_FILE);
  const db = new SQL.Database(buf);

  const cnt = (sql) => {
    const r = db.exec(sql);
    return r.length ? r[0].values[0][0] : 0;
  };

  const before = {
    round: cnt(`SELECT COUNT(*) FROM rounds WHERE id = ${ROUND_ID}`),
    inst: cnt(`SELECT COUNT(*) FROM round_case_instances WHERE roundId = ${ROUND_ID}`),
    defects: cnt(
      `SELECT COUNT(*) FROM defect_links WHERE roundCaseInstanceId IN (SELECT id FROM round_case_instances WHERE roundId = ${ROUND_ID})`,
    ),
  };
  console.log('BEFORE', JSON.stringify(before));

  db.run(
    `DELETE FROM defect_links WHERE roundCaseInstanceId IN (SELECT id FROM round_case_instances WHERE roundId = ${ROUND_ID})`,
  );
  db.run(`DELETE FROM round_case_instances WHERE roundId = ${ROUND_ID}`);
  db.run(`DELETE FROM rounds WHERE id = ${ROUND_ID}`);

  const after = {
    round: cnt(`SELECT COUNT(*) FROM rounds WHERE id = ${ROUND_ID}`),
    inst: cnt(`SELECT COUNT(*) FROM round_case_instances WHERE roundId = ${ROUND_ID}`),
  };
  console.log('AFTER', JSON.stringify(after));

  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
  db.close();
  console.log('CLEANUP_DONE');
})().catch((e) => {
  console.error('CLEANUP_ERR', e.message);
  process.exit(1);
});
