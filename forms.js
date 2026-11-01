import {FORMS_CONFIG} from './forms-config.js';
export const validEvaluationKey=k=>typeof k==='string'&&/^R6-(?:TEST-)?[a-f0-9]{48}$/.test(k);
export function evaluationIdentity(){return 'R6-'+Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');}
export function ensureEvaluationIdentity(state){if(!state.evaluations)state.evaluations={key:null,receipts:{}};if(!state.evaluations.key)state.evaluations.key=evaluationIdentity();return state.evaluations.key;}
function cleanReceipt(r,spec){
 if(!r||typeof r!=='object'||typeof r.id!=='string'||!r.id||r.id.length>400||typeof r.at!=='string'||!Number.isFinite(Date.parse(r.at))||!['confirmed','pending'].includes(r.status)||r.maximum!==spec.maximum||!Array.isArray(r.correct)||r.correct.length>spec.questions.length)throw Error('Résultat de tentative invalide.');
 if(new Set(r.correct).size!==r.correct.length||r.correct.some(id=>!spec.questions.some(q=>q.id===id)))throw Error('Questions de résultat inconnues ou dupliquées.');
 if(r.status==='confirmed'&&(!Number.isInteger(r.score)||r.score!==r.correct.length||r.score<0||r.score>spec.maximum)||r.status==='pending'&&(r.score!==null||r.correct.length))throw Error('Barème de résultat incohérent.');
 return {id:r.id,at:new Date(r.at).toISOString(),status:r.status,score:r.score,maximum:r.maximum,correct:[...r.correct]};
}
export function validateEvaluationEnvelope(value,block,request,key){
 const spec=FORMS_CONFIG.forms[block];
 if(!spec||!validEvaluationKey(key)||!value||value.ok!==true||value.app!==FORMS_CONFIG.app||value.protocol!==1||value.block!==block||value.version!==spec.version||value.request!==request||value.technical!==key.startsWith('R6-TEST-')||!Array.isArray(value.attempts)||value.attempts.length>1000)throw Error('La confirmation ne correspond pas à ce carnet, ce bloc ou cette version.');
 const attempts=value.attempts.map(r=>cleanReceipt(r,spec));
 if(new Set(attempts.map(r=>r.id)).size!==attempts.length)throw Error('Tentative reçue en double.');
 return {app:FORMS_CONFIG.app,protocol:1,version:spec.version,block,request,technical:value.technical,attempts};
}
export function cleanEvaluationCache(value){
 if(value===undefined)return {key:null,receipts:{}};
 if(!value||typeof value!=='object'||(value.key!==null&&!validEvaluationKey(value.key))||!value.receipts||typeof value.receipts!=='object'||Array.isArray(value.receipts))throw Error('Carnet d’évaluation invalide.');
 const out={key:value.key,receipts:{}};
 for(const [block,receipts] of Object.entries(value.receipts)){
  const spec=FORMS_CONFIG.forms[block];if(!spec||!value.key||!Array.isArray(receipts)||receipts.length>1000)throw Error('Historique d’évaluation incompatible.');
  const clean=receipts.map(r=>cleanReceipt(r,spec));if(clean.some(r=>r.status!=='confirmed')||new Set(clean.map(r=>r.id)).size!==clean.length)throw Error('Historique d’évaluation incohérent.');out.receipts[block]=clean;
 }
 // Un statut « validé » importé n'est jamais repris. Les notes mémorisées ne sont pas une confirmation en ligne.
 return out;
}
export function mergeEvaluationReceipts(state,envelope){
 const previous=state.evaluations.receipts[envelope.block]||[],byId=new Map(previous.map(r=>[r.id,r]));
 for(const r of envelope.attempts.filter(r=>r.status==='confirmed')){
  const old=byId.get(r.id);
  if(old&&(old.score!==r.score||old.maximum!==r.maximum||[...old.correct].sort().join('|')!==[...r.correct].sort().join('|')))throw Error('Un ancien résultat a changé. Nouvelle vérification nécessaire.');
  byId.set(r.id,r);
 }
 state.evaluations.receipts[envelope.block]=[...byId.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
}
export function evaluationPoints(evaluations){const ids=new Set();for(const [block,rs] of Object.entries(evaluations?.receipts||{}))for(const r of rs)if(r.status==='confirmed')for(const q of r.correct)ids.add(block+'|'+r.id+'|'+q);return ids.size;}
export function evaluationSummary(envelope){if(!envelope)return {confirmed:false,passed:false,latest:null};const ready=envelope.attempts.filter(a=>a.status==='confirmed').sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));return {confirmed:true,passed:ready.some(a=>a.score*2>=a.maximum),latest:ready.at(-1)||null,pending:envelope.attempts.some(a=>a.status==='pending')};}
export function evaluationFormUrl(block,key){const spec=FORMS_CONFIG.forms[block];if(!spec?.published||!spec.prefillUrl||!validEvaluationKey(key))return null;const url=new URL(spec.prefillUrl);if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||!url.pathname.includes('/forms/'))throw Error('Lien de questionnaire invalide.');let found=false;for(const [k,v] of url.searchParams)if(k.startsWith('entry.')&&v==='R6CODEPLACEHOLDER'){url.searchParams.set(k,key);found=true;}if(!found)throw Error('Le lien ne contient pas le champ de carnet attendu.');return url.href;}
export function validEvaluationEndpoint(value){try{const u=new URL(value);return u.origin==='https://script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}}
export function requestEvaluation(block,key,options={}){
 const endpoint=options.endpoint??FORMS_CONFIG.endpoint;if(!validEvaluationEndpoint(endpoint)||!FORMS_CONFIG.forms[block]||!validEvaluationKey(key))return Promise.reject(Error('La liaison de résultats est en préparation.'));
 const request=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),callback='r6Reply_'+request;
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');let settled=false,timer;
  const done=(err,data)=>{if(settled)return;settled=true;clearTimeout(timer);script.remove();delete window[callback];if(err)reject(err);else resolve(data);};
  window[callback]=value=>{try{if(value?.ok!==true)throw Error('Le résultat ne peut pas encore être confirmé. Réessaie dans un instant.');done(null,validateEvaluationEnvelope(value,block,request,key));}catch(e){done(e);}};
  const u=new URL(endpoint);u.search=new URLSearchParams({action:'result',code:key,block,request}).toString();
  script.src=u.href;script.referrerPolicy='no-referrer';script.async=true;script.onerror=()=>done(Error('Connexion à Google impossible. Ton carnet est conservé.'));
  timer=setTimeout(()=>done(Error('Google ne répond pas pour le moment. Ton résultat reste à confirmer.')),options.timeout??45000);document.head.append(script);
 });
}
