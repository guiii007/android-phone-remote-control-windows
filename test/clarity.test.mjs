import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhoneEnhancer } from '../web/clarity.js';

test('unsupported GPU preserves the original frame',()=>{
  const renderer=new PhoneEnhancer(()=>({getContext:()=>null})),image={width:720,height:480};
  assert.equal(renderer.render(image,1080,720),image);
  assert.match(renderer.reason,/原画/);
});

test('sustained expensive processing falls back after warmup',()=>{
  const renderer=new PhoneEnhancer(()=>({getContext:()=>null}));
  renderer.reason='';renderer.gl={isContextLost:()=>false};
  for(let i=0;i<4;i++)renderer.recordCost(40);
  assert.equal(renderer.reason,'');
  renderer.recordCost(40);
  assert.match(renderer.reason,/保持流畅/);
  const image={};assert.equal(renderer.render(image,1080,720),image);
  renderer.retry();assert.equal(renderer.reason,'');assert.equal(renderer.slow,0);
});

test('an occasional slow frame does not turn enhancement off',()=>{
  const renderer=new PhoneEnhancer(()=>({getContext:()=>null}));renderer.reason='';
  for(const cost of [40,40,40,10,40,40,10])renderer.recordCost(cost);
  assert.equal(renderer.reason,'');
});
