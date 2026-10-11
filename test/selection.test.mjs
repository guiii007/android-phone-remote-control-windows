import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoDesktop } from '../src/desktop.mjs';
import { textOffset, deletionRange } from '../web/text-layout.js';
import { shouldRotatePage } from '../web/geometry.js';

const point=(text,index)=>({x:344+textOffset(text,index),y:385});
test('手机删除支持选区、光标前字符、组合 emoji，开头不删除',()=>{
  for(const last of ['字','a','😀','👨‍👩‍👧‍👦','e\u0301']){
    const text='你好'+last+'尾';const caret=text.length-1;
    const r=deletionRange(text,caret,caret);
    assert.equal(text.slice(0,r.start)+text.slice(r.end),'你好尾');
  }
  assert.deepEqual(deletionRange('你好',0,0),{start:0,end:0});
  assert.deepEqual(deletionRange('你好世界',1,3),{start:1,end:3});
});
test('左键按住再移动：选择文字，松开后仍保留选择，输入替换选中内容',async()=>{
  const d=new DemoDesktop();d.text='你好世界😀abc';
  await d.request({action:'button',button:'left',down:true,...point(d.text,1)});
  await d.request({action:'move',...point(d.text,5)});
  await d.request({action:'button',button:'left',down:false,...point(d.text,5)});
  const s=await d.request({action:'snapshot'});assert.equal(s.selectionStart,1);assert.equal(s.selectionEnd,5);
  await d.request({action:'text',text:'替换'});assert.equal(d.text,'你替换abc');
});
test('反向拖选可删除，点击后松开再移动不会继续选中',async()=>{
  const d=new DemoDesktop();d.text='一二三四五';
  await d.request({action:'button',button:'left',down:true,...point(d.text,4)});await d.request({action:'move',...point(d.text,1)});await d.request({action:'release'});
  await d.request({action:'key',key:'Backspace'});assert.equal(d.text,'一五');
  await d.request({action:'button',button:'left',down:true,...point(d.text,0)});await d.request({action:'button',button:'left',down:false,...point(d.text,0)});await d.request({action:'move',...point(d.text,2)});assert.equal(d.caret,0);
});
test('锁定竖屏的浏览器弹出真实键盘时不旋转网页，避免页面和键盘方向相反',()=>{
  const input={wanted:true,width:390,height:700,nativeEditing:true,preview:false};
  assert.equal(shouldRotatePage(input),false);
  assert.equal(shouldRotatePage({...input,nativeEditing:false}),true);

  assert.equal(shouldRotatePage({...input,width:844,height:390}),false);
});
