import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { textIndexAt, textOffset, TEXT_LEFT, TEXT_RIGHT } from '../web/text-layout.js';

export class WindowsDesktop {
  constructor() {
    this.nextId = 0; this.pending = new Map(); this.stopped = false;
    this.child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('../windows/worker.ps1', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: this.child.stdout }).on('line', line => {
      let m; try { m = JSON.parse(line); } catch { return; }
      const p = this.pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
    });
    this.child.stderr.on('data', data => console.error('Windows 端:', data.toString().trim()));
    const fail = message => { this.stopped = true; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } this.pending.clear(); };
    this.child.on('error', e => fail(e.message));
    this.child.on('exit', () => fail('Windows 控制进程已退出；请重新启动电脑端。'));
  }
  request(command) {
    if (this.stopped) return Promise.reject(new Error('Windows 控制进程不可用'));
    if (this.pending.size >= 64) return Promise.reject(new Error('操作过快，请稍后再试'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      // 不自动重试输入，避免半途失败时重复发送文字。
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('电脑操作超时；结果不确定，请查看电脑画面后再操作。')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...command, id }) + '\n', error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
    });
  }
  async close() {
    if (this.stopped) return;
    try { await this.request({ action: 'release' }); } catch {}
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill(), 2000); timer.unref();
  }
}

export class DemoDesktop {
  constructor() { this.width = 1280; this.height = 720; this.text = '按住左键，拖动圆柄选择这段文字。'; this.typing = false; this.x = 600; this.y = 300; this.leftClicks=0; this.rightClicks=0; this.contextMenu=null; this.anchor=0; this.caret=0; this.dragging=false; this.scrollX=0; }
  ensureCaret(){const x=textOffset(this.text,this.caret);if(x-this.scrollX>TEXT_RIGHT-TEXT_LEFT)this.scrollX=x-(TEXT_RIGHT-TEXT_LEFT);if(x<this.scrollX)this.scrollX=x;}
  replaceSelection(text){const chars=Array.from(this.text),start=Math.min(this.anchor,this.caret),end=Math.max(this.anchor,this.caret);chars.splice(start,end-start,...Array.from(text));this.text=chars.join('');this.caret=this.anchor=start+Array.from(text).length;this.ensureCaret();}
  async request(c) {
    if (c.action === 'snapshot') return { width: this.width, height: this.height, demo: true, text: this.text, selectionStart:Math.min(this.anchor,this.caret), selectionEnd:Math.max(this.anchor,this.caret), caret:this.caret, scrollX:this.scrollX, leftClicks:this.leftClicks, rightClicks:this.rightClicks, contextMenu:this.contextMenu, focus: this.typing ? { id: 'demo-input', x: 330, y: 360, width: 620, height: 58, password: false } : null };
    if (c.action === 'move') { this.x = c.x; this.y = c.y; if(this.dragging){if(c.x>TEXT_RIGHT)this.scrollX+=26;else if(c.x<TEXT_LEFT)this.scrollX=Math.max(0,this.scrollX-26);this.caret=textIndexAt(this.text,c.x,this.scrollX);this.ensureCaret();} }
    if (c.action === 'button' && c.down) {
      this.x=c.x; this.y=c.y;
      if(c.button==='left'){this.leftClicks++;this.contextMenu=null;this.typing = c.x >= 330 && c.x <= 950 && c.y >= 360 && c.y <= 418;this.dragging=this.typing;if(this.typing){this.anchor=this.caret=textIndexAt(this.text,c.x,this.scrollX);}}
      else {this.rightClicks++;this.contextMenu={x:Math.max(0,Math.min(c.x,1060)),y:Math.max(0,Math.min(c.y,620))};}
    }
    if(c.action==='release'||(c.action==='button'&&!c.down&&c.button==='left'))this.dragging=false;
    if (c.action === 'text') { if (!this.typing) throw new Error('请先点击演示输入框'); this.replaceSelection(c.text); }
    if(c.action==='key'&&this.typing){if(c.key==='Backspace'){if(this.anchor===this.caret)this.anchor=Math.max(0,this.caret-1);this.replaceSelection('');}else if(c.key==='Enter'||c.key==='ShiftEnter')this.replaceSelection('\n');else if(c.key==='ArrowLeft'||c.key==='ArrowRight'){this.caret=this.anchor=Math.max(0,Math.min(Array.from(this.text).length,this.caret+(c.key==='ArrowLeft'?-1:1)));this.ensureCaret();}}
    return null;
  }
  async close() {}
}
