$ErrorActionPreference = 'Continue'
$node = 'C:\Program Files\nodejs\node.exe'
$script = @'
const crypto = require('crypto');
const webhook = process.env.DINGTALK_WEBHOOK;
const secret = process.env.DINGTALK_SECRET;
const ts = Date.now().toString();
const sign = crypto.createHmac('sha256', secret).update(`${ts}\n${secret}`).digest('base64');
const url = new URL(webhook);
url.searchParams.set('timestamp', ts);
url.searchParams.set('sign', sign);
const body = {
  msgtype: 'markdown',
  markdown: {
    title: '[TCMP] 钉钉推送连通性测试',
    text: '### [TCMP] 钉钉推送连通性测试\n\n如果你在群里看到这条消息，说明服务器到钉钉的 HTTPS 通道已经打通。\n\n_time: ' + new Date().toISOString() + '_'
  },
  at: { atMobiles: [], isAtAll: false }
};
(async () => {
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('HTTP', res.status);
  console.log(text);
})().catch(e => { console.log('THREW', e.code || '', e.message, e.cause && e.cause.code); });
'@
$tmp = "$env:TEMP\push-dingtalk-test.js"
$script | Out-File -Encoding utf8 -FilePath $tmp

# 用服务同样的环境变量
$env:DINGTALK_WEBHOOK  = 'https://oapi.dingtalk.com/robot/send?access_token=9cdb01257f30aea321513b8fb403e12ed6bc8fcf07cd63e3fb32af2838aa9550'
$env:DINGTALK_SECRET   = 'SECa99cc0c418a185fb9164a15e27e5ee082877402cd61d5ccbde7b0d620652ea51'
$env:NODE_OPTIONS      = '--use-system-ca'
& $node $tmp
