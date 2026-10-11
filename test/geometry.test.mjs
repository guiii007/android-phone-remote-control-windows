import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopTransform} from '../web/geometry.js';
const desktop={width:1920,height:1080};
test('竖屏、横屏和键盘压缩空间时，整张电脑画面始终在可见范围内',()=>{
  for(const view of [{stageWidth:390,stageHeight:760},{stageWidth:390,stageHeight:180},{stageWidth:844,stageHeight:330},{stageWidth:844,stageHeight:60}]){
    const t=desktopTransform({...desktop,...view});
    assert.ok(t.tx>=0&&t.ty>=0);
    assert.ok(t.tx+desktop.width*t.scale<=view.stageWidth+.001);
    assert.ok(t.ty+desktop.height*t.scale<=view.stageHeight+.001);
    assert.ok(Math.abs(t.tx-(view.stageWidth-desktop.width*t.scale)/2)<.001);
    assert.ok(Math.abs(t.ty-(view.stageHeight-desktop.height*t.scale)/2)<.001);
  }
});
test('输入框、鼠标位置和打字状态不会改变画面布局；收起键盘恢复原视图',()=>{
  const view={...desktop,stageWidth:390,stageHeight:760};
  const original=desktopTransform(view);
  for(const cursor of [{x:0,y:0},{x:1919,y:1079}]){
    assert.deepEqual(desktopTransform({...view,typing:true,focus:{x:0,y:1000,width:500,height:50},cursor}),original);
  }
  const keyboard=desktopTransform({...view,stageHeight:180});
  assert.ok(keyboard.scale<=original.scale);
  assert.deepEqual(desktopTransform(view),original);
});
