// 回执包含传输、解码和往返时间；只降低用户选定的上限，不放大流量。
export function streamProfile(width, quality, roundTripMs) {
  if (roundTripMs > 1800) return { width:Math.min(width,480), quality:Math.min(quality,25) };
  if (roundTripMs > 900) return { width:Math.min(width,640), quality:Math.min(quality,30) };
  return { width, quality };
}

export class FramePolicy {
  constructor(width,quality,{preferQuality=false,changedOnly=false}={}) {this.width=width;this.quality=quality;this.preferQuality=preferQuality;this.changedOnly=changedOnly;this.reset();}
  reset(now=Date.now()) {this.lastMotion=now;this.lastSent=0;this.sentMode=null;this.dirty=true;this.dynamicRtt=0;this.staticRtt=0;}
  acknowledge(roundTripMs,mode) {if(mode==='dynamic')this.dynamicRtt=roundTripMs;else this.staticRtt=roundTripMs;}
  profile(now,active) {
    const idle=!active&&now-this.lastMotion>=1200;
    if(this.changedOnly)return {width:1280,height:720,quality:60,mode:idle?'static':'dynamic'};
    if(this.preferQuality){
      if(idle)return this.staticRtt>4000||this.dynamicRtt>4000?{width:1440,quality:75,mode:'static'}:{width:2560,quality:85,mode:'static'};
      const slow=this.dynamicRtt>4000,medium=this.dynamicRtt>2000;
      return {width:Math.min(this.width,slow?960:medium?1080:1440),quality:Math.min(this.quality,slow?55:medium?60:70),mode:'dynamic'};
    }
    if(!idle)return {...streamProfile(this.width,this.quality,this.dynamicRtt),mode:'dynamic'};
    return {width:Math.max(this.width,this.dynamicRtt>1800?960:1280),quality:Math.max(this.quality,this.dynamicRtt>1800?55:60),mode:'static'};
  }
  observe({changed,motionRatio},now,active) {
    this.dirty ||= changed!==false;
    if(active || motionRatio>0.015)this.lastMotion=now;
  }
  shouldSend(profile,now) {
    if(this.changedOnly)return this.dirty;
    if(profile.mode!==this.sentMode)return true;
    if(!this.dirty)return false;
    return profile.mode==='dynamic' || now-this.lastSent>=2000;
  }
  sent(profile,now) {this.lastSent=now;this.sentMode=profile.mode;this.dirty=false;}
}
