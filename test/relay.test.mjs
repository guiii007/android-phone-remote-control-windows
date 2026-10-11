import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRemoteServer } from '../src/server.mjs';
import { sameToken, validCommand } from '../src/protocol.mjs';

const token='test-only-secret-'.repeat(4);
function inbox(ws){
  const buffered=[],waiters=[];
  ws.on('message',(raw,binary)=>{const m=binary?{binary:true,raw}:JSON.parse(raw.toString());const idx=waiters.findIndex(w=>w.filter(m));if(idx<0)buffered.push(m);else{const w=waiters.splice(idx,1)[0];clearTimeout(w.timer);w.resolve(m);}});
  return filter=>new Promise((resolve,reject)=>{const idx=buffered.findIndex(filter);if(idx>=0){resolve(buffered.splice(idx,1)[0]);return;}const entry={filter,resolve,timer:null};entry.timer=setTimeout(()=>{const i=waiters.indexOf(entry);if(i>=0)waiters.splice(i,1);reject(new Error('等待消息超时'));},2000);waiters.push(entry);});
}
async function open(url,role,secret=token,frameFlowControl=false,frameDemand=false){const ws=new WebSocket(url);const next=inbox(ws);await once(ws,'open');ws.send(JSON.stringify({type:'auth',role,token:secret,frameFlowControl,frameDemand}));return {ws,next};}
async function fixture(t){const service=createRemoteServer({token});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');t.after(()=>service.close());const port=service.server.address().port;return {url:`ws://127.0.0.1:${port}/ws`,http:`http://127.0.0.1:${port}`};}
test('命令白名单拦截非法坐标、按键和超长文字',()=>{
  assert.ok(sameToken(token,token));assert.equal(sameToken('x',token),false);
  assert.equal(validCommand({id:'1',action:'move',x:NaN,y:1}),false);
  assert.equal(validCommand({id:'2',action:'key',key:'run arbitrary program'}),false);
  assert.ok(validCommand({id:'newline',action:'key',key:'ShiftEnter'}));
  assert.equal(validCommand({id:'3',action:'text',text:'x'.repeat(4001),focusId:null}),false);
  assert.ok(validCommand({id:'4',action:'text',text:'中文😀',focusId:'input'}));
});

test('短断线用内存会话恢复，仅同一会话可替换旧连接，主动锁定后凭据失效',async t=>{
  const {url}=await fixture(t);
  const one=await open(url,'controller');const auth=await one.next(m=>m.type==='authenticated');assert.ok(auth.resumeToken);
  const intruder=await open(url,'controller');assert.equal((await once(intruder.ws,'close'))[0],4003);
  const oldClosed=once(one.ws,'close');
  const recovered=await open(url,'controller',auth.resumeToken);assert.equal((await recovered.next(m=>m.type==='authenticated')).resumeToken,auth.resumeToken);await oldClosed;
  recovered.ws.send(JSON.stringify({type:'lock'}));recovered.ws.close();await once(recovered.ws,'close');
  const denied=await open(url,'controller',auth.resumeToken);assert.equal((await once(denied.ws,'close'))[0],4001);
});

test('启动面板能识别服务及电脑在线状态，健康检查不返回配对密钥',async t=>{
  const {url,http}=await fixture(t);
  const health=await(await fetch(http+'/health')).json();
  assert.deepEqual(health,{service:'palm-remote',hostOnline:false,phoneOnline:false});
  const host=await open(url,'host');await host.next(m=>m.type==='authenticated');
  assert.equal((await(await fetch(http+'/health')).json()).hostOnline,true);
});
test('无密钥不能连接，另一台手机不能抢占当前会话',async t=>{
  const {url}=await fixture(t);
  const bad=await open(url,'controller','wrong');assert.equal((await once(bad.ws,'close'))[0],4001);
  const one=await open(url,'controller');await one.next(m=>m.type==='authenticated');
  const two=await open(url,'controller');assert.equal((await once(two.ws,'close'))[0],4003);
});
test('转发画面和指令，保序、拦截重复文字，并在断开时松开鼠标',async t=>{
  const {url,http}=await fixture(t);
  const host=await open(url,'host');await host.next(m=>m.type==='authenticated');
  const phone=await open(url,'controller');await phone.next(m=>m.type==='authenticated');
  host.ws.send(JSON.stringify({type:'state',width:1920,height:1080,focus:{id:'test-input',x:1,y:2,width:200,height:30}}));
  assert.equal((await phone.next(m=>m.type==='state')).focus.id,'test-input');
  host.ws.send(Buffer.from([255,216,255]),{binary:true});assert.equal((await phone.next(m=>m.binary)).raw[0],255);
  for(const command of [{id:'move',action:'move',x:30,y:40},{id:'down',action:'button',x:30,y:40,button:'left',down:true},{id:'text',action:'text',text:'你好😀',focusId:'test-input'}])phone.ws.send(JSON.stringify({type:'command',...command}));
  for(const id of ['move','down','text'])assert.equal((await host.next(m=>m.type==='command')).id,id);
  phone.ws.send(JSON.stringify({type:'command',id:'text',action:'text',text:'重复',focusId:null}));
  assert.match((await phone.next(m=>m.type==='error')).message,/重复/);
  phone.ws.close();await host.next(m=>m.type==='release');
  const page=await fetch(http);assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await fetch(http+'/not-a-file')).status,404);
});
test('电脑离线时，拒绝操作而不缓存待重连的文字',async t=>{
  const {url}=await fixture(t);const phone=await open(url,'controller');await phone.next(m=>m.type==='authenticated');
  phone.ws.send(JSON.stringify({type:'command',id:'offline',action:'text',text:'不能误发送',focusId:null}));
  assert.match((await phone.next(m=>m.type==='error')).message,/未连接/);
});

