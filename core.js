import {cleanEvaluationCache,evaluationPoints} from './forms.js';
import {VERSION,blocks,lessons,allQuestions,generatedMath} from './data.js';
export const KEY='az-revisions6e-2026:carnet:1';
export const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
export const integer=s=>typeof s==='string' && /^[-+]?\d+$/.test(s.replace(/[\s\u00a0\u202f]/g,''))?Number(s.replace(/[\s\u00a0\u202f]/g,'')):NaN;
export function evaluate(q,raw){
 const empty=raw==null || (Array.isArray(raw)?raw.length===0||raw.every(x=>String(x).trim()===''):String(raw).trim()==='');
 if(empty)return {empty:true,correct:false};
 if(q.type==='number')return {correct:Number.isSafeInteger(integer(String(raw)))&&integer(String(raw))===q.answer};
 if(q.type==='pair'){if(!Array.isArray(raw)||raw.length!==2||raw.some(x=>String(x).trim()===''))return {empty:true,correct:false};return {correct:raw.every((v,i)=>integer(String(v))===q.answer[i])};}
 if(q.type==='choice')return {correct:Number(raw)===q.answer};
 if(q.type==='order')return {correct:Array.isArray(raw)&&raw.length===q.answer.length&&raw.every((v,i)=>Number(v)===q.answer[i])};
 if(q.type==='multi'){return {correct:Array.isArray(raw)&&raw.length===q.answer.length&&new Set(raw.map(Number)).size===raw.length&&q.answer.every(v=>raw.map(Number).includes(v))};}
 if(q.type==='set'){const a=String(raw).split(/[;,\n]/).map(x=>x.trim());if(a.some(x=>x===''))return {correct:false}; const vals=a.map(integer);return {correct:vals.length===q.answer.length&&new Set(vals).size===vals.length&&vals.every(x=>Number.isSafeInteger(x)&&q.answer.includes(x))};}
 return {correct:false};
}
export function initial(){return {app:VERSION.app,schema:VERSION.notebook,codeVersion:VERSION.code,contentVersion:VERSION.content,gradingVersion:VERSION.grading,route:{page:'home'},resume:null,attempts:[],events:[],practice:{},challenge:null,challengeHistory:{},notes:{},visited:[],evaluations:{key:null,receipts:{}},created:new Date().toISOString()};}
export function makeAttempt(question){const displayOrder=question.options?question.options.map((_,i)=>i):[];for(let i=displayOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[displayOrder[i],displayOrder[j]]=[displayOrder[j],displayOrder[i]];}return {id:uid(),question,displayOrder,raw:question.type==='pair'?['','']:question.type==='multi'?[]:question.type==='order'?[]:'',errors:0,hints:[],status:'active',transfer:null,created:new Date().toISOString()};}
export const resolved=a=>a?.status==='correct'||a?.status==='transferred';
export const points=s=>new Set(s.events.map(e=>e.id)).size+evaluationPoints(s.evaluations);
export function credit(s,a,q,kind){const id=kind==='transfer'?a.id+':transfer':a.id;if(s.events.some(e=>e.id===id))return; s.events.push({id,attempt:a.id,activity:q.id,notion:q.lesson,kind,at:new Date().toISOString(),contentVersion:VERSION.content,help:a.hints.length>0||kind==='transfer'});}
export function submit(s,a,isTransfer=false){
 if(resolved(a))return {locked:true};
 const target=isTransfer?a.transfer:a;
 if(!target||(!isTransfer&&a.status==='transfer'))return {locked:true};
 const check=evaluate(target.question,target.raw);if(check.empty)return check;
 if(check.correct){
  if(isTransfer){target.status='correct';a.status='transferred';credit(s,a,target.question,'transfer');}
  else {a.status='correct';credit(s,a,a.question,'main');}
 }else{
  target.errors++;
  if(!isTransfer){if(!a.hints.includes(1))a.hints.push(1);if(a.errors>=2&&!a.hints.includes(2))a.hints.push(2);
   if(a.errors>=3){a.status='transfer';a.transfer=makeAttempt(lessons[a.question.lesson].transfer);}
  }
 }
 return {...check,errors:target.errors};
}
export function questionById(id){return allQuestions.find(q=>q.id===id)||Object.values(lessons).map(l=>l.transfer).find(q=>q.id===id);}
// Validation avant toute mutation : carnet local, jamais preuve centrale de note.
export function validateNotebook(v){
 const fail=m=>{throw new Error(m);};
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 const str=(x,max=200)=>typeof x==='string'&&x.length<=max;
 const nat=x=>Number.isSafeInteger(x)&&x>=0;
 if(!object(v)||v.app!==VERSION.app||v.schema!==1)fail('Ce fichier n’est pas un carnet compatible (format 1 attendu).');
 if(v.contentVersion!==VERSION.content||v.gradingVersion!==VERSION.grading)fail('Version de contenu ou de barème incompatible. Le carnet original reste conservé.');
 if(!Array.isArray(v.attempts)||v.attempts.length>5000||!Array.isArray(v.events)||v.events.length>10000)fail('Historique absent ou trop volumineux.');
 const ids=new Set();
 function canonical(q){if(!object(q)||!str(q.id)||!str(q.lesson)||!lessons[q.lesson])fail('Question inconnue.');
  if(q.id.startsWith('gen-')){if(q.type!=='number'||!Number.isSafeInteger(q.answer)||!str(q.prompt,200))fail('Calcul invalide.');
   const m=q.prompt.match(/^Calcule (\d+) ([+−×]) (\d+)\.$/);if(!m)fail('Calcul généré invalide.');const a=+m[1],b=+m[3]; if(a>10000||b>10000||q.answer!==(m[2]==='+'?a+b:m[2]==='−'?a-b:a*b))fail('Calcul et corrigé incohérents.');
   return {id:q.id,lesson:q.lesson,type:'number',prompt:q.prompt,answer:q.answer,why:`${a} ${m[2]} ${b} = ${q.answer}. Vérifie avec la méthode du cours.`,options:null,errors:null};}
  const c=questionById(q.id);if(!c)fail('Activité inconnue de cette version.');return structuredClone(c);
 }
 function cleanAttempt(a,nested=false){if(!object(a)||!str(a.id,80)||ids.has(a.id)||!nat(a.errors)||a.errors>100000||!Array.isArray(a.hints)||a.hints.some(h=>![1,2].includes(h)))fail('Tentative invalide ou dupliquée.');ids.add(a.id);
  if(!['active','correct','transfer','transferred'].includes(a.status))fail('Statut local invalide.');
  const c={id:a.id,question:canonical(a.question),raw:a.raw,errors:a.errors,hints:[...new Set(a.hints)],status:a.status,created:str(a.created,50)?a.created:''};
  const order=a.displayOrder??(c.question.options?c.question.options.map((_,i)=>i):[]);if(!Array.isArray(order)||order.length!==(c.question.options?.length||0)||new Set(order).size!==order.length||order.some(n=>!nat(n)||n>=order.length))fail('Ordre des choix invalide.');c.displayOrder=order;
  if(!(str(c.raw,2000)||Array.isArray(c.raw)&&c.raw.length<=20&&c.raw.every(x=>str(x,100)||nat(x))))fail('Réponse invalide.');
  if(c.status==='correct'&&!evaluate(c.question,c.raw).correct)fail('Correction locale incohérente.');
  if(a.transfer){if(nested)fail('Transfert imbriqué invalide.');c.transfer=cleanAttempt(a.transfer,true);if(c.transfer.question.id!==lessons[c.question.lesson].transfer.id)fail('Transfert incorrect.');}
  else c.transfer=null;
  if((c.status==='transfer'||c.status==='transferred')&&(!c.transfer||c.errors<3))fail('État de remédiation incohérent.');
  if(c.status==='transferred'&&c.transfer.status!=='correct')fail('Transfert non réussi.');return c;
 }
 const s=initial();s.evaluations=cleanEvaluationCache(v.evaluations);s.attempts=v.attempts.map(a=>cleanAttempt(a));
 const eventIds=new Set();s.events=v.events.map(e=>{if(!object(e)||!str(e.id,100)||eventIds.has(e.id)||!str(e.attempt,80)||!['main','transfer'].includes(e.kind)||!str(e.at,50)||typeof e.help!=='boolean')fail('Événement de points invalide ou dupliqué.');
  const a=s.attempts.find(a=>a.id===e.attempt);if(!a)fail('Point sans tentative.');const q=e.kind==='transfer'?a.transfer?.question:a.question;
  if(!q||e.id!==(e.kind==='transfer'?a.id+':transfer':a.id)||e.activity!==q.id||e.notion!==q.lesson||e.contentVersion!==VERSION.content||(e.kind==='main'?a.status!=='correct':a.status!=='transferred'))fail('Point et correction incohérents.');eventIds.add(e.id);return {id:e.id,attempt:e.attempt,activity:e.activity,notion:e.notion,kind:e.kind,at:e.at,contentVersion:e.contentVersion,help:e.help};});
 s.practice={};if(!object(v.practice))fail('Parcours invalide.');
 for(const [b,p] of Object.entries(v.practice)){const block=blocks.find(x=>x.id===b);if(!block||!object(p)||!nat(p.index)||p.index>block.questions.length)fail('Position invalide.');if(p.attemptId&&!s.attempts.some(a=>a.id===p.attemptId&&a.question.id===block.questions[p.index]?.id))fail('Position et question incohérentes.');s.practice[b]={index:p.index,attemptId:p.attemptId||null};}
 s.visited=Array.isArray(v.visited)?[...new Set(v.visited.filter(x=>typeof x==='string'&&lessons[x]))]:[];
 s.notes={};if(!object(v.notes))fail('Brouillons invalides.');for(const [k,n] of Object.entries(v.notes)){if(!str(k,100)||!str(n,5000))fail('Brouillon trop long.');s.notes[k]=n;}
 function route(r){if(!object(r)||!['home','subject','course','practice','bank','challenge','evaluate','resume','sources','music'].includes(r.page))return {page:'home'};const z={page:r.page};if(subjectIds.includes(r.subject))z.subject=r.subject;if(blocks.some(b=>b.id===r.block))z.block=r.block;if(lessons[r.lesson])z.lesson=r.lesson;return z;}
 s.route=route(v.route);s.resume=v.resume?route(v.resume):null;s.helpReturn=v.helpReturn?route(v.helpReturn):null;s.helpScroll=Number.isFinite(v.helpScroll)&&v.helpScroll>=0&&v.helpScroll<100000?v.helpScroll:0;
 if(v.challenge!==null){const c=v.challenge;if(!object(c)||!subjectIds.includes(c.subject)||![10,20,30].includes(c.target)||!['tables','reflechi','melange','banque'].includes(c.level)||![c.streak,c.best].every(nat)||c.streak>c.best||!Array.isArray(c.achieved)||c.achieved.some(n=>![10,20,30].includes(n))||!Array.isArray(c.recent)||c.recent.length>100||c.recent.some(x=>!str(x)))fail('Défi invalide.');if(c.attemptId&&!s.attempts.some(a=>a.id===c.attemptId))fail('Tentative de défi inconnue.');s.challenge={subject:c.subject,target:c.target,level:c.level,streak:c.streak,best:c.best,achieved:[...new Set(c.achieved)],recent:c.recent,attemptId:c.attemptId||null,finished:!!c.finished};}
 s.challengeHistory={};if(v.challengeHistory){if(!object(v.challengeHistory))fail('Historique de défis invalide.');for(const [k,h] of Object.entries(v.challengeHistory)){if(!/^(maths|histoire|sciences|musique)\|(tables|reflechi|melange|banque)$/.test(k)||!object(h)||!nat(h.best)||!Array.isArray(h.achieved)||h.achieved.some(n=>![10,20,30].includes(n)||n>h.best))fail('Historique de défis incohérent.');s.challengeHistory[k]={best:h.best,achieved:[...new Set(h.achieved)]};}}s.created=str(v.created,50)?v.created:s.created;return s;
}
const subjectIds=['maths','histoire','sciences','musique'];
export function exportEnvelope(s){return JSON.stringify({format:'az-revisions6e',exported:new Date().toISOString(),notebook:s},null,2);}
export function parseImport(text){if(text.length>2_000_000)throw new Error('Fichier trop volumineux (2 Mo maximum).');let p;try{p=JSON.parse(text);}catch{throw new Error('Le fichier JSON est illisible. Aucun carnet n’a été remplacé.');}if(p.format!=='az-revisions6e')throw new Error('Ce fichier n’est pas un export de cette application.');return validateNotebook(p.notebook);}
