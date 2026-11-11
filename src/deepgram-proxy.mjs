/**
 * TriFlow: session-protected, same-origin speech WebSocket bridge.
 * Deepgram API keys are never sent to the browser; the upstream is authorized
 * using the API key directly (independent of /auth/grant permissions).
 * Media payloads are not persisted.
 */
export function createSpeechProxy({env,verify,now=Date.now,makeUpstream=(url,opts)=>new WebSocket(url,opts)}){
 const bucket=new Map(), active=new Map();
 const maxConnections=3, maxConnects=10, windowMs=3600000, maxMs=15*60000, maxBytes=32_000_000;
 const safeSend=(ws,text)=>{try{ws.send(typeof text==='string'?text:JSON.stringify(text));}catch{}};
 const key=()=>String(env.DEEPGRAM_API_KEY||env['Deepgram-api']||'').trim();
 function limited(ip){
  const ts=now();const prev=bucket.get(ip);
  const next=(!prev||prev.until<=ts)?{count:1,until:ts+windowMs}:{...prev,count:prev.count+1};
  bucket.set(ip,next);
  if(bucket.size>3000)for(const [k,v]of bucket)if(v.until<=ts)bucket.delete(k);
  return next.count<=maxConnects;
 }
 const dispose=ws=>{
  const d=ws.data;if(!d||d.disposed)return;d.disposed=true;
  clearTimeout(d.timeout);clearTimeout(d.handshakeTimer);
  active.set(d.ip,Math.max(0,(active.get(d.ip)||1)-1));
  try{d.upstream?.close()}catch{}
 };
 const websocket={
  idleTimeout:90,maxPayloadLength:262144,backpressureLimit:1024*1024,closeOnBackpressureLimit:true,
  open(ws){
   const d=ws.data;
   try{
    const query=new URLSearchParams({model:'nova-3',language:'multi',encoding:'linear16',sample_rate:'16000',channels:'1',interim_results:'true',punctuate:'true',smart_format:'true',endpointing:'450',utterance_end_ms:'1200'});
    for(const hint of d.hints)query.append('language_hint',hint);
    const upstream=makeUpstream('wss://api.deepgram.com/v1/listen?'+query.toString(),{headers:{Authorization:'Token '+key()}});
    d.upstream=upstream;
    d.timeout=setTimeout(()=>{safeSend(ws,{type:'ProviderError',error:'SESSION_TIME_LIMIT'});try{ws.close(1000,'Time limit')}catch{}},maxMs);
    d.handshakeTimer=setTimeout(()=>{if(!d.ready){safeSend(ws,{type:'ProviderError',error:'SPEECH_CONNECT_TIMEOUT'});try{ws.close(1011,'Speech timeout')}catch{}}},12000);
    upstream.addEventListener('open',()=>{
     if(d.disposed)return;
     d.ready=true;clearTimeout(d.handshakeTimer);
     safeSend(ws,{type:'ProxyReady',provider:'deepgram-nova-3-multilingual'});
    });
    upstream.addEventListener('message',e=>{
     if(d.disposed)return;
     try{ws.send(e.data)}catch{}
    });
    upstream.addEventListener('error',()=>{
     if(d.disposed)return;
     safeSend(ws,{type:'ProviderError',error:'DEEPGRAM_UPSTREAM_FAILED'});
     try{ws.close(1011,'Speech provider failed')}catch{}
    });
    upstream.addEventListener('close',e=>{
     if(d.disposed)return;
     if(e.code!==1000){
      safeSend(ws,{type:'ProviderError',error:'DEEPGRAM_UPSTREAM_REJECTED',code:e.code});
     }
     try{ws.close(e.code===1000?1000:1011,'Upstream closed')}catch{}
    });
   }catch(e){
    safeSend(ws,{type:'ProviderError',error:'PROXY_START_FAILED'});
    try{ws.close(1011,'Speech unavailable')}catch{}
   }
  },
  message(ws,message){
   const d=ws.data;if(!d||d.disposed)return;
   const size=typeof message==='string'?message.length:message.byteLength||0;
   if(size>262144){try{ws.close(1009,'Payload too large')}catch{};return;}
   if(typeof message!=='string')d.bytes+=size;
   if(d.bytes>maxBytes){try{ws.close(1000,'Session audio limit')}catch{};return;}
   if(typeof message==='string'&&message.includes('"Finalize"'))safeSend(ws,{type:'ProxyDiagnostics',audioBytes:d.bytes});
   if(!d.ready||d.upstream?.readyState!==1)return;
   try{d.upstream.send(message)}catch{try{ws.close(1011,'Audio forwarding failed')}catch{}}
  },
  close(ws){dispose(ws)},
  drain() {},
  error(ws){dispose(ws)}
 };
 async function upgrade(req,server){
  if(req.method!=='GET')return new Response('Method not allowed',{status:405});
  if(!key())return new Response('Speech provider unavailable',{status:503});
  if(!await verify(req))return new Response('Session required',{status:401});
  const url=new URL(req.url),hints=url.searchParams.getAll('language_hint');
  if(hints.length!==3||new Set(hints).size!==3||hints.some(x=>!(/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(x))))return new Response('Choose exactly three languages',{status:400});
  const ip=String(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'anonymous').slice(0,70);
  if((active.get(ip)||0)>=maxConnections||!limited(ip))return new Response('Speech session limit reached',{status:429});
  const data={ip,hints,bytes:0,ready:false,disposed:false,upstream:null,timeout:null,handshakeTimer:null};
  const success=server.upgrade(req,{data});
  if(success){active.set(ip,(active.get(ip)||0)+1);return undefined}
  return new Response('WebSocket upgrade required',{status:426});
 }
 return{upgrade,websocket};
}
