import {readFileSync} from 'node:fs';
export function localSettings(){
  try{return JSON.parse(readFileSync(new URL('../.remote-settings.json',import.meta.url),'utf8'));}
  catch(error){if(error.code==='ENOENT')return {};throw Error('请检查 .remote-settings.json 是否为有效 JSON');}
}
export function remotePort(settings=localSettings()){
  const port=Number(process.env.PORT||settings.port||8789);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口应为 1 到 65535 的整数');
  return port;
}
