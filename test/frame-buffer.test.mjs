import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameBuffer} from '../web/frame-buffer.js';
import {FramePolicy} from '../src/stream-profile.mjs';
test('变化区域保留背景；断线或尺寸变化必须从完整画面开始',()=>{
  const draws=[];const buffer=new FrameBuffer(()=>({getContext:()=>({drawImage:(...args)=>draws.push(args)})}));
  const full={width:100,height:60},patch={x:0,y:0,width:100,height:60,screenWidth:100,screenHeight:60};
  const canvas=buffer.apply(full,patch);
  assert.equal(buffer.apply({width:10,height:5},{...patch,x:20,y:30,width:10,height:5}),canvas);
  assert.deepEqual(draws[1].slice(1),[20,30]);assert.equal(canvas.width,100);
  assert.throws(()=>buffer.apply({width:10,height:5},{...patch,x:95,width:10,height:5}),/Invalid/);
  buffer.reset();assert.throws(()=>buffer.apply({width:10,height:5},{...patch,width:10,height:5}),/baseline/);
  assert.equal(buffer.apply(full,patch).height,60);
});
test('720p 下只有像素变化触发传图，纯鼠标活动和模式切换都不重复发送背景',()=>{
  const policy=new FramePolicy(1440,70,{changedOnly:true});policy.reset(0);
  let profile=policy.profile(0,true);assert.equal(profile.width,1280);assert.equal(profile.height,720);
  policy.sent(profile,0);policy.observe({changed:false,motionRatio:0},100,true);
  assert.equal(policy.shouldSend(policy.profile(100,true),100),false);
  assert.equal(policy.shouldSend(policy.profile(4000,false),4000),false);
  policy.observe({changed:true,motionRatio:0},4100,false);
  assert.equal(policy.shouldSend(policy.profile(4100,false),4100),true);
});
