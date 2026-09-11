# 删除 caseSet 26 下指定的空模块节点（错误生成的顶层"配置向导"子树 3416-3419）。备份->停后端->删->启。
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$nssm = 'C:\tcmp\nssm.exe'
$backend = 'C:\tcmp\app\backend'
$db = "$backend\data\tcmp.db"
$js = 'C:\tcmp\_mod_del.js'

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bak = "$backend\data\backups\tcmp-before-moddel-$stamp.db"
Copy-Item $db $bak -Force
Write-Output ("BACKUP=" + $bak)

& $nssm stop TCMP-Backend | Out-Null
Start-Sleep -Seconds 3
Write-Output 'BACKEND_STOPPED'

$code = @'
const initSqlJs = require('C:/tcmp/app/backend/node_modules/sql.js/dist/sql-asm.js');
const fs = require('fs');
const dbPath = process.argv[2];
const modIds = [3426, 3427];
const caseSetId = 26;
initSqlJs().then((SQL) => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const q = (sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  // 安全校验：这些模块下确实没有未删除用例
  const inList = modIds.join(',');
  const casesUnder = q(`SELECT COUNT(*) FROM case_set_cases WHERE deleted=0 AND moduleId IN (${inList})`);
  const cnt = casesUnder.length ? casesUnder[0][0] : 0;
  console.log('cases_under_target_modules=' + cnt);
  if (cnt > 0) { console.log('ABORT: modules still have cases'); process.exit(2); }
  db.run(`DELETE FROM modules WHERE caseSetId=${caseSetId} AND id IN (${inList})`);
  const out = Buffer.from(db.export());
  fs.writeFileSync(dbPath, out);
  // 复核
  const db2 = new SQL.Database(fs.readFileSync(dbPath));
  const left = db2.exec(`SELECT COUNT(*) FROM modules WHERE id IN (${inList})`);
  console.log('RESIDUE_MODULES=' + (left.length ? left[0].values[0][0] : 0));
  db2.close(); db.close();
  console.log('DONE_MODDEL');
}).catch((e) => { console.error('ERR', e); process.exit(1); });
'@
Set-Content -Path $js -Value $code -Encoding UTF8
& $node $js $db
$rc = $LASTEXITCODE

& $nssm start TCMP-Backend | Out-Null
Start-Sleep -Seconds 5
Write-Output 'BACKEND_STARTED'
if ($rc -ne 0) { throw "module delete failed ($rc)" }
Write-Output 'ALL_DONE'
