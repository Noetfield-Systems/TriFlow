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
