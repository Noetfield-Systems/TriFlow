import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../src/handler.mjs';
const origin='https://triflow.example';
function app(env={},fetchImpl=async()=>Response.json({})) {
 return createHandler({env:{SESSION_SECRET:'test-secret-longer-than-thirty-two-bytes',...env},fetchImpl});
}
async function request(h,path,method='GET',body={},headers={}) {
 return h(new Request(origin+path,{method,headers:{origin,'content-type':'application/json',...headers},body:method==='POST'?JSON.stringify(body):undefined}));
}
async function signedCookie(h){const r=await request(h,'/api/session','POST');assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
test('public access ignores legacy invitation gate and does not expose secrets',async()=>{
 const h=app({APP_ACCESS_CODE:'legacy',OPENAI_API_KEY:'key-secret'});const cfg=await request(h,'/api/config');const str=await cfg.text();assert.equal(JSON.parse(str).accessCodeRequired,false);assert.doesNotMatch(str,/key-secret|legacy/);await signedCookie(h);
});
test('unconfigured streaming speech and translation fail accurately',async()=>{
 const h=app();const cookie=await signedCookie(h);const headers={cookie};assert.equal((await request(h,'/api/stt-token','POST',{},headers)).status,503);assert.equal((await request(h,'/api/turn','POST',{},headers)).status,503);
});
test('sessions are signed, origin-protected and not forgeable',async()=>{
 const h=app({DEEPGRAM_API_KEY:'dg-test'});const cookie=await signedCookie(h);
 assert.equal((await request(h,'/api/stt-token','POST',{}, {cookie:'triflow_session=forged.invalid'})).status,401);
 assert.equal((await request(h,'/api/session','POST',{}, {origin:'https://other.example'})).status,403);
 assert.equal((await request(h,'/api/stt-token','POST',{}, {cookie})).status,502);
});
test('multilingual AI contract preserves translations, language tags and coaching',async()=>{
 const fetchImpl=async(url,init)=>Response.json({success:true,result:{response:JSON.stringify({translation:'We can talk tomorrow.',reply:'Oui, avec plaisir!',replyLanguage:'fr',detectedLanguages:['en','es','fr'],note:'Use a softer ending.',suggestedPhrase:'Could we talk tomorrow?'})}});
 const h=app({CF_ACCOUNT_ID:'example',CF_AI_API_TOKEN:'not-public'},fetchImpl);const cookie=await signedCookie(h);
 const input={languages:['en','es','fr'],target:'en',text:'I think que podemos parler demain',mode:'coach'};
 const r=await request(h,'/api/turn','POST',input,{cookie});assert.equal(r.status,200);
 const j=await r.json();assert.equal(j.translation,'We can talk tomorrow.');assert.equal(j.replyLanguage,'fr');assert.deepEqual(j.detectedLanguages,['en','es','fr']);
 const invalid=await request(h,'/api/turn','POST',{...input,languages:['en','en','fr']},{cookie});assert.equal(invalid.status,400);
});
test('CSP protects served client assets',async()=>{
 const h=createHandler({env:{},assets:{'/index.html':'<main>TriFlow</main>'}});
 const r=await request(h,'/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/object-src 'none'/);
});

test('Railway screenshot variable names activate both real providers without exposing credentials', async()=>{
 const seen=[];
 const fetchImpl=async(url,init)=>{
   seen.push({url,authorization:init.headers.Authorization});
   if(url.includes('deepgram.com'))return Response.json({access_token:'eyFakeDeepgramEphemeralToken',expires_in:30});
   if(url.includes('openai.com'))return Response.json({choices:[{message:{content:JSON.stringify({
     translation:'I think we can talk tomorrow.',reply:'Oui, demain !',
     replyLanguage:'fr',detectedLanguages:['en','es','fr'],note:'',suggestedPhrase:''
   })}}]});
   throw Error('Unexpected provider');
 };
 const h=app({'Deepgram-api':'fake-dg-secret','OpenAI-API':'fake-openai-secret'},fetchImpl);
 const publicConfig=await (await request(h,'/api/config')).text();
 assert.equal(JSON.parse(publicConfig).speechReady,true);
 assert.equal(JSON.parse(publicConfig).aiReady,true);
 assert.doesNotMatch(publicConfig,/fake-dg-secret|fake-openai-secret/);
 const cookie=await signedCookie(h);
 const t=await request(h,'/api/stt-token','POST',{}, {cookie});
 assert.equal(t.status,200);assert.equal((await t.json()).access_token,'eyFakeDeepgramEphemeralToken');
 const input={languages:['en','es','fr'],target:'en',text:'I think que podemos parler demain',mode:'conversation'};
 const r=await request(h,'/api/turn','POST',input,{cookie});
 assert.equal(r.status,200);const output=await r.json();
 assert.deepEqual(output.detectedLanguages,['en','es','fr']);
 assert.equal(output.translation,'I think we can talk tomorrow.');
 assert.equal(seen[0].authorization,'Token fake-dg-secret');
 assert.equal(seen[1].authorization,'Bearer fake-openai-secret');
});

test('OpenAI transcription fallback verifies actual uploaded audio body and returns spoken words', async()=>{
 let checked=false;
 const mock=async(url,init)=>{
  assert.match(url,/\/v1\/audio\/transcriptions$/);
  assert.equal(init.headers.Authorization,'Bearer staging-test-value');
  assert.equal(init.body.get('model'),'gpt-transcribe');
  assert.equal(init.body.get('file').name,'triflow-audio.webm');
  checked=true;return Response.json({text:'I think que podemos parler demain'});
 };
 const h=app({'OpenAI-API':'staging-test-value'},mock);
 const config=await (await request(h,'/api/config')).json();assert.equal(config.openAITranscribeReady,true);
 const cookie=await signedCookie(h);
 const r=await h(new Request(origin+'/api/transcribe',{method:'POST',headers:{origin,cookie,'content-type':'audio/webm'},body:new Uint8Array(2000)}));
 assert.equal(r.status,200);assert.equal((await r.json()).text,'I think que podemos parler demain');assert.equal(checked,true);
 const bad=await h(new Request(origin+'/api/transcribe',{method:'POST',headers:{origin,cookie,'content-type':'text/plain'},body:new Uint8Array(2000)}));assert.equal(bad.status,415);
});
test('Deepgram credential rejection gives a clear diagnostic and never returns secret',async()=>{
 const h=app({'Deepgram-api':'test-secret'},async()=>new Response('unauthorized',{status:401}));
 const ck=await signedCookie(h);
 const r=await request(h,'/api/stt-token','POST',{}, {cookie:ck});
 assert.equal(r.status,502);const body=await r.text();assert.match(body,/SPEECH_CREDENTIAL_REJECTED/);assert.doesNotMatch(body,/test-secret/);
});
