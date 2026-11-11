// Real external-provider acceptance using a generated multilingual PCM16 fixture.
// Provider calls cost money; only run on explicitly marked commits, not every push.
import {readFile,writeFile} from 'node:fs/promises';
const url='https://triflow-app-production.up.railway.app';
const time=ms=>new Promise(r=>setTimeout(r,ms));
const report={scenario:'synthetic English-Spanish-French voice in ONE continuous stream',checked:new Date().toISOString(),websocketOpen:false,providerReady:false,transcript:'',languages:[],translation:'',openaiTranscript:'',allCandidates:[],errors:[],forwardedBytes:0};
const session=await fetch(url+'/api/session',{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'});
if(!session.ok)throw Error('Session HTTP '+session.status);
const cookie=(session.headers.get('set-cookie')||'').split(';')[0];
const audio=new Uint8Array(await readFile('/tmp/triflow-mixed.pcm'));
if(audio.length<10000)throw Error('Fixture too short');
const wsUrl=url.replace(/^https:/,'wss:')+'/api/ws/stream?language_hint=en&language_hint=es&language_hint=fr';
const ws=new WebSocket(wsUrl,{headers:{Origin:url,Cookie:cookie}});
let isReady=false,ended=false;
const finalTexts=[],languageTags=new Set();
const received=[];
let errorResolve;
const failure=new Promise(resolve=>{errorResolve=resolve});
ws.addEventListener('open',()=>{report.websocketOpen=true});
ws.addEventListener('error',()=>{report.errors.push('websocket-error');errorResolve()});
ws.addEventListener('close',e=>{if(!ended){report.errors.push('websocket-closed-'+e.code);errorResolve();}});
ws.addEventListener('message',e=>{
 try{
  const x=JSON.parse(e.data);
  if(x.type==='ProxyReady'){isReady=true;report.providerReady=true;return;}
  if(x.type==='ProxyDiagnostics'){report.forwardedBytes=Number(x.audioBytes)||0;return;}
  if(x.type==='ProviderError'){report.errors.push(x.error);errorResolve();return;}
  if(x.type!=='Results')return;
  const alt=x.channel?.alternatives?.[0];if(!alt)return;
  if(alt.transcript){report.allCandidates.push({text:alt.transcript,final:Boolean(x.is_final),speechFinal:Boolean(x.speech_final)});if(x.is_final)finalTexts.push(alt.transcript);}
  const langs=alt.languages||[];
  for(const lang of langs)languageTags.add(String(lang).split('-')[0]);
  for(const word of alt.words||[])if(word.language)languageTags.add(String(word.language).split('-')[0]);
 }catch(e){report.errors.push('result-json-parse-error')}
});
for(let i=0;i<180&&!isReady;i++){if(report.errors.length)break;await time(100)}
if(!isReady)throw Error('Provider failed to accept multilingual stream: '+report.errors.join(','));
for(let i=0;i<audio.length;i+=3200){
  ws.send(audio.slice(i,i+3200));
  await time(100);
}
ws.send(JSON.stringify({type:'Finalize'}));
await Promise.race([time(6000),failure]);
ended=true;
try{ws.close(1000,'Test complete')}catch{}
report.transcript=finalTexts.join(' ').trim();
report.languages=[...languageTags];
// Control: run the complete 3-language audio through an independent real STT provider.
const wav=Buffer.alloc(44+audio.length);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(audio.length,40);Buffer.from(audio).copy(wav,44);
try{const openai=await fetch(url+'/api/transcribe',{method:'POST',headers:{Origin:url,Cookie:cookie,'content-type':'audio/wav','x-triflow-languages':'en,es,fr'},body:wav,signal:AbortSignal.timeout(30000)});const text=await openai.json().catch(()=>({}));report.openaiTranscript=String(text.text||'');report.openaiStatus=openai.status;}catch(e){report.errors.push('OpenAI full-clip comparison failed')}
if(report.transcript.length>=6){
 const response=await fetch(url+'/api/turn',{method:'POST',headers:{Origin:url,Cookie:cookie,'content-type':'application/json'},body:JSON.stringify({languages:['en','es','fr'],target:'en',mode:'interpreter',text:report.transcript}),signal:AbortSignal.timeout(26000)});
 const result=await response.json().catch(()=>({}));report.translation=String(result.translation||'');report.translationStatus=response.status;
}
await writeFile('/tmp/triflow-live-voice-proof.json',JSON.stringify(report,null,2));
console.log('TRIFLOW_LIVE_VOICE_PROOF',JSON.stringify(report));
if(!report.providerReady)throw Error('Deepgram live stream not connected');
if(report.transcript.length<6)throw Error('No intelligible speech transcript from generated multilingual audio');
if(report.translation.length<6)throw Error('Transcript was not translated by active AI');
if(report.languages.filter(x=>['en','es','fr'].includes(x)).length<2)throw Error('Language-level evidence did not cover at least two of the three fixture languages');
