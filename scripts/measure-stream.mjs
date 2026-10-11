// 只测抓屏处理时间和 JPEG 大小，不保存或输出画面内容，也不执行输入。
import {WindowsDesktop} from '../src/desktop.mjs';
const desktop=new WindowsDesktop();
try {
  await desktop.request({action:'snapshot',maxWidth:320,quality:20});
  for(const [maxWidth,quality] of [[720,35],[1440,70],[2560,85]]) {
    const started=performance.now();
    const {image}=await desktop.request({action:'snapshot',maxWidth,quality});
    const encoded=Buffer.from(image,'base64');
    console.log(JSON.stringify({width:maxWidth,quality,format:encoded[0]===137?'png':'jpeg',bytes:encoded.length,captureMs:Math.round(performance.now()-started)}));
  }
} finally {await desktop.close();}
