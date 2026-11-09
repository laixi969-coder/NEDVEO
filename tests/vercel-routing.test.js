import{test}from'node:test';
import assert from'node:assert/strict';
import gateway from'../api/gateway.js';

test('Vercel 多级 API 重写保留原路径和查询参数',async()=>{
 const req={url:'/api/gateway?__nedveo_path=auth%2Fme&view=summary',query:{__nedveo_path:'auth/me'}};
 const res={status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await gateway(req,res);
 assert.equal(req.url,'/api/auth/me?view=summary');
 assert.equal(res.code,503);
 assert.equal(res.body.setup_required,true);
});

test('Vercel 网关拒绝无效的重写路径',()=>{
 const req={url:'/api/gateway?__nedveo_path=..%2Fcron'};
 const res={status(code){this.code=code;return this},json(body){this.body=body;return this}};
 gateway(req,res);
 assert.equal(res.code,400);
});
