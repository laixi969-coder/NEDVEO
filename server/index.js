import express from 'express';
import {createApplication} from './app.js';
const listener=express(),port=Number(process.env.PORT||4311);
// Fail duplicate listeners before opening storage or recovering any jobs.
await new Promise((resolve,reject)=>listener.listen(port,process.env.HOST||'127.0.0.1',e=>e?reject(e):resolve()));
const runtime=await createApplication();listener.use(runtime.app);
console.log('NEDVEO API http://127.0.0.1:'+port);
let closing=false;async function shutdown(){if(closing)return;closing=true;await runtime.close();process.exit(0)}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
