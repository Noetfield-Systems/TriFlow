/**
 * TriFlow Experience: opt-in anonymous analytics, feedback, support chat, neural voice.
 * SQLite stores no audio, transcripts, message text from support, IP addresses or emails.
 */
import {Database} from 'bun:sqlite';
import {mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:JSON_HEADERS});
export const VOICES={
 en:[['hannah','flux-hannah-en','Hannah · warm'],['kit','flux-kit-en','Kit · calm'],['alexis','flux-alexis-en','Alexis · clear']],
 es:[['valentina','flux-valentina-es','Valentina · warm'],['carmen','flux-carmen-es','Carmen · thoughtful'],['martin','flux-martin-es','Martín · calm']],
 fr:[['camille','flux-camille-fr','Camille · warm'],['chloe','flux-chloe-fr','Chloé · gentle'],['julien','flux-julien-fr','Julien · clear']],
 de:[['magdalena','flux-magdalena-de','Magdalena · clear'],['moritz','flux-moritz-de','Moritz · calm']],
 it:[['sofia','flux-sofia-it','Sofia · warm'],['matteo','flux-matteo-it','Matteo · clear']],
 pt:[['mariana','flux-mariana-pt','Mariana · warm'],['miguel','flux-miguel-pt','Miguel · calm']],
 ja:[['ayumi','flux-ayumi-ja','Ayumi · clear'],['hayato','flux-hayato-ja','Hayato · calm']],
 nl:[['anouk','flux-anouk-nl','Anouk · warm'],['bram','flux-bram-nl','Bram · clear']],
 hi:[['anjali','flux-anjali-hi','Anjali · warm'],['rahul','flux-rahul-hi','Rahul · clear']]
};
const EVENTS=new Set(['app_open','voice_started','voice_stopped','voice_fallback','voice_failed','voice_generated','turn_completed','translation_failed','help_opened','feedback_sent','session_exported','setting_changed','sample_preview']);
const CATEGORIES=new Set(['voice','translation','usability','bug','idea','other']);
const trim=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const idOk=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{10,70}$/.test(x);
export function createExperienceApi({env,fetchImpl=fetch,now=Date.now}={}){
 const dir=env.TRIFLOW_DATA_DIR||'/tmp/triflow';mkdirSync(dir,{recursive:true});
 const db=new Database(dir+'/experience.sqlite',{create:true,strict:true});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
 db.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, day TEXT NOT NULL, visitor TEXT NOT NULL, event TEXT NOT NULL, languages TEXT NOT NULL DEFAULT "", mode TEXT NOT NULL DEFAULT "", provider TEXT NOT NULL DEFAULT "")');
 db.exec('CREATE INDEX IF NOT EXISTS idx_events_day ON events(day)');
 db.exec('CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, visitor TEXT NOT NULL, category TEXT NOT NULL, rating INTEGER, comment TEXT NOT NULL, alias TEXT NOT NULL DEFAULT "", languages TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "new")');
 db.exec('CREATE INDEX IF NOT EXISTS idx_feedback_at ON feedback(at)');
 const addEvent=db.prepare('INSERT INTO events (at,day,visitor,event,languages,mode,provider) VALUES (?,?,?,?,?,?,?)');
 const addFeedback=db.prepare('INSERT INTO feedback (at,visitor,category,rating,comment,alias,languages) VALUES (?,?,?,?,?,?,?)');
 const limits=new Map();
 const key=String(env.DEEPGRAM_API_KEY||env['Deepgram-api']||'').trim();
 const openai=String(env.OPENAI_API_KEY||env['OpenAI-API']||'').trim();
 const admin=String(env.TRIFLOW_ADMIN_TOKEN||'');
 const visitorHash=x=>createHash('sha256').update(String(env.SESSION_SECRET||'triflow')+':'+x).digest('hex').slice(0,32);
 const rate=(req,kind,max,window=3600000)=>{
  const ip=String(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'anon').slice(0,90);
  const k=kind+':'+ip,t=now(),old=limits.get(k),v=old&&old.until>t?{n:old.n+1,until:old.until}:{n:1,until:t+window};
  limits.set(k,v);if(limits.size>2000)for(const [key,value] of limits)if(value.until<t)limits.delete(key);
  return v.n<=max;
 };
 const body=async(req,max=3500)=>{
  if(Number(req.headers.get('content-length')||0)>max)return null;
  try{const s=await req.text();return s.length<=max?JSON.parse(s||'{}'):null;}catch{return null;}
 };
 let lastPrune=0;
 const prune=()=>{if(now()-lastPrune<86400000)return;lastPrune=now();
  db.query('DELETE FROM events WHERE at < ?').run(now()-30*86400000);
  db.query('DELETE FROM feedback WHERE at < ?').run(now()-180*86400000);
 };
 const langs=b=>Array.isArray(b?.languages)?b.languages.filter(x=>typeof x==='string'&&/^[a-z-]{2,8}$/.test(x)).slice(0,3).join(','):'';
 async function handle(req,{sessionReady=false}={}){
  const path=new URL(req.url).pathname;
  if(path==='/api/experience/config'&&req.method==='GET')
   return json({ok:true,neuralVoicesReady:Boolean(key),helpReady:true,feedbackReady:true,telemetryAvailable:true,voiceCatalog:VOICES});
  if(path==='/api/admin/insights'&&req.method==='GET'){
   const value=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
   if(!admin||value.length!==admin.length||!value)return json({error:'UNAUTHORIZED'},401);
   let diff=0;for(let i=0;i<value.length;i++)diff|=value.charCodeAt(i)^admin.charCodeAt(i);
   if(diff)return json({error:'UNAUTHORIZED'},401);
   prune();const since=now()-30*86400000;
   return json({ok:true,periodDays:30,overview:db.query('SELECT COUNT(*) AS events,COUNT(DISTINCT visitor) AS visitors FROM events WHERE at>=?').get(since),events:db.query('SELECT day,event,COUNT(*) AS count,COUNT(DISTINCT visitor) AS visitors FROM events WHERE at>=? GROUP BY day,event ORDER BY day DESC,event').all(since),feedback:db.query('SELECT id,at,category,rating,comment,alias,languages,status FROM feedback ORDER BY at DESC LIMIT 50').all(),storage:'sqlite'});
  }
  if(!['/api/voice','/api/support','/api/feedback','/api/events'].includes(path))return null;
  if(!sessionReady)return json({error:'SESSION_REQUIRED'},401);
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  prune();
  if(path==='/api/voice'){
   if(!key)return json({error:'VOICE_PROVIDER_UNAVAILABLE'},503);
   if(!rate(req,'voice',32))return json({error:'VOICE_USAGE_LIMIT'},429);
   const b=await body(req,1800);if(!b)return json({error:'INVALID_JSON'},400);
   const text=trim(b.text,650),lang=trim(b.language,8),voice=trim(b.voice,30);
   const selected=(VOICES[lang]||[]).find(v=>v[0]===voice)||(VOICES[lang]||[])[0];
   if(!selected||!text||Number(b.text?.length)>650)return json({error:'INVALID_VOICE_REQUEST'},400);
   const speed=[0.9,1,1.1].includes(Number(b.speed))?Number(b.speed):1;
   const upstreamUrl='https://api.deepgram.com/v2/speak?'+new URLSearchParams({model:selected[1],encoding:'mp3',speed:String(speed)});
   try{
    const r=await fetchImpl(upstreamUrl,{method:'POST',headers:{Authorization:'Token '+key,'content-type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(22000)});
    if(!r.ok){console.warn('[TriFlow] voice backend status',r.status);return json({error:'VOICE_UPSTREAM_UNAVAILABLE'},502);}
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength<300||bytes.byteLength>4_000_000)return json({error:'VOICE_RESPONSE_INVALID'},502);
    return new Response(bytes,{headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff','x-triflow-voice':selected[0]}});
   }catch{return json({error:'VOICE_TIMEOUT'},504);}
  }
  if(path==='/api/events'){
   if(!rate(req,'events',200))return json({error:'EVENT_LIMIT'},429);
   const b=await body(req,900);
   if(!b||b.consent!==true||!EVENTS.has(b.event)||!idOk(b.visitor))return json({error:'INVALID_EVENT'},400);
   addEvent.run(now(),new Date(now()).toISOString().slice(0,10),visitorHash(b.visitor),b.event,langs(b),trim(b.mode,20),trim(b.provider,25));
   return json({ok:true});
  }
  if(path==='/api/feedback'){
   if(!rate(req,'feedback',8,86400000))return json({error:'FEEDBACK_LIMIT'},429);
   const b=await body(req,2500);
   if(!b||!idOk(b.visitor)||!CATEGORIES.has(b.category))return json({error:'INVALID_FEEDBACK'},400);
   const comment=trim(b.comment,1200),score=b.rating==null?null:Number(b.rating),alias=trim(b.alias,40);
   if(comment.length<8||Number(b.comment?.length)>1200||(score!==null&&(!Number.isInteger(score)||score<1||score>5)))return json({error:'INVALID_FEEDBACK'},400);
   const result=addFeedback.run(now(),visitorHash(b.visitor),b.category,score,comment,alias,langs(b));
   return json({ok:true,receipt:'TF-FB-'+result.lastInsertRowid},201);
  }
  if(path==='/api/support'){
   if(!rate(req,'help',45))return json({error:'HELP_LIMIT'},429);
   const b=await body(req,4500),question=trim(b?.message,550);
   if(question.length<2||Number(b?.message?.length)>550)return json({error:'INVALID_QUESTION'},400);
   const templates=[
    ['mic','Allow microphone permission and tap the large microphone. In automatic mode TriFlow uses Deepgram, with OpenAI transcription as a fallback.'],
    ['language','Choose three different languages in Settings. Speak naturally, including switching mid-sentence. Translation language is selected separately. Accuracy varies.'],
    ['voice','Select Device voice for free local playback, or Studio for curated neural voices. English, Spanish and French are available; use Preview to compare.'],
    ['feedback','Open the Feedback tab here to rate the experience or report a problem. Audio and transcripts are not automatically attached.'],
    ['privacy','Your practice history stays in this browser. Feedback is sent only when you submit it; anonymous usage tracking is opt-in.']
   ];
   const lower=question.toLowerCase();
   const fallback=(templates.find(([k])=>lower.includes(k))||[])[1]||'I can help you configure three languages, start the microphone, select a voice, understand translations, or send feedback. What would you like to do?';
   if(!openai)return json({ok:true,answer:fallback,provider:'local-help'});
   const history=Array.isArray(b.history)?b.history.slice(-6).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').map(x=>({role:x.role,content:x.content.slice(0,400)})):[];
   const system='You are Flow, the helpful, brief, multilingual in-app guide for TriFlow. Reply in the user language. Give actionable tips for selecting three languages, automatic code-switching, microphone permissions, transcription fallback, voice styles, coaching, translation, privacy and feedback. Avoid claiming perfect mixed-language recognition; Deepgram may omit words. You cannot access a user session or change settings yourself. Never request keys or sensitive information. Direct bug reports to the Feedback tab. Keep under 100 words.';
   try{
    const r=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+openai,'content-type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:system},...history,{role:'user',content:question}],max_completion_tokens:220,temperature:0.5}),signal:AbortSignal.timeout(17000)});
    if(!r.ok)return json({ok:true,answer:fallback,provider:'local-help',degraded:true});
    const data=await r.json(),answer=trim(data?.choices?.[0]?.message?.content,1100);
    return json({ok:true,answer:answer||fallback,provider:answer?'openai':'local-help'});
   }catch{return json({ok:true,answer:fallback,provider:'local-help',degraded:true});}
  }
  return json({error:'NOT_FOUND'},404);
 }
 return{handle,db,voices:VOICES};
}
