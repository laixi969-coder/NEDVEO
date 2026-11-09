import{randomBytes,createCipheriv,createDecipheriv}from'node:crypto';
export function createDatabaseVault(store,tenant,encodedKey=process.env.VAULT_MASTER_KEY){
 const key=Buffer.from(encodedKey||'','base64');if(key.length!==32)throw Error('Vercel 部署需要32字节Base64 VAULT_MASTER_KEY；密钥应在平台环境变量中设置');
 const aad=Buffer.from('nedveo:provider:v1:'+tenant);
 return{read(){const packed=store.get(tenant,'secrets','provider');if(!packed)return null;const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(packed.iv,'base64'));decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(packed.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(packed.data,'base64')),decipher.final()]).toString('utf8'))},write(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);store.put(tenant,'secrets','provider',{id:'provider',version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})}};
}
