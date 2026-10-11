import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMouseButton } from '../web/mouse-input.js';
import { screenDeltaToLocal } from '../web/geometry.js';
import { DemoDesktop } from '../src/desktop.mjs';

function button(){const listeners=new Map();return {attr:{},addEventListener(n,f){listeners.set(n,f);},setAttribute(k,v){this.attr[k]=v;},setPointerCapture(){},emit(n,e={}){listeners.get(n)?.({preventDefault(){},...e});}};}
test('独立的左右键触点支持同时按住，抬起一个不影响另一个',()=>{
  const a=button(),b=button(),events=[];
  bindMouseButton(a,{down:()=>events.push('Ldown'),up:()=>events.push('Lup')});bindMouseButton(b,{down:()=>events.push('Rdown'),up:()=>events.push('Rup')});
  a.emit('pointerdown',{pointerId:1});b.emit('pointerdown',{pointerId:2});a.emit('pointerup',{pointerId:2});
  assert.equal(a.attr['aria-pressed'],'true');a.emit('pointerup',{pointerId:1});assert.equal(b.attr['aria-pressed'],'true');b.emit('pointercancel',{pointerId:2});
  assert.deepEqual(events,['Ldown','Rdown','Lup','Rup']);
});
test('普通触摸不被合成 click 再发一遍，失去焦点后仍能重新按',()=>{
  const b=button(),events=[];let time=1000;
  const binding=bindMouseButton(b,{down:()=>events.push('down'),up:()=>events.push('up'),now:()=>time});
  b.emit('pointerdown',{pointerId:1});b.emit('pointerup',{pointerId:1});b.emit('click');assert.deepEqual(events,['down','up']);
  time+=1000;b.emit('pointerdown',{pointerId:2});binding.cancel();b.emit('pointerdown',{pointerId:3});b.emit('pointerup',{pointerId:3});assert.equal(events.length,6);
});
test('仅派发 touch 或 click 的内置浏览器仍能点击',()=>{
  for(const kind of ['touch','click']){
    const b=button(),events=[];bindMouseButton(b,{down:()=>events.push('down'),up:()=>events.push('up')});
    if(kind==='touch'){b.emit('touchstart',{changedTouches:[{identifier:9}]});b.emit('touchend',{changedTouches:[{identifier:9}]});}else b.emit('click');
    assert.deepEqual(events,['down','up']);
  }
});
test('页面旋转后，手指方向映射正确',()=>{
  assert.deepEqual(screenDeltaToLocal(0,12,true),{dx:12,dy:-0});assert.deepEqual(screenDeltaToLocal(12,0,true),{dx:0,dy:-12});assert.deepEqual(screenDeltaToLocal(12,3,false),{dx:12,dy:3});
});
test('仅有 touch 的浏览器连续快速点两次，两个点击都执行',()=>{
  const b=button(),events=[];let time=1000;
  bindMouseButton(b,{down:()=>events.push('down'),up:()=>events.push('up'),now:()=>time});
  for(let i=0;i<2;i++){b.emit('touchstart',{changedTouches:[{identifier:i}]});b.emit('touchend',{changedTouches:[{identifier:i}]});b.emit('click');time+=100;}
  assert.deepEqual(events,['down','up','down','up']);
});
test('演示左右键产生可见结果：点击次数和右键菜单',async()=>{
  const d=new DemoDesktop();await d.request({action:'button',button:'left',down:true,x:640,y:380});await d.request({action:'button',button:'right',down:true,x:640,y:380});
  const s=await d.request({action:'snapshot'});assert.equal(s.leftClicks,1);assert.equal(s.rightClicks,1);assert.equal(s.focus.id,'demo-input');assert.ok(s.contextMenu);
  await d.request({action:'button',button:'left',down:true,x:640,y:380});assert.equal((await d.request({action:'snapshot'})).contextMenu,null);
});
