import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
export async function pairingToken(file,configured){
  let token=configured;
  if(!token){
    try{token=(await readFile(file,'utf8')).trim();}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      token=randomBytes(32).toString('hex');
      try{await writeFile(file,token+'\n',{mode:0o600,flag:'wx'});}
      catch(error){if(error.code!=='EEXIST')throw error;token=(await readFile(file,'utf8')).trim();}
    }
  }
  if(typeof token!=='string'||token.length<32)throw Error('配对密钥至少需要 32 个字符；请检查本机密钥文件或配置。');
  return token;
}
