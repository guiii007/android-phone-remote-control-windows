import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const hash=value=>createHash('sha256').update(value).digest('hex');
const pinHash=(pin,salt)=>scryptSync(pin,salt,32).toString('hex');
export class DeviceAccess {
  constructor(file){
    file=file instanceof URL?fileURLToPath(file):file;
    this.file=file;this.devices={};this.tickets=new Map();
    if(file){try{this.devices=JSON.parse(readFileSync(file,'utf8')).devices||{};}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  save(){if(this.file){writeFileSync(this.file+'.tmp',JSON.stringify({devices:this.devices}));renameSync(this.file+'.tmp',this.file);}}
  find(secret){return typeof secret==='string'?this.devices[hash(secret)]:null;}
  register(pin){
    if(!/^\d{4}$/.test(pin))throw Error('请设置四位数字密码');
    const secret=randomBytes(32).toString('hex'),salt=randomBytes(16).toString('hex');
    this.devices[hash(secret)]={salt,pin:pinHash(pin,salt),failures:0,until:0};this.save();return secret;
  }
  unlock(secret,pin,now=Date.now()){
    const device=this.find(secret);if(!device)return {ok:false,error:'这台浏览器需要首次配对',unpaired:true};
    if(device.until>now)return {ok:false,error:`请等待 ${Math.ceil((device.until-now)/1000)} 秒后重试`};
    const valid=/^\d{4}$/.test(pin)&&timingSafeEqual(Buffer.from(pinHash(pin,device.salt),'hex'),Buffer.from(device.pin,'hex'));
    if(!valid){device.failures++;if(device.failures>=5)device.until=now+Math.min(600000,30000*2**Math.min(5,device.failures-5));this.save();return {ok:false,error:device.until>now?'输错次数较多，请稍后重试':'密码不正确'};}
    device.failures=0;device.until=0;this.save();
    for(const [key,value] of this.tickets)if(value.expires<=now)this.tickets.delete(key);
    const ticket=randomBytes(32).toString('hex');this.tickets.set(ticket,{expires:now+60000});return {ok:true,ticket};
  }
  consume(ticket,now=Date.now()){const found=this.tickets.get(ticket);this.tickets.delete(ticket);return !!found&&found.expires>now;}
}
