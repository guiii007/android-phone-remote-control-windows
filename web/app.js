import { clamp, desktopTransform, screenDeltaToLocal, shouldRotatePage } from './geometry.js';
import { bindMouseButton } from './mouse-input.js';
import { textCells, textOffset, deletionRange } from './text-layout.js';
import { PhoneEnhancer } from './clarity.js';
import { FrameBuffer } from './frame-buffer.js';

const $ = id => document.getElementById(id);
const app=$('app'), stage=$('stage'), canvas=$('desktop'), ctx=canvas.getContext('2d'), editor=$('editor');
let enhancer=null,clarityEnabled=true;
try {clarityEnabled=localStorage.getItem('phone-clarity')!=='off';}catch{}
$('phone-clarity').checked=clarityEnabled;
try{const saved=Number(localStorage.getItem('clarity-strength'));if(saved>=0.3&&saved<=1.5)$('clarity-strength').value=saved;}catch{}
$('clarity-strength').addEventListener('input',()=>{try{localStorage.setItem('clarity-strength',$('clarity-strength').value);}catch{}draw();});
$('phone-clarity').addEventListener('change',()=>{
  clarityEnabled=$('phone-clarity').checked;enhancer?.retry();
  try{localStorage.setItem('phone-clarity',clarityEnabled?'on':'off');}catch{}
  draw();
});
let socket=null, authenticated=false, online=false, desktop={width:1280,height:720,focus:null}, cursor={x:640,y:360};
let resumeToken=null,recoverTimer=null,recoverAttempts=0,explicitDisconnect=false;
let typing=false, transform={scale:1,tx:0,ty:0}, frame=null, decoding=false, move=null, pendingMove=null;
let incomingFrameId=null,incomingPatch=null, lastFrameAt=0;
const frameBuffer=new FrameBuffer();
let leftHeld=false, rightHeld=false, composing=false, counter=0, draftVersion=0, activeSend=null;
let landscapeWanted=false, pageRotated=false, clickTimer=null, clickPoint=null;
let nativeEditing=false, keyboardBase=null, nativeBlurTimer=null, keyboardWasVisible=false;
const pressBindings=[];
const pending=new Map(), session=globalThis.crypto?.randomUUID ? crypto.randomUUID().replaceAll('-','') : Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const status = text => { $('status').textContent=text; };
function hasConnection(){return authenticated&&online&&socket?.readyState===WebSocket.OPEN;}
function command(action, extra={}) {
  if(!hasConnection()){status('电脑未连接，操作未发送');return null;}
  if(socket.bufferedAmount>64*1024){status('网络拥堵，操作未发送，请稍后再试');return null;}
  const id=`${session}_${++counter}`;
  socket.send(JSON.stringify({type:'command',id,action,...extra}));
  if(action!=='move') {
    const timer=setTimeout(()=>{pending.delete(id);if(activeSend?.id===id){activeSend=null;$('send-text').disabled=false;}status('操作确认超时；结果不确定，请查看电脑画面，文字不会自动重发');},10000);
    pending.set(id,{timer,action});
  }
  return id;
}
function position(){return {x:Math.round(cursor.x),y:Math.round(cursor.y)};}
function flushMove(){if(pendingMove){const p=pendingMove;pendingMove=null;command('move',p);}}
setInterval(flushMove,50);
function updateCursor(){
  const x=cursor.x*transform.scale+transform.tx,y=cursor.y*transform.scale+transform.ty;
  $('cursor').style.left=x+'px';$('cursor').style.top=y+'px';
  const size=$('handle').offsetWidth||58;
  $('handle').style.left=clamp(x+30,0,stage.clientWidth-size)+'px';
  $('handle').style.top=clamp(y-14,0,stage.clientHeight-size)+'px';
  if(clickPoint){$('click-marker').style.left=(clickPoint.x*transform.scale+transform.tx-16)+'px';$('click-marker').style.top=(clickPoint.y*transform.scale+transform.ty-16)+'px';}
}
function showClick(button){clickPoint={...cursor};$('click-marker').hidden=false;$('click-marker').style.borderColor=button==='left'?'#7eb0fb':'#ffc980';clearTimeout(clickTimer);clickTimer=setTimeout(()=>{$('click-marker').hidden=true;clickPoint=null;},700);updateCursor();}
function paintDemo(){
  ctx.fillStyle='#1b2b41';ctx.fillRect(0,0,desktop.width,desktop.height);
  ctx.fillStyle='#f5f7fb';ctx.fillRect(250,160,780,400);
  ctx.fillStyle='#dce5f0';ctx.fillRect(250,160,780,46);
  ctx.fillStyle='#23354e';ctx.font='22px system-ui';ctx.fillText('输入体验演示 · 不会操作真实电脑',280,192);
  ctx.font='26px system-ui';ctx.fillText('把箭头移到下面的输入框，再点击左键。',330,290);
  ctx.strokeStyle=desktop.focus?'#3975d2':'#8a9bb2';ctx.lineWidth=3;ctx.strokeRect(330,360,620,58);
  ctx.save();ctx.beginPath();ctx.rect(338,365,600,48);ctx.clip();ctx.font='25px system-ui';
  const scroll=desktop.scrollX||0, start=desktop.selectionStart||0,end=desktop.selectionEnd||0;
  if(end>start){ctx.fillStyle='#a9ceff';ctx.fillRect(344+textOffset(desktop.text,start)-scroll,371,textOffset(desktop.text,end)-textOffset(desktop.text,start),32);}
  ctx.fillStyle='#192c44';for(const cell of textCells(desktop.text||''))ctx.fillText(cell.char==='\n'?'↵':cell.char,344+cell.x-scroll,398);
  if(desktop.focus&&start===end){ctx.fillStyle='#3975d2';ctx.fillRect(344+textOffset(desktop.text,desktop.caret||0)-scroll,372,2,30);}ctx.restore();
  ctx.fillStyle='#516780';ctx.font='20px system-ui';ctx.fillText('左手按住左键不松，右手拖圆柄选择文字。',330,488);
  ctx.font='18px system-ui';ctx.fillText(`左键 ${desktop.leftClicks||0} 次 · 右键 ${desktop.rightClicks||0} 次`,330,530);
  if(desktop.contextMenu){ctx.fillStyle='#fff';ctx.fillRect(desktop.contextMenu.x,desktop.contextMenu.y,210,95);ctx.strokeStyle='#6e819b';ctx.strokeRect(desktop.contextMenu.x,desktop.contextMenu.y,210,95);ctx.fillStyle='#23354e';ctx.font='22px system-ui';ctx.fillText('右键菜单（演示）',desktop.contextMenu.x+14,desktop.contextMenu.y+36);ctx.font='18px system-ui';ctx.fillText('再次点左键关闭',desktop.contextMenu.x+14,desktop.contextMenu.y+72);}
}
function draw(){
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  const ratio=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
  // 始终完整显示并居中；键盘挤压可用空间时只缩小到能完整容纳。
  transform=desktopTransform({width:desktop.width,height:desktop.height,stageWidth:w,stageHeight:h});
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  ctx.translate(transform.tx,transform.ty);ctx.scale(transform.scale,transform.scale);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  if(desktop.demo)paintDemo();else if(frame){
    let source=frame;
    if(clarityEnabled){
      enhancer??=new PhoneEnhancer();
      const previous=enhancer.cached;
      const started=performance.now();
      source=enhancer.render(frame,Math.round(desktop.width*transform.scale*ratio),Math.round(desktop.height*transform.scale*ratio),Number($('clarity-strength').value));
      ctx.drawImage(source,0,0,desktop.width,desktop.height);
      if(previous!==enhancer.cached&&source!==frame)enhancer.recordCost(performance.now()-started);
    }else ctx.drawImage(source,0,0,desktop.width,desktop.height);
    $('clarity-state').textContent=!clarityEnabled?'已关闭':enhancer?.reason||'手机端增强已开启';
  }
  if(typing&&desktop.focus){ctx.strokeStyle='#82b5ff';ctx.lineWidth=2/transform.scale;ctx.strokeRect(desktop.focus.x,desktop.focus.y,desktop.focus.width,desktop.focus.height);}
  updateCursor();
}
function fitViewport(){
  const vp=window.visualViewport;
  const w=vp?.width||innerWidth,h=vp?.height||innerHeight;
  const keyboardVisible=keyboardBase&&Math.abs(w-keyboardBase.width)<40&&h<keyboardBase.height-80;
  // Android 的返回键可能只收起键盘而不触发 blur；同样恢复完整画面。
  if(keyboardWasVisible&&!keyboardVisible){keyboardWasVisible=false;setTyping(false);}
  keyboardWasVisible=!!keyboardVisible;
  pageRotated=shouldRotatePage({wanted:landscapeWanted,width:w,height:h,nativeEditing:nativeEditing||!!keyboardVisible});
  if(!nativeEditing&&!keyboardVisible)keyboardBase=null;
  app.classList.toggle('page-rotated',pageRotated);
  app.classList.toggle('lock-landscape',(pageRotated?h:w)>(pageRotated?w:h));
  app.style.setProperty('--pin-size',Math.max(32,Math.min(52,((pageRotated?w:h)-100)/4))+'px');
  app.style.height=(pageRotated?w:h)+'px';app.style.width=(pageRotated?h:w)+'px';
  app.style.transform=pageRotated?`translateX(${w}px) rotate(90deg)`:'none';
  app.style.top=(vp?.offsetTop||0)+'px';app.style.left=(vp?.offsetLeft||0)+'px';
  requestAnimationFrame(draw);
}
window.visualViewport?.addEventListener('resize',fitViewport);window.visualViewport?.addEventListener('scroll',fitViewport);
window.addEventListener('resize',fitViewport);new ResizeObserver(draw).observe(stage);
function setTyping(value, openKeyboard=false){
  if(!value){nativeEditing=false;keyboardWasVisible=false;clearTimeout(nativeBlurTimer);}
  typing=value;app.classList.toggle('typing',value);$('editor-panel').hidden=!value;
  if(!value)editor.blur();else if(openKeyboard)editor.focus({preventScroll:true});
  $('typing-toggle').textContent=value?'正在打字':'打字';requestAnimationFrame(fitViewport);
}
function resetConnection(){
  incomingFrameId=null;incomingPatch=null;frameBuffer.reset();lastFrameAt=0;$('frame-warning').hidden=true;
  for(const binding of pressBindings)binding.cancel();
  authenticated=false;online=false;leftHeld=false;rightHeld=false;pendingMove=null;move=null;
  $('left').setAttribute('aria-pressed','false');$('right').setAttribute('aria-pressed','false');
  for(const p of pending.values())clearTimeout(p.timer);pending.clear();
  if(activeSend){status('连接中断，文字是否输入成功不确定；草稿已保留，请检查电脑后再发送');activeSend=null;}
  $('send-text').disabled=false;$('connection').textContent='已断开';
}
function connectComputer(token,recovering=false){
  if(!recovering){clearTimeout(recoverTimer);recoverAttempts=0;explicitDisconnect=false;resumeToken=null;}
  $('pairing-error').textContent='正在连接…';
  socket?.close();resetConnection();
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket=ws;ws.binaryType='blob';
  ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'auth',role:'controller',token,frameFlowControl:true})));
  ws.addEventListener('error',()=>{$('pairing-error').textContent='连接失败，请检查网络和中转服务';});
  ws.addEventListener('close',e=>{
    if(socket!==ws)return;resetConnection();$('pairing').hidden=false;
    if(!explicitDisconnect&&resumeToken&&![4001,4003,4004].includes(e.code)&&recoverAttempts<5){
      const delay=Math.min(8000,1000*2**recoverAttempts++);$('pairing').hidden=true;status(`连接中断，正在自动恢复（${recoverAttempts}/5）…`);
      recoverTimer=setTimeout(()=>connectComputer(resumeToken,true),delay);return;
    }
    resumeToken=null;
    $('pairing-error').textContent=e.code===4001?'连接授权已失效，请重新解锁':e.code===4003?'已有另一台手机连接，请先断开它':`连接已断开（${e.code}），重新连接不会自动重发操作`;
  });
  ws.addEventListener('message',async e=>{
    if(socket!==ws)return;
    if(e.data instanceof Blob){
      if(decoding===ws)return;decoding=ws;
      const frameId=incomingFrameId,patch=incomingPatch;let displayed=false,image=null;
      try{
        image=await createImageBitmap(e.data);if(socket!==ws)return;
        const next=frameBuffer.apply(image,patch);frame?.close?.();frame=next;
        if(next!==image){image.close();image=null;}
        if(enhancer)enhancer.cached=null;
        lastFrameAt=Date.now();$('frame-warning').hidden=true;draw();displayed=true;
      }catch{status('画面解码失败，正在重新同步');if(socket===ws)ws.close();}
      finally{if(image&&frame!==image)image.close();if(decoding===ws)decoding=false;if(displayed&&socket===ws&&ws.readyState===WebSocket.OPEN&&frameId!==null)ws.send(JSON.stringify({type:'frame-received',id:frameId}));}
      return;
    }
    let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.type==='frame'){incomingFrameId=m.id;incomingPatch=m.patch||null;}
    if(m.type==='authenticated'){authenticated=true;resumeToken=m.resumeToken||null;recoverAttempts=0;$('pairing').hidden=true;$('token').value='';status('已配对，等待电脑画面');}
    if(m.type==='presence'){online=m.online;$('connection').textContent=online?'电脑在线':'电脑离线';if(!online)status('电脑已离线，操作已停止');}
    if(m.type==='state'){
      desktop=m;
      if(m.stream){
        $('stream-info').textContent=`${m.stream.mode==='static'?'静态清晰':'动态流畅'} · ${m.stream.width}px · 画面往返 ${m.stream.roundTripMs? (m.stream.roundTripMs/1000).toFixed(1)+' 秒':'测量中'}`;
        if(m.stream.idleVerified){lastFrameAt=Date.now();$('frame-warning').hidden=true;}
      }
      $('connection').textContent=m.demo?'演示电脑':'Windows 在线';
      app.querySelector('header strong').textContent=m.demo?'掌上遥控 · 演示':'掌上遥控 · 实机';
      cursor.x=clamp(cursor.x,0,m.width-1);cursor.y=clamp(cursor.y,0,m.height-1);
      if(m.focus?.password){if(typing)setTyping(false);status('密码框：请在电脑上输入，原型不支持密码输入');}
      if($('status').textContent==='已配对，等待电脑画面')status('右手拖圆柄，左手点击；需要输入时点“打字”');
      draw();
    }
    if(m.type==='ack'||m.type==='error'){
      const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);}
      if(activeSend?.id===m.id){
        if(m.type==='ack'&&draftVersion===activeSend.version){editor.value='';draftVersion++;}
        activeSend=null;$('send-text').disabled=false;
      }
      if(m.type==='error')status(m.message||'电脑操作失败');
      else if(m.action==='text')status(desktop.demo?'文字已输入演示电脑':'文字已交给 Windows；请以电脑画面中的结果为准');
      else if(m.action==='key')status('按键已交给 Windows');
      else if(m.action==='wheel')status('鼠标滚轮已执行');
      else if(m.action==='button'&&!m.down)status(`${m.button==='left'?'左键':'右键'}已执行${desktop.demo?'（演示）':''}`);
    }
  });
}
let unlockPin='',unlockBusy=false;
function showLock(paired){$('first-pairing').hidden=paired;$('pin-lock').hidden=!paired;unlockPin='';updatePinDots();}
function updatePinDots(){[...$('pin-dots').children].forEach((dot,i)=>dot.classList.toggle('filled',i<unlockPin.length));$('pin-dots').setAttribute('aria-label',`已输入 ${unlockPin.length} 位密码`);}
async function deviceRequest(endpoint,data){
  const response=await fetch('/device/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!result.ok){if(result.unpaired)showLock(false);throw Error(result.error||'连接失败');}return result;
}
async function unlockComputer(pin){
  if(unlockBusy)return;unlockBusy=true;$('pairing-error').textContent='正在解锁…';
  try{const result=await deviceRequest('unlock',{pin});connectComputer(result.ticket);}
  catch(error){$('pairing-error').textContent=error.message;}
  finally{unlockBusy=false;unlockPin='';updatePinDots();}
}
$('pairing-form').addEventListener('submit',async e=>{
  e.preventDefault();if(unlockBusy)return;
  const pin=$('new-pin').value;
  if(!/^\d{4}$/.test(pin)||pin!==$('confirm-pin').value){$('pairing-error').textContent='请输入两次相同的四位数字密码';return;}
  unlockBusy=true;$('pairing-error').textContent='正在配对…';
  try{await deviceRequest('register',{token:$('token').value.trim(),pin});$('token').value='';$('new-pin').value='';$('confirm-pin').value='';showLock(true);unlockBusy=false;await unlockComputer(pin);}
  catch(error){$('pairing-error').textContent=error.message;}
  finally{unlockBusy=false;}
});
function enterDigit(digit){if(unlockBusy||unlockPin.length>=4)return;unlockPin+=digit;updatePinDots();if(unlockPin.length===4)void unlockComputer(unlockPin);}
$('pin-pad').addEventListener('click',e=>{const digit=e.target.closest('[data-digit]')?.dataset.digit;if(digit!==undefined)enterDigit(digit);});
$('pin-delete').addEventListener('click',()=>{if(!unlockBusy){unlockPin=unlockPin.slice(0,-1);updatePinDots();}});
$('pair-again').addEventListener('click',()=>{if(!unlockBusy){showLock(false);$('pairing-error').textContent='用电脑长密钥重新配对，可以设置新密码。';}});
document.addEventListener('keydown',e=>{if($('pairing').hidden||$('pin-lock').hidden)return;if(/^\d$/.test(e.key)){e.preventDefault();enterDigit(e.key);}else if(e.key==='Backspace'){e.preventDefault();$('pin-delete').click();}});
fetch('/device/status').then(r=>r.json()).then(data=>showLock(data.paired)).catch(()=>{showLock(false);$('pairing-error').textContent='无法检查配对，请确认电脑已启动';});
$('disconnect').addEventListener('click',()=>{explicitDisconnect=true;clearTimeout(recoverTimer);resumeToken=null;command('release');if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'lock'}));socket?.close();});
$('typing-toggle').addEventListener('click',()=>{status('使用手机键盘输入，电脑画面保持完整');setTyping(true,true);});
function exitTyping(){setTyping(false);status('已显示完整电脑画面；横屏请点“横屏全屏”');}
$('overview').addEventListener('click',exitTyping);$('close-editor').addEventListener('click',exitTyping);
$('landscape').addEventListener('click',async()=>{
  landscapeWanted=!landscapeWanted;
  $('landscape').setAttribute('aria-pressed',String(landscapeWanted));$('landscape').textContent=landscapeWanted?'退出横屏':'横屏全屏';
  if(!landscapeWanted){screen.orientation?.unlock?.();if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}fitViewport();return;}
  exitTyping();fitViewport();
  try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen();}catch{}
  try{await screen.orientation?.lock?.('landscape');}catch{}
  fitViewport();status(pageRotated?'已启用页面横屏，请把手机横过来；系统键盘方向仍由手机浏览器控制':'已切换横屏视图');
});
document.addEventListener('fullscreenchange',fitViewport);
$('settings-toggle').addEventListener('click',()=>{const b=$('settings-toggle');$('settings').hidden=!$('settings').hidden;b.setAttribute('aria-expanded',String(!$('settings').hidden));});
const opacitySlider=$('controls-opacity');
function applyControlsOpacity(value){
  const number=Number(value);
  const opacity=Number.isFinite(number)?clamp(number,0.25,1):1;
  app.style.setProperty('--controls-opacity',String(opacity));
  opacitySlider.value=String(opacity);$('opacity-value').textContent=Math.round(opacity*100)+'%';
}
try{applyControlsOpacity(localStorage.getItem('controls-opacity')??1);}catch{applyControlsOpacity(1);}
opacitySlider.addEventListener('input',()=>{
  applyControlsOpacity(opacitySlider.value);
  try{localStorage.setItem('controls-opacity',opacitySlider.value);}catch{}
});
editor.addEventListener('compositionstart',()=>{composing=true;});editor.addEventListener('compositionend',()=>{composing=false;});editor.addEventListener('input',()=>{draftVersion++;});
editor.addEventListener('focus',()=>{clearTimeout(nativeBlurTimer);if(!keyboardBase)keyboardBase={width:window.visualViewport?.width||innerWidth,height:window.visualViewport?.height||innerHeight};nativeEditing=true;fitViewport();if(landscapeWanted&&(window.visualViewport?.height||innerHeight)>(window.visualViewport?.width||innerWidth))status('输入时使用竖屏键盘，收起后恢复横屏完整画面');});
// 先让导致 blur 的按钮完成点击，再调整页面方向，避免按钮在手指抬起前移走。
editor.addEventListener('blur',()=>{clearTimeout(nativeBlurTimer);nativeBlurTimer=setTimeout(()=>{nativeEditing=false;setTyping(false);fitViewport();},250);});
$('send-text').addEventListener('click',()=>{
  if(composing){status('请先完成手机输入法选词');return;}
  if(!editor.value){status('先在手机输入栏写好文字');return;}
  if(desktop.focus?.password){status('原型不支持密码框');return;}
  flushMove();const text=editor.value;const id=command('text',{text,focusId:desktop.focus?.id||null});
  if(id){activeSend={id,version:draftVersion};$('send-text').disabled=true;status('正在输入电脑…');}
});
$('enter-key').addEventListener('click',()=>command('key',{key:'Enter'}));
$('newline-key').addEventListener('click',()=>command('key',{key:'ShiftEnter'}));
function deleteDraft(){
  const {start,end}=deletionRange(editor.value,editor.selectionStart,editor.selectionEnd);
  editor.setRangeText('',start,end,'end');draftVersion++;
}
// 保留编辑栏焦点：输入、删除、换行和发送都能连续操作，只有“收起键盘”退出。
for(const id of ['send-text','delete-key','newline-key','enter-key']){
  for(const event of ['pointerdown','mousedown'])$(id).addEventListener(event,e=>e.preventDefault());
}
$('delete-key').addEventListener('click',()=>{
  if(composing){status('请先完成手机输入法选词，再删除');return;}
  if(activeSend){status('正在输入电脑，请等待确认后再删除');return;}
  if(editor.value){deleteDraft();status('已删除手机草稿中的文字');}
  else {flushMove();command('key',{key:'Backspace'});}
});
function shift(dx,dy){
  ({dx,dy}=screenDeltaToLocal(dx,dy,pageRotated));
  const speed=Number($('speed').value);
  cursor.x=clamp(cursor.x+dx*speed/transform.scale,0,desktop.width-1);cursor.y=clamp(cursor.y+dy*speed/transform.scale,0,desktop.height-1);
  pendingMove=position();updateCursor();
}
$('handle').addEventListener('pointerdown',e=>{e.preventDefault();if(move||!hasConnection())return;move={id:e.pointerId,x:e.clientX,y:e.clientY};$('handle').setPointerCapture(e.pointerId);});
$('handle').addEventListener('pointermove',e=>{if(move?.id!==e.pointerId)return;e.preventDefault();shift(e.clientX-move.x,e.clientY-move.y);move.x=e.clientX;move.y=e.clientY;});
const endMove=e=>{if(move?.id!==e.pointerId)return;flushMove();move=null;};
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('handle').addEventListener(event,endMove);
$('handle').addEventListener('keydown',e=>{const d={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[e.key];if(d){e.preventDefault();shift(...d);flushMove();}});
for(const key of ['left','right']){
  const b=$(key);
  const down=()=>{flushMove();const sent=command('button',{button:key,down:true,...position()});if(!sent)return false; if(key==='left')leftHeld=true;else rightHeld=true;showClick(key);status(key==='left'?'左键按下，等待电脑确认':'右键按下，等待电脑确认');return true;};
  const up=()=>{flushMove();if(key==='left'&&leftHeld||key==='right'&&rightHeld)command('button',{button:key,down:false,...position()});if(key==='left')leftHeld=false;else rightHeld=false;b.setAttribute('aria-pressed','false');};
  pressBindings.push(bindMouseButton(b,{down,up}));
}
// 半格滚轮，方向与电脑鼠标一致；定位到箭头所在窗口后滚动。
$('wheel-up').addEventListener('click',()=>{flushMove();command('wheel',{delta:60,...position()});});
$('wheel-down').addEventListener('click',()=>{flushMove();command('wheel',{delta:-60,...position()});});
stage.addEventListener('contextmenu',e=>e.preventDefault());
function releaseAll(){pendingMove=null;for(const binding of pressBindings)binding.cancel();command('release');leftHeld=false;rightHeld=false;move=null;$('left').setAttribute('aria-pressed','false');$('right').setAttribute('aria-pressed','false');}
window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});window.addEventListener('pagehide',()=>{explicitDisconnect=true;clearTimeout(recoverTimer);resumeToken=null;releaseAll();socket?.close();});
fitViewport();
setInterval(()=>{
  if(authenticated&&online&&!desktop.demo&&lastFrameAt&&Date.now()-lastFrameAt>6000){
    $('frame-warning').textContent='画面已超过 6 秒未更新，请等待网络恢复或刷新连接';$('frame-warning').hidden=false;
  }
},1000);
// 演示服务才提供此入口；真实页面不公开电脑长密钥。
fetch('/demo-auth').then(async response=>{
  if(!response.ok)return;
  const data=await response.json();connectComputer(data.token);
}).catch(()=>{});