test('慢网络最多一帧在途，错误确认不解锁，鼠标指令不被画面确认阻塞',async t=>{
  const {url}=await fixture(t);
  const host=await open(url,'host');await host.next(m=>m.type==='authenticated');
  const phone=await open(url,'controller',token,true);await phone.next(m=>m.type==='authenticated');
  host.ws.send(Buffer.from([1]),{binary:true});
  const frame=await phone.next(m=>m.type==='frame');assert.equal((await phone.next(m=>m.binary)).raw[0],1);
  host.ws.send(Buffer.from([2]),{binary:true});
  phone.ws.send(JSON.stringify({type:'frame-received',id:frame.id+99}));
  phone.ws.send(JSON.stringify({type:'command',id:'while-frame-pending',action:'move',x:40,y:50}));
  assert.equal((await host.next(m=>m.type==='command')).id,'while-frame-pending');
  host.ws.send(Buffer.from([3]),{binary:true});
  host.ws.send(JSON.stringify({type:'state',width:1920,height:1080,marker:'barrier'}));
  await phone.next(m=>m.marker==='barrier');
  phone.ws.send(JSON.stringify({type:'frame-received',id:frame.id}));
  phone.ws.send(JSON.stringify({type:'command',id:'credit-barrier',action:'move',x:41,y:51}));
  await host.next(m=>m.id==='credit-barrier');
  host.ws.send(Buffer.from([4]),{binary:true});
  assert.ok((await phone.next(m=>m.type==='frame')).id>frame.id);
  assert.equal((await phone.next(m=>m.binary)).raw[0],4);
});

test('仅在手机确认当前帧后通知电脑抓下一帧，错误和重复回执不触发抓屏',async t=>{
  const {url}=await fixture(t);
  const host=await open(url,'host',token,false,true);
  assert.equal((await host.next(m=>m.type==='authenticated')).frameDemand,true);
  const phone=await open(url,'controller',token,true);await phone.next(m=>m.type==='authenticated');
  const credits=[];host.ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.type==='frame-ready')credits.push(m);});
  const patch={x:20,y:30,width:10,height:5,screenWidth:100,screenHeight:60};
  host.ws.send(JSON.stringify({type:'state',width:100,height:60,patch}));
  host.ws.send(Buffer.from([1]),{binary:true});const frame=await phone.next(m=>m.type==='frame');assert.deepEqual(frame.patch,patch);await phone.next(m=>m.binary);
  phone.ws.send(JSON.stringify({type:'frame-received',id:frame.id+1}));
  phone.ws.send(JSON.stringify({type:'command',id:'wrong-credit-barrier',action:'move',x:1,y:1}));await host.next(m=>m.id==='wrong-credit-barrier');
  assert.equal(credits.length,0);
  phone.ws.send(JSON.stringify({type:'frame-received',id:frame.id}));const credit=await host.next(m=>m.type==='frame-ready');assert.ok(credit.roundTripMs>=0);
  phone.ws.send(JSON.stringify({type:'frame-received',id:frame.id}));
  phone.ws.send(JSON.stringify({type:'command',id:'repeat-credit-barrier',action:'move',x:2,y:2}));await host.next(m=>m.id==='repeat-credit-barrier');
  assert.equal(credits.length,1);
});
