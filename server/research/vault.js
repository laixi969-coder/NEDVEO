import{randomBytes,createCipheriv,createDecipheriv}from'node:crypto';
import{mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync,renameSync}from'node:fs';
import{dirname,join}from'node:path';
export function createVault(dir='.data'){
 mkdirSync(dir,{recursive:true,mode:0o700});const keyPath=join(dir,'vault.key'),dataPath=join(dir,'provider.enc');
 if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32),{mode:0o600});chmodSync(keyPath,0o600);const key=readFileSync(keyPath);
 return {read(){if(!existsSync(dataPath))return null;const packed=JSON.parse(readFileSync(dataPath,'utf8'));const d=createDecipheriv('aes-256-gcm',key,Buffer.from(packed.iv,'hex'));d.setAuthTag(Buffer.from(packed.tag,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(packed.data,'hex')),d.final()]).toString())},write(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);const temporary=dataPath+'.'+randomBytes(8).toString('hex')+'.tmp';writeFileSync(temporary,JSON.stringify({iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),data:data.toString('hex')}),{mode:0o600,flush:true});renameSync(temporary,dataPath);chmodSync(dataPath,0o600)}};
}
