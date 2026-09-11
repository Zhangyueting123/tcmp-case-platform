$ErrorActionPreference = 'Continue'
$node = 'C:\Program Files\nodejs\node.exe'
$script = @'
const https = require('https');
function probe(useSystemCa){
  return new Promise((resolve) => {
    const req = https.request({
      host: 'oapi.dingtalk.com', port: 443, path: '/robot/send',
      method: 'GET', servername: 'oapi.dingtalk.com',
    }, (res) => {
      const s = res.socket;
      const chain = [];
      const seen = new Set();
      let c = s.getPeerCertificate(true);
      let depth = 0;
      while (c && c.subject && depth < 10) {
        const fp = c.fingerprint || String(depth);
        if (seen.has(fp)) break;
        seen.add(fp);
        chain.push({ subject: c.subject, issuer: c.issuer, valid_to: c.valid_to });
        c = c.issuerCertificate;
        depth++;
      }
      resolve({ mode: useSystemCa ? 'system-ca' : 'bundled', authorized: s.authorized, authError: s.authorizationError, chain });
    });
    req.on('error', (e) => resolve({ mode: useSystemCa ? 'system-ca' : 'bundled', error: e.code, message: e.message, cause: e.cause && e.cause.code }));
    req.end();
  });
}
(async () => {
  console.log('--- Node default CA ---');
  console.log(JSON.stringify(await probe(false), null, 2));
})();
'@
$tmp = "$env:TEMP\probe-dingtalk.js"
$script | Out-File -Encoding utf8 -FilePath $tmp
& $node $tmp
Write-Output '--- with --use-system-ca ---'
& $node --use-system-ca $tmp
