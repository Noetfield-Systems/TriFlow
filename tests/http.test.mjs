import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const port = 43897; const origin='http://127.0.0.1:'+port;
const server=spawn('bun',['index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),SESSION_SECRET:'ci-reproducible-test-secret-at-least-32-bytes',DEEPGRAM_API_KEY:'',CF_ACCOUNT_ID:'',CF_AI_API_TOKEN:'',OPENAI_API_KEY:'',APP_ACCESS_CODE:'ignored'},stdio:'ignore'});
server.unref();
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(origin+'/api/health');if(r.ok)return;}catch{}await delay(100);}throw Error('Bun server did not start within 6 seconds');}
test('Public app and keyless operation',async()=>{
 await ready();
 const page=await fetch(origin+'/');assert.equal(page.status,200);assert.match(await page.text(),/TriFlow/i);
 const cfg=await (await fetch(origin+'/api/config')).json();assert.equal(cfg.accessCodeRequired,false);assert.equal(cfg.speechReady,false);assert.equal(cfg.aiReady,false);
 const session=await fetch(origin+'/api/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
 assert.equal(session.status,200);assert.match(session.headers.get('set-cookie'),/HttpOnly/);
 const cookie=session.headers.get('set-cookie').split(';')[0];
 const stt=await fetch(origin+'/api/stt-token',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:'{}'});
 assert.equal(stt.status,503);
 const illegal=await fetch(origin+'/api/session',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});
 assert.equal(illegal.status,403);
 for(const path of ['/privacy','/terms']){const r=await fetch(origin+path);assert.equal(r.status,200);assert.match(await r.text(),/TriFlow/);}
 const source=await fetch(origin+'/app.js');assert.equal(source.status,200);assert.match(source.headers.get('content-security-policy'),/object-src 'none'/);
});
test.after(()=>{if(server.exitCode===null)server.kill('SIGTERM');});
