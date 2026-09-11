# 只读盘点：统计 caseSetId 相关各表行数（不改任何数据）。用于确认彻底删除的范围。
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$backend = 'C:\tcmp\app\backend'
$db = "$backend\data\tcmp.db"
$csid = 25
$js = 'C:\tcmp\_caseset_op.js'

$code = @'
const initSqlJs = require('C:/tcmp/app/backend/node_modules/sql.js/dist/sql-asm.js');
const fs = require('fs');
const dbPath = process.argv[2];
const csid = parseInt(process.argv[3], 10);
const mode = process.argv[4] || 'inspect';
initSqlJs().then((SQL) => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const rows = (sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const scalar = (sql) => { const v = rows(sql); return v.length ? v[0][0] : 0; };
  const cs = rows(`SELECT id,code,name,groupId,status FROM case_sets WHERE id=${csid}`);
  console.log('CASESET=' + JSON.stringify(cs));
  const caseIds = rows(`SELECT id FROM case_set_cases WHERE caseSetId=${csid}`).map((r) => r[0]);
  const inList = caseIds.length ? caseIds.join(',') : 'NULL';
  const rci = caseIds.length ? rows(`SELECT id FROM round_case_instances WHERE caseId IN (${inList})`).map((r) => r[0]) : [];
  const rciList = rci.length ? rci.join(',') : 'NULL';
  console.log('CASES=' + caseIds.length);
  console.log('MODULES=' + scalar(`SELECT COUNT(*) FROM modules WHERE caseSetId=${csid}`));
  console.log('CASE_VERSIONS=' + (caseIds.length ? scalar(`SELECT COUNT(*) FROM case_versions WHERE caseId IN (${inList})`) : 0));
  console.log('PROJECT_CASE_REFS=' + (caseIds.length ? scalar(`SELECT COUNT(*) FROM project_case_refs WHERE caseId IN (${inList})`) : 0));
  console.log('ROUND_CASE_INSTANCES=' + rci.length);
  console.log('DEFECT_LINKS=' + (rci.length ? scalar(`SELECT COUNT(*) FROM defect_links WHERE roundCaseInstanceId IN (${rciList})`) : 0));
  if (mode === 'delete') {
    db.run('BEGIN');
    if (rci.length) db.run(`DELETE FROM defect_links WHERE roundCaseInstanceId IN (${rciList})`);
    if (caseIds.length) {
      db.run(`DELETE FROM round_case_instances WHERE caseId IN (${inList})`);
      db.run(`DELETE FROM case_versions WHERE caseId IN (${inList})`);
      db.run(`DELETE FROM project_case_refs WHERE caseId IN (${inList})`);
      db.run(`DELETE FROM case_set_cases WHERE caseSetId=${csid}`);
    }
    db.run(`DELETE FROM modules WHERE caseSetId=${csid}`);
    db.run(`DELETE FROM case_sets WHERE id=${csid}`);
    db.run('COMMIT');
    const out = Buffer.from(db.export());
    fs.writeFileSync(dbPath, out);
    console.log('DELETED_AND_SAVED=' + out.length);
    // 复核残留
    const db2 = new SQL.Database(fs.readFileSync(dbPath));
    const chk = (sql) => { const r = db2.exec(sql); return r.length ? r[0].values[0][0] : 0; };
    console.log('RESIDUE_CASESET=' + chk(`SELECT COUNT(*) FROM case_sets WHERE id=${csid}`));
    console.log('RESIDUE_CASES=' + chk(`SELECT COUNT(*) FROM case_set_cases WHERE caseSetId=${csid}`));
    console.log('RESIDUE_MODULES=' + chk(`SELECT COUNT(*) FROM modules WHERE caseSetId=${csid}`));
    db2.close();
  }
  db.close();
  console.log('DONE_' + mode.toUpperCase());
}).catch((e) => { console.error('ERR', e); process.exit(1); });
'@
Set-Content -Path $js -Value $code -Encoding UTF8
Write-Output ('using node: ' + $node)
& $node $js $db $csid 'inspect'
Write-Output 'INSPECT_DONE'
