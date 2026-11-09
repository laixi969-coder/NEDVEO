import {test} from 'node:test';import assert from 'node:assert/strict';import {qualityGate,fingerprint,planResearch}from'../server/domain.js';import{openDatabase}from'../server/db.js';
test('缺少付费信息不会被否决，也不会声称已付款',()=>{const r=qualityGate({coverage:.7,paymentLevel:'L0',score:90});assert.equal(r.score,null);assert.equal(r.readiness,'R2');assert.equal(r.paymentVerified,false);assert.equal(r.publish,false)});
test('低覆盖无法发布点分，高可信反证不能被分数抵消',()=>{assert.equal(qualityGate({coverage:.3,score:99}).score,null);assert.equal(qualityGate({coverage:1,score:99,conflict:true}).readiness,'manual_review')});
test('研究计划不伪造研究结果和付费证据',()=>{const p=planResearch('照护协作','日本');assert.equal(p.status,'awaiting_evidence');assert.equal(p.score,null);assert.equal(p.cost,0);assert.equal(p.payment,'L0')});
test('相同内容规范化去重',()=>assert.equal(fingerprint('Hello   World'),fingerprint(' hello world ')));
test('SQL 查询和写入保持租户隔离',()=>{const s=openDatabase(':memory:');s.put('a','evidence','1',{secret:'private'});assert.equal(s.get('b','evidence','1'),null);assert.deepEqual(s.list('b','evidence'),[]);s.remove('b','evidence','1');assert.equal(s.get('a','evidence','1').secret,'private');s.db.close()});
