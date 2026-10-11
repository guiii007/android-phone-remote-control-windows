import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pairingToken} from '../src/pairing-token.mjs';
import {remotePort} from '../src/local-settings.mjs';
test('两份新安装自动生成不同密钥，重复启动保留本机密钥',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'palm-install-')),a=join(folder,'a'),b=join(folder,'b');
  try{const first=await pairingToken(a),second=await pairingToken(b);assert.match(first,/^[a-f0-9]{64}$/);assert.notEqual(first,second);assert.equal(await pairingToken(a),first);
    await writeFile(a,'invalid');await assert.rejects(pairingToken(a));assert.equal(await readFile(a,'utf8'),'invalid');
  }finally{await unlink(a);await unlink(b);await rmdir(folder);}
});
test('访问端口来自用户设置或环境变量，拒绝非法端口',()=>{
  const before=process.env.PORT;
  try{delete process.env.PORT;assert.equal(remotePort({}),8789);assert.equal(remotePort({port:8899}),8899);process.env.PORT='8901';assert.equal(remotePort({port:8899}),8901);process.env.PORT='70000';assert.throws(()=>remotePort({}));}
  finally{if(before===undefined)delete process.env.PORT;else process.env.PORT=before;}
});
