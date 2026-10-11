import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceAccess} from '../src/device-access.mjs';
import {createRemoteServer} from '../src/server.mjs';
import {WebSocket} from 'ws';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {unlinkSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';

test('设备凭据和四位密码缺一不可，临时连接凭据只可用一次且会过期',()=>{
  const access=new DeviceAccess(),secret=access.register('0428');
  assert.equal(access.unlock('unknown','0428').ok,false);
  assert.equal(access.unlock(secret,'0000').ok,false);
  const unlocked=access.unlock(secret,'0428',100);assert.equal(unlocked.ok,true);
  assert.equal(access.consume(unlocked.ticket,101),true);assert.equal(access.consume(unlocked.ticket,102),false);
  const expired=access.unlock(secret,'0428',100);assert.equal(access.consume(expired.ticket,60101),false);
});

test('连续错误触发等待且重启不能清除；持久化不包含明文密码和设备凭据',()=>{
  const file=join(tmpdir(),'palm-device-test-'+randomBytes(8).toString('hex')+'.json');
  try{
    let access=new DeviceAccess(file),secret=access.register('7926');
    for(let i=0;i<5;i++)access.unlock(secret,'0000',100);
    access=new DeviceAccess(file);assert.equal(access.unlock(secret,'7926',101).ok,false);
    assert.equal(access.unlock(secret,'7926',30101).ok,true);
    const stored=readFileSync(file,'utf8');assert.equal(stored.includes(secret),false);assert.equal(stored.includes('7926'),false);
  }finally{unlinkSync(file);}
});

test('首次必须长密钥授权，Cookie 不可由脚本读取，解锁票据不能充当电脑端身份',async()=>{
  const token='x'.repeat(64),service=createRemoteServer({token});await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${service.server.address().port}`,post=(endpoint,data,cookie,origin=base)=>fetch(base+'/device/'+endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
  try{
    assert.equal((await post('register',{token,pin:'0428'},null,'http://evil.example')).status,403);
    assert.equal((await post('register',{token:'wrong',pin:'0428'})).status,401);
    const registration=await post('register',{token,pin:'0428'}),cookie=registration.headers.get('set-cookie');
    assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
    assert.equal((await (await fetch(base+'/device/status',{headers:{Cookie:cookie.split(';')[0]}})).json()).paired,true);
    const result=await (await post('unlock',{pin:'0428'},cookie.split(';')[0])).json();assert.equal(result.ok,true);
    const ws=new WebSocket(base.replace('http','ws')+'/ws');await new Promise(r=>ws.once('open',r));
    const closed=new Promise(r=>ws.once('close',code=>r(code)));ws.send(JSON.stringify({type:'auth',role:'host',token:result.ticket}));assert.equal(await closed,4001);
    const phone=new WebSocket(base.replace('http','ws')+'/ws');await new Promise(r=>phone.once('open',r));
    const message=new Promise(r=>phone.once('message',data=>r(JSON.parse(data))));phone.send(JSON.stringify({type:'auth',role:'controller',token:result.ticket}));assert.equal((await message).type,'authenticated');phone.close();
  }finally{await service.close();}
});
