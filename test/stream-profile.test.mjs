import test from 'node:test';
import assert from 'node:assert/strict';
import { streamProfile, FramePolicy } from '../src/stream-profile.mjs';
test('高清补帧往返过慢时缩小后续静态帧，动态清晰度不被大图回执误降',()=>{
  const policy=new FramePolicy(1440,70,{preferQuality:true});policy.reset(0);
  assert.equal(policy.profile(1300,false).width,2560);
  policy.acknowledge(7000,'static');assert.equal(policy.profile(1400,false).width,1440);
  assert.equal(policy.profile(1400,true).width,1440);
});
test('画质优先保持文字细节，静态补原屏上限，慢链路仍限制动态帧',()=>{
  const policy=new FramePolicy(1440,70,{preferQuality:true});policy.reset(0);
  assert.deepEqual(policy.profile(0,true),{width:1440,quality:70,mode:'dynamic'});
  policy.acknowledge(3000,'dynamic');assert.equal(policy.profile(0,true).width,1080);
  policy.acknowledge(6000,'dynamic');assert.equal(policy.profile(0,true).width,960);
  assert.deepEqual(policy.profile(1300,false),{width:1440,quality:75,mode:'static'});
  policy.acknowledge(12000,'static');assert.equal(policy.profile(1400,true).width,960);
});
test('慢链路降低帧大小，用户已设置更低清晰度时不增加流量',()=>{
  assert.deepEqual(streamProfile(720,35,2500),{width:480,quality:25});
  assert.deepEqual(streamProfile(720,35,1200),{width:640,quality:30});
  assert.deepEqual(streamProfile(720,35,500),{width:720,quality:35});
  assert.deepEqual(streamProfile(320,20,2500),{width:320,quality:20});
});

test('静止后只补一次高清，未变化不重传；持续滚动或视频保持小帧',()=>{
  const policy=new FramePolicy(720,35);policy.reset(0);
  policy.observe({changed:true,motionRatio:1},0,false);
  const moving=policy.profile(0,false);policy.sent(moving,0);
  for(const now of [500,1000,1500]){policy.observe({changed:true,motionRatio:0.1},now,false);assert.equal(policy.profile(now,false).mode,'dynamic');}
  const still=policy.profile(2800,false);assert.equal(still.mode,'static');assert.ok(still.width>moving.width&&still.quality>moving.quality);
  assert.equal(policy.shouldSend(still,2800),true);policy.sent(still,2800);
  policy.observe({changed:false,motionRatio:0},3600,false);assert.equal(policy.shouldSend(still,3600),false);
  assert.equal(policy.profile(3600,true).mode,'dynamic');
});

test('小变化合并后更新静态画面，高清回执不拖低动态档位，操作立即退出静态',()=>{
  const policy=new FramePolicy(720,35);policy.reset(0);policy.acknowledge(600,'dynamic');
  const still=policy.profile(1300,false);policy.sent(still,1300);
  policy.observe({changed:true,motionRatio:0.001},1800,false);assert.equal(policy.shouldSend(still,1800),false);
  policy.observe({changed:false,motionRatio:0},3400,false);assert.equal(policy.shouldSend(still,3400),true);
  policy.acknowledge(8000,'static');assert.equal(policy.dynamicRtt,600);
  policy.observe({changed:false,motionRatio:0},3500,true);assert.equal(policy.profile(3500,false).mode,'dynamic');
  policy.acknowledge(2500,'dynamic');assert.equal(policy.profile(4800,false).width,960);
});
