import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {localSettings,remotePort} from './local-settings.mjs';
const exec=promisify(execFile);
const settings=localSettings(),port=remotePort(settings);
const candidates=[process.env.TAILSCALE_EXE,settings.tailscalePath,`${process.env.ProgramFiles}\\Tailscale\\tailscale.exe`].filter(Boolean);
let binary=candidates.find(existsSync);
if(!binary){try{const {stdout}=await exec('where.exe',['tailscale.exe'],{windowsHide:true,timeout:5000});binary=stdout.trim().split(/\r?\n/).find(existsSync);}catch{}}
binary ||= 'tailscale';
async function status(){const {stdout}=await exec(binary,['status','--json'],{windowsHide:true,timeout:10000});return JSON.parse(stdout);}
try{
  let state=await status();
  // 完全退出托盘程序后，Windows 服务可能仍在，但处于 NoState。
  // 打开原安装的客户端恢复用户会话，不重置登录和连接配置。
  if(state.BackendState==='NoState'){
    const client=join(dirname(binary),'tailscale-ipn.exe');
    if(existsSync(client)){
      const child=spawn(client,[],{detached:true,stdio:'ignore',windowsHide:true});
      child.on('error',()=>{});child.unref();
    }
  }
  if(state.BackendState==='Stopped'){
    await exec(binary,['up','--timeout=15s'],{windowsHide:true,timeout:20000});
  }
  for(let attempt=0;attempt<15;attempt++){
    state=await status();
    if(state.BackendState==='Running')break;
    if(state.BackendState==='NeedsLogin')throw Error('请先在电脑 Tailscale 中登录原来的账号，再重新运行。');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(state.BackendState!=='Running')throw Error('Tailscale 尚未运行，请检查电脑网络和 Tailscale 登录状态。');
  const ip=state.TailscaleIPs?.find(value=>!value.includes(':'));
  if(!ip)throw Error('未找到 Tailscale IPv4 地址。');
  console.log(`手机外网页面：http://${ip}:${port}/`);
  if(!state.Self?.Online)console.log('Tailscale 尚未确认在线，手机页面可能需要等待连接；请保持两端网络和 Tailscale 开启。');
  console.log('手机开启 Tailscale，使用同一账号，并打开上面的地址。');
  console.log('配对密钥在 .pairing-token；无需公开电脑端口或开启 Funnel。');
  const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`$entry=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if($entry){Write-Output 'listening'}; exit 0`],{windowsHide:true,timeout:10000});
  if(stdout.trim()==='listening'){
    let health;
    try {const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(2000)});health=await response.json();}catch{}
    if(health?.service!=='palm-remote')throw Error(`${port} 端口被其他服务占用，请关闭占用该端口的程序后重试；本次未启动远控。`);
    console.log(`${port} 服务已在运行，本次不重复启动。`);
  }else{
    process.env.BIND='0.0.0.0';process.env.PORT=String(port);delete process.env.RELAY_URL;
    process.env.REMOTE_WIDTH='1280';process.env.REMOTE_QUALITY='60';process.env.REMOTE_FPS='4';process.env.REMOTE_QUALITY_FIRST='0';process.env.REMOTE_CHANGED_ONLY='1';
    await import('./host.mjs');
  }
}catch(error){console.error(error.message);process.exitCode=1;}
