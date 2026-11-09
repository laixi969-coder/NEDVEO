import { createHash } from 'node:crypto';
export function qualityGate({coverage=0,conflict=false,paymentLevel='L0',score=null}) {
 if(conflict) return {score:null,readiness:'manual_review',publish:false};
 return {score:coverage>=.8?score:null,readiness:coverage>=.6?'R2':'R0',publish:coverage>=.8, paymentVerified:['L4','L5'].includes(paymentLevel)};
}
export function fingerprint(text) {return createHash('sha256').update(text.trim().replace(/\s+/g,' ').toLowerCase()).digest('hex');}
export function planResearch(query,market) {return {query,market,status:'awaiting_evidence',claim_type:'hypothesis',model_version:'none',cost:0,steps:[`明确「${query}」涉及的使用者、受益者和支付者`,`收集 ${market} 的独立来源，优先寻找现有替代方案`,`记录支持材料与反证，区分事实、推断和未知`,'访谈具有采购权的目标客户，验证需求频次与实际支出'],unknowns:['需求是否存在','谁控制预算','免费替代是否足够','实际付费行为'],payment:'L0',score:null};}
