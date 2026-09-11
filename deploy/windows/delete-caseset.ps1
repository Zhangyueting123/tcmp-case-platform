# 彻底删除 caseSetId=25(quickai)：备份 -> 停后端 -> 删除关联各表 -> 启后端 -> 复核残留。
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$nssm = 'C:\tcmp\nssm.exe'
$backend = 'C:\tcmp\app\backend'
$db = "$backend\data\tcmp.db"
$csid = 25
$js = 'C:\tcmp\_caseset_op.js'

if (-not (Test-Path $db)) { throw "db not found: $db" }

# 1) 备份
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bak = "$backend\data\backups\tcmp-before-del-cs$csid-$stamp.db"
Copy-Item $db $bak -Force
Write-Output ("BACKUP=" + $bak + " size=" + (Get-Item $bak).Length)

# 2) 停后端（sql.js 内存态：必须停服，否则运行中的服务会用内存覆盖本次文件写入）
& $nssm stop TCMP-Backend | Out-Null
Start-Sleep -Seconds 3
Write-Output 'BACKEND_STOPPED'

# 3) 写删除脚本并执行
$code = @'
const initSqlJs = require('C:/tcmp/app/backend/node_modules/sql.js/dist/sql-asm.js');
const fs = require('fs');
const dbPath = process.argv[2];
const csid = parseInt(process.argv[3], 10);
initSqlJs().then((SQL) => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const rows = (sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const caseIds = rows(`SELECT id FROM case_set_cases WHERE caseSetId=${csid}`).map((r) => r[0]);
  const inList = caseIds.length ? caseIds.join(',') : 'NULL';
  const rci = caseIds.length ? rows(`SELECT id FROM round_case_instances WHERE caseId IN (${inList})`).map((r) => r[0]) : [];
  const rciList = rci.length ? rci.join(',') : 'NULL';
  console.log('TO_DELETE cases=' + caseIds.length + ' rci=' + rci.length);
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
  console.log('SAVED bytes=' + out.length);
  const db2 = new SQL.Database(fs.readFileSync(dbPath));
  const chk = (sql) => { const r = db2.exec(sql); return r.length ? r[0].values[0][0] : 0; };
  console.log('RESIDUE_CASESET=' + chk(`SELECT COUNT(*) FROM case_sets WHERE id=${csid}`));
  console.log('RESIDUE_CASES=' + chk(`SELECT COUNT(*) FROM case_set_cases WHERE caseSetId=${csid}`));
  console.log('RESIDUE_MODULES=' + chk(`SELECT COUNT(*) FROM modules WHERE caseSetId=${csid}`));
  console.log('RESIDUE_VERSIONS_ORPHAN=' + chk(`SELECT COUNT(*) FROM case_versions WHERE caseId NOT IN (SELECT id FROM case_set_cases)`));
  db2.close();
  db.close();
  console.log('DONE_DELETE');
}).catch((e) => { console.error('ERR', e); process.exit(1); });
'@
Set-Content -Path $js -Value $code -Encoding UTF8
Write-Output ('using node: ' + $node)
& $node $js $db $csid
$code2 = $LASTEXITCODE

# 4) 启后端
& $nssm start TCMP-Backend | Out-Null
Start-Sleep -Seconds 5
Write-Output 'BACKEND_STARTED'
if ($code2 -ne 0) { throw "delete script failed ($code2)" }
Write-Output 'ALL_DONE'
