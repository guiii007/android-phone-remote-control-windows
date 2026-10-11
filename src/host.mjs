import { pairingToken } from './pairing-token.mjs';
import { WebSocket } from 'ws';
import { createRemoteServer } from './server.mjs';
import { WindowsDesktop, DemoDesktop } from './desktop.mjs';
import { phoneAddresses } from './addresses.mjs';
import { FramePolicy } from './stream-profile.mjs';

const demo = process.argv.includes('--demo');
const frameWidth=Math.max(320,Math.min(1920,Number(process.env.REMOTE_WIDTH)||1440));
const frameQuality=Math.max(20,Math.min(85,Number(process.env.REMOTE_QUALITY)||65));
const frameInterval=Math.max(250,Math.min(2000,1000/(Number(process.env.REMOTE_FPS)||4)));
if (!demo && process.platform !== 'win32') throw new Error('真实电脑端仅支持 Windows。可使用 npm run demo 查看交互。');
const tokenPath = new URL(demo ? '../.demo-token' : '../.pairing-token', import.meta.url);
const token = await pairingToken(tokenPath,demo?undefined:process.env.PAIRING_TOKEN);
let localService = null, stopping = false, socket = null, reconnectTimer = null;
const remote = process.env.RELAY_URL;
if (remote && !remote.startsWith('wss://')) throw new Error('公网中转连接必须使用 wss://');
let url = remote;
if (!remote) {
  const bind = process.env.BIND || '127.0.0.1', port = Number(process.env.PORT || 8787);
  localService = createRemoteServer({ token, demo, deviceFile:demo?undefined:new URL('../.device-access.json',import.meta.url) });
  await new Promise(resolve => localService.server.listen(port, bind, resolve));
  url = `ws://127.0.0.1:${port}/ws`;
  if (bind === '0.0.0.0') {
    for (const address of phoneAddresses(port)) console.log(`手机页面（${address.name}）：${address.url}`);
    console.log(`切换校园网或手机热点后，地址可能变化。双击 ${demo?'show-phone-address.cmd':'show-real-phone-address.cmd'} 查看新地址。`);
  } else console.log(`电脑本机页面：http://${bind}:${port}/`);
  if (!demo) console.log('配对密钥保存在 .pairing-token。请只在你自己的手机中输入。');
}
const desktop = demo ? new DemoDesktop() : new WindowsDesktop();
let viewer = false, capturing = false, lastMouseActivity = 0, generation = 0;
let frameDemand=false, frameReady=true, lastCaptureAt=0, frameRoundTripMs=0;
let lastActivity=0,lastSentMode='dynamic';
const framePolicy=new FramePolicy(frameWidth,frameQuality,{preferQuality:process.env.REMOTE_QUALITY_FIRST==='1'});
const heldButtons = new Set();
const send = data => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
async function release() { heldButtons.clear(); try { await desktop.request({ action: 'release' }); } catch {} }
function connect() {
  const current = new WebSocket(url, { maxPayload: 256 * 1024, perMessageDeflate: false });
  socket = current;
  current.on('open', () => current.send(JSON.stringify({ type: 'auth', role: 'host', token, frameDemand:true })));
  current.on('error', () => console.error('中转连接失败，稍后重连。'));
  current.on('close', () => {
    viewer = false; generation++; void release();
    if (!stopping) reconnectTimer = setTimeout(connect, 3000);
  });
  current.on('message', async data => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.type === 'authenticated') {frameDemand=m.frameDemand===true;console.log(demo ? '演示电脑端已连接。' : 'Windows 电脑端已连接。');}
    if (m.type === 'viewer') { viewer = m.online; frameReady=true;framePolicy.reset();generation++; if (!viewer) void release(); else void captureFrame(); }
    if (m.type === 'frame-ready') {
      frameReady=true;frameRoundTripMs=Math.max(0,Number(m.roundTripMs)||0);
      // 高清补帧较大，不用它的耗时误判动态小帧的链路速度。
      framePolicy.acknowledge(frameRoundTripMs,lastSentMode);
      void captureFrame();return;
    }
    if (m.type === 'release') { await release(); return; }
    if (m.type !== 'command') return;
    const g = generation;
    lastActivity=Date.now();
    if (['move', 'button', 'wheel'].includes(m.action)) lastMouseActivity = Date.now();
    if (m.action === 'button') { if (m.down) heldButtons.add(m.button); else heldButtons.delete(m.button); }
    if (m.action === 'release') heldButtons.clear();
    try {
      await desktop.request(m);
      if (g === generation && m.action !== 'move') send({ type: 'ack', id: m.id, action: m.action, ...(m.action==='button'?{button:m.button,down:m.down}:{}) });
    } catch (e) { if (g === generation) send({ type: 'error', id: m.id, message: e.message }); }
  });
}
connect();
async function captureFrame() {
  const now=Date.now(),active=heldButtons.size>0||now-lastActivity<1200;
  const profile=framePolicy.profile(now,active);
  const interval=profile.mode==='static'?Math.max(frameInterval,750):frameInterval;
  if (!viewer || capturing || (frameDemand&&!frameReady) || now-lastCaptureAt<interval || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 512 * 1024) return;
  capturing = true;frameReady=false;lastCaptureAt=Date.now(); const g = generation, peer = socket;
  try {
    const state = await desktop.request({ action: 'snapshot', maxWidth:profile.width, quality:profile.quality });
    if (g !== generation || peer !== socket || peer.readyState !== WebSocket.OPEN) return;
    const { image, ...meta } = state;
    framePolicy.observe(state,Date.now(),heldButtons.size>0||Date.now()-lastActivity<1200);
    // 静态观察中发现滚动或视频等大幅变化，丢掉尚未发送的高清截图，立即回到小帧。
    if(profile.mode==='static'&&framePolicy.profile(Date.now(),heldButtons.size>0||Date.now()-lastActivity<1200).mode==='dynamic') {
      frameReady=true;lastCaptureAt=0;return;
    }
    const transmit=!!image&&framePolicy.shouldSend(profile,Date.now());
    send({ type: 'state', ...meta, stream:{width:Math.min(profile.width,meta.width),quality:profile.quality,mode:profile.mode,roundTripMs:frameRoundTripMs,idleVerified:!transmit&&!framePolicy.dirty} });
    if (transmit) {
      framePolicy.sent(profile,Date.now());lastSentMode=profile.mode;
      peer.send(Buffer.from(image, 'base64'), { binary: true });
    } else frameReady=true;
  } catch (e) { frameReady=true;send({ type: 'error', message: e.message }); }
  finally { capturing = false; }
}
const timer = setInterval(() => {
  if (heldButtons.size && Date.now() - lastMouseActivity > 5000) void release();
  void captureFrame();
}, Math.min(frameInterval,100));
console.log(demo ? '演示模式：不会操作真实电脑。' : '正在运行：仅主屏幕，关闭此进程即可停止远程控制。');
async function stop() {
  if (stopping) return; stopping = true; clearInterval(timer); clearTimeout(reconnectTimer);
  socket?.close(); await desktop.close(); if (localService) await localService.close(); process.exit();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
// 本机启动面板可请求正常退出，先释放鼠标，再关闭 Windows 工作进程。
process.stdin.setEncoding('utf8');
let localInput='';
process.stdin.on('data',chunk=>{localInput+=chunk;let newline;while((newline=localInput.indexOf('\n'))>=0){const line=localInput.slice(0,newline).trim();localInput=localInput.slice(newline+1);if(line==='stop')void stop();}});
