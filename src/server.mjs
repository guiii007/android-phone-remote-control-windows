import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { sameToken, validCommand } from './protocol.mjs';
import { DeviceAccess } from './device-access.mjs';
import {randomBytes} from 'node:crypto';

const publicRoot = new URL('../web/', import.meta.url);
// 前端与虚拟电脑共享字符坐标，保证鼠标拖选和高亮对齐。
const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'mouse-input.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8', 'geometry.js': 'text/javascript; charset=utf-8' };
types['text-layout.js']='text/javascript; charset=utf-8';
types['clarity.js']='text/javascript; charset=utf-8';
export function createRemoteServer({ token, demo = false, deviceFile }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('配对密钥至少需要 32 个字符');
  let host = null, controller = null, latestState = null;
  const devices=new DeviceAccess(deviceFile);
  const cookie=req=>req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('palm-device='))?.slice(12);
  const authAttempts=new Map();
  const resumes=new Map();let controllerResume=null;
  let frameFlowControl=false, frameInFlight=null, frameSequence=0;
  let frameSentAt=0, hostFrameDemand=false;
  const seen = new Set();
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/device/')){
      const reply=(code,data,extra={})=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));};
      if(req.method==='GET'&&url.pathname==='/device/status'){reply(200,{paired:!!devices.find(cookie(req))});return;}
      if(req.method!=='POST'||!['/device/register','/device/unlock'].includes(url.pathname)){reply(404,{});return;}
      try{
        if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host||!req.headers['content-type']?.startsWith('application/json')){reply(403,{error:'请求来源不正确'});return;}
        const peer=req.socket.remoteAddress,now=Date.now(),attempt=authAttempts.get(peer)||{count:0,start:now};
        if(now-attempt.start>60000){attempt.count=0;attempt.start=now;}
        authAttempts.set(peer,attempt);if(++attempt.count>12){reply(429,{error:'操作太频繁，请稍后再试'});return;}
        let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('请求过长');}
        const data=JSON.parse(body);
        if(url.pathname==='/device/register'){
          if(!sameToken(data.token,token)){reply(401,{error:'配对密钥不正确'});return;}
          const secret=devices.register(String(data.pin||''));
          reply(200,{ok:true},{'Set-Cookie':`palm-device=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`});return;
        }
        const result=devices.unlock(cookie(req),String(data.pin||''));reply(result.ok?200:401,result);return;
      }catch{reply(400,{error:'无法完成，请检查输入后重试'});return;}
    }
    if(req.method==='GET'&&url.pathname==='/health') {
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({service:'palm-remote',hostOnline:!!host,phoneOnline:!!controller}));return;
    }
    if (demo && req.method === 'GET' && url.pathname === '/demo-auth') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ token })); return;
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (req.method !== 'GET' || !Object.hasOwn(types, name)) { res.writeHead(404).end(); return; }
    try {
      res.writeHead(200, { 'Content-Type': types[name], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(await readFile(new URL(name, publicRoot)));
    } catch { res.writeHead(500).end(); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let originOkay = true;
    try { if (req.headers.origin) originOkay = new URL(req.headers.origin).host === req.headers.host; } catch { originOkay = false; }
    if (req.url !== '/ws' || !originOkay) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    let role = null, count = 0, windowStart = Date.now(),resumeKey=null;
    ws.alive = true;
    ws.lastPong=Date.now();
    ws.on('pong', () => { ws.alive = true;ws.lastPong=Date.now();if(resumeKey&&resumes.has(resumeKey))resumes.set(resumeKey,Date.now()+300000); });
    ws.on('error', () => {});
    const authTimer = setTimeout(() => ws.close(4001, 'Authentication required'), 5000);
    ws.on('message', (data, binary) => {
      if (binary) {
        if (role !== 'host') { ws.close(4002, 'Invalid data'); return; }
        if (controller?.readyState === WebSocket.OPEN && controller.bufferedAmount < 64 * 1024 && (!frameFlowControl||frameInFlight===null)) {
          if(frameFlowControl){frameInFlight=++frameSequence;frameSentAt=Date.now();send(controller,{type:'frame',id:frameInFlight});}
          controller.send(data, { binary: true });
          if(!frameFlowControl&&hostFrameDemand)send(host,{type:'frame-ready',roundTripMs:0});
        } else if(controller?.readyState===WebSocket.OPEN&&frameInFlight===null&&hostFrameDemand) {
          // 元数据或操作回执短暂占满发送缓冲时，降档重抓，不能永久耗尽抓屏额度。
          send(host,{type:'frame-ready',roundTripMs:2500});
        }
        return;
      }
      let m;
      try { m = JSON.parse(data.toString()); } catch { ws.close(4002, 'Invalid JSON'); return; }
      if (!role) {
        for(const [key,expiry] of resumes)if(expiry<Date.now())resumes.delete(key);
        const resuming=m.role==='controller'&&typeof m.token==='string'&&resumes.get(m.token)>Date.now();
        if (m.type !== 'auth' || !['host', 'controller'].includes(m.role) || !(sameToken(m.token,token)||(m.role==='controller'&&devices.consume(m.token))||resuming)) { ws.close(4001, 'Invalid authentication'); return; }
        if(resuming&&controller&&controllerResume===m.token){const old=controller;controller=null;old.terminate();send(host,{type:'release'});}
        if ((m.role === 'host' && host) || (m.role === 'controller' && controller)) { ws.close(4003, 'Device already connected'); return; }
        role = m.role; clearTimeout(authTimer);
        if(role==='controller'){resumeKey=resuming?m.token:randomBytes(32).toString('hex');resumes.set(resumeKey,Date.now()+300000);controllerResume=resumeKey;}
        send(ws, { type: 'authenticated', role, ...(role==='host'?{frameDemand:m.frameDemand===true}:{resumeToken:resumeKey}) });
        if (role === 'host') { host = ws; hostFrameDemand=m.frameDemand===true;frameInFlight=null;latestState = null; send(controller, { type: 'presence', online: true }); send(host, { type: 'viewer', online: !!controller }); }
        else { controller = ws; frameFlowControl=m.frameFlowControl===true;frameInFlight=null;seen.clear(); send(ws, { type: 'presence', online: !!host }); if (latestState) send(ws, latestState); send(host, { type: 'viewer', online: true }); }
        return;
      }
      if (role === 'host') {
        if (m.type === 'state') { latestState = m; send(controller, m); }
        else if (['ack', 'error'].includes(m.type)) send(controller, m);
        return;
      }
      if (Date.now() - windowStart > 1000) { count = 0; windowStart = Date.now(); }
      if (++count > 100) { ws.close(4004, 'Too many commands'); return; }
      if(m.type==='lock'){resumes.delete(resumeKey);return;}
      // 手机显示完成后才允许下一帧；慢网络不积压历史画面，指令仍独立转发。
      if(m.type==='frame-received'){
        if(frameFlowControl&&frameInFlight!==null&&m.id===frameInFlight){
          const roundTripMs=Date.now()-frameSentAt;frameInFlight=null;
          if(hostFrameDemand)send(host,{type:'frame-ready',roundTripMs});
        }
        return;
      }
      if (m.type !== 'command' || !validCommand(m)) { send(ws, { type: 'error', id: m.id, message: '无效操作' }); return; }
      if (!host) { send(ws, { type: 'error', id: m.id, message: '电脑未连接，操作未执行' }); return; }
      if (seen.has(m.id)) { send(ws, { type: 'error', id: m.id, message: '重复操作已拦截' }); return; }
      seen.add(m.id); if (seen.size > 2048) seen.delete(seen.values().next().value);
      send(host, m);
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (host === ws) { host = null; hostFrameDemand=false;latestState = null; send(controller, { type: 'presence', online: false }); }
      if (controller === ws) { controller = null;controllerResume=null;frameInFlight=null;frameFlowControl=false; seen.clear(); send(host, { type: 'release' }); send(host, { type: 'viewer', online: false }); }
    });
  });
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (Date.now()-ws.lastPong>45000)ws.terminate();else ws.ping(); } }, 10000);
  heartbeat.unref();
  async function close() { clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); }
  return { server, wss, close };
}
