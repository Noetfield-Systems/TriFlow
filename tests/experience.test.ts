import {describe,it,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExperienceApi} from '../src/experience.mjs';
const dir=mkdtempSync(join(tmpdir(),'triflow-exp-'));
const env={TRIFLOW_DATA_DIR:dir,SESSION_SECRET:'a-long-unique-test-secret',TRIFLOW_ADMIN_TOKEN:'private-admin-test-token', 'Deepgram-api':'mock-dg', 'OpenAI-API':'mock-openai'};
const fakeAudio=new Uint8Array(1400);fakeAudio[0]=0xff;fakeAudio[1]=0xfb;
const calls=[];
const fakeFetch=async(url,opts)=>{
 calls.push({url,headers:opts.headers,body:opts.body});
 if(url.includes('deepgram.com'))return new Response(fakeAudio,{status:200,headers:{'content-type':'audio/mpeg'}});
 if(url.includes('openai.com'))return Response.json({choices:[{message:{content:'Open Settings, choose your three languages, and tap the microphone.'}}]});
 return new Response('not found',{status:404});
};
const s=createExperienceApi({env,fetchImpl:fakeFetch});
const url='https://triflow.test';
const headers={'content-type':'application/json'};
const req=(path,obj)=>new Request(url+path,{method:'POST',headers,body:JSON.stringify(obj)});
const validId='f4a5b6c7d8e9f001';
describe('TriFlow experience and feedback',()=>{
 it('does not expose provider keys or admin token in public config',async()=>{
  const r=await s.handle(new Request(url+'/api/experience/config'));
  const text=await r.text();expect(r.status).toBe(200);expect(text).not.toContain('mock-dg');expect(text).not.toContain('private-admin-test-token');
  const j=JSON.parse(text);expect(j.voiceCatalog.fr.some(x=>x[1]==='flux-camille-fr')).toBe(true);
 });
 it('refuses feedback and premium voice without signed session',async()=>{
  expect((await s.handle(req('/api/feedback',{visitor:validId,category:'idea',comment:'Please add a new voice'}))).status).toBe(401);
  expect((await s.handle(req('/api/voice',{language:'en',voice:'hannah',text:'Hello'}))).status).toBe(401);
 });
 it('stores feedback but rejects invalid or too-short submissions',async()=>{
  const r=await s.handle(req('/api/feedback',{visitor:validId,category:'voice',rating:4,alias:'Monse',comment:'A little more emotion in French, please!',languages:['en','es','fr']}),{sessionReady:true});
  expect(r.status).toBe(201);expect((await r.json()).receipt.startsWith('TF-FB-')).toBe(true);
  const bad=await s.handle(req('/api/feedback',{visitor:validId,category:'bug',comment:'bad'}),{sessionReady:true});
  expect(bad.status).toBe(400);
 });
 it('tracks only explicit opt-in and aggregates founder metrics',async()=>{
  const deny=await s.handle(req('/api/events',{visitor:validId,event:'app_open',consent:false}),{sessionReady:true});
  expect(deny.status).toBe(400);
  const okay=await s.handle(req('/api/events',{visitor:validId,event:'app_open',consent:true,languages:['en','es','fr']}),{sessionReady:true});
  expect(okay.status).toBe(200);
  const unauthorized=await s.handle(new Request(url+'/api/admin/insights',{headers:{authorization:'Bearer wrong'}}));
  expect(unauthorized.status).toBe(401);
  const admin=await s.handle(new Request(url+'/api/admin/insights',{headers:{authorization:'Bearer private-admin-test-token'}}));
  const result=await admin.json();expect(result.overview.events).toBe(1);expect(result.overview.visitors).toBe(1);expect(result.feedback[0].alias).toBe('Monse');
  expect(JSON.stringify(result)).not.toContain(validId);
 });
 it('fetches allowlisted studio voice with server-held Deepgram credentials',async()=>{
  const r=await s.handle(req('/api/voice',{language:'fr',voice:'camille',text:'Bonjour, Monse!',speed:1}),{sessionReady:true});
  expect(r.status).toBe(200);expect(r.headers.get('content-type')).toBe('audio/mpeg');
  expect(calls.at(-1).url).toContain('model=flux-camille-fr');
  expect(calls.at(-1).headers.Authorization).toBe('Token mock-dg');
  const invalid=await s.handle(req('/api/voice',{language:'fa',text:'Hello'}),{sessionReady:true});
  expect(invalid.status).toBe(400);
 });
 it('provides contextual Flow AI support without exposing credential',async()=>{
  const r=await s.handle(req('/api/support',{message:'How do I change my three languages?'}),{sessionReady:true});
  expect(r.status).toBe(200);const answer=await r.json();expect(answer.answer).toContain('Open Settings');
  expect(JSON.stringify(answer)).not.toContain('mock-openai');
 });
});
