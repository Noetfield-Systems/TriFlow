/** TriFlow browser client — streaming code-switching transcription and language AI. */
const LANGUAGES = [
 ['en','English','🇬🇧','en-US'],['es','Spanish','🇪🇸','es-ES'],['fr','French','🇫🇷','fr-FR'],['fa','Persian','🇮🇷','fa-IR'],
 ['de','German','🇩🇪','de-DE'],['it','Italian','🇮🇹','it-IT'],['pt','Portuguese','🇵🇹','pt-PT'],['ar','Arabic','🇸🇦','ar-SA'],
 ['zh','Chinese','🇨🇳','zh-CN'],['ja','Japanese','🇯🇵','ja-JP'],['ko','Korean','🇰🇷','ko-KR'],['hi','Hindi','🇮🇳','hi-IN'],
 ['ru','Russian','🇷🇺','ru-RU'],['tr','Turkish','🇹🇷','tr-TR'],['nl','Dutch','🇳🇱','nl-NL'],['sv','Swedish','🇸🇪','sv-SE'],
 ['pl','Polish','🇵🇱','pl-PL'],['uk','Ukrainian','🇺🇦','uk-UA'],['vi','Vietnamese','🇻🇳','vi-VN'],['id','Indonesian','🇮🇩','id-ID'],
 ['th','Thai','🇹🇭','th-TH'],['he','Hebrew','🇮🇱','he-IL'],['el','Greek','🇬🇷','el-GR'],['ro','Romanian','🇷🇴','ro-RO'],
 ['da','Danish','🇩🇰','da-DK'],['no','Norwegian','🇳🇴','nb-NO'],['fi','Finnish','🇫🇮','fi-FI'],['cs','Czech','🇨🇿','cs-CZ'],
 ['hu','Hungarian','🇭🇺','hu-HU'],['bg','Bulgarian','🇧🇬','bg-BG'],['hr','Croatian','🇭🇷','hr-HR'],['sk','Slovak','🇸🇰','sk-SK'],
 ['sl','Slovenian','🇸🇮','sl-SI'],['sr','Serbian','🇷🇸','sr-RS'],['ms','Malay','🇲🇾','ms-MY'],['tl','Tagalog','🇵🇭','fil-PH'],
 ['ta','Tamil','🇮🇳','ta-IN'],['te','Telugu','🇮🇳','te-IN'],['bn','Bengali','🇧🇩','bn-BD']
];
const CONFIG_KEY='triflow_settings_v1',SESSIONS_KEY='triflow_sessions_v1',PHRASES_KEY='triflow_phrases_v1';
const $=id=>document.getElementById(id);
const byCode=Object.fromEntries(LANGUAGES.map(([code,name,flag,locale])=>[code,{name,flag,locale}]));
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const store=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('Device storage is unavailable. Export your session to keep it.');}};
const defaults={languages:['en','es','fr'],target:'en',replyPreference:'auto',mode:'conversation',speakReplies:true,livePreviews:true,voiceSpeed:0.96,speechEngine:'auto',freeLanguage:'en',voiceEngine:'device',voiceProfiles:{en:'hannah',es:'valentina',fr:'camille'},deviceVoices:{},telemetryConsent:false};
const parsed=load(CONFIG_KEY,{});
const state={settings:{...defaults,...parsed},config:{speechReady:false,aiReady:false,accessCodeRequired:false},experience:{neuralVoicesReady:false,voiceCatalog:{},helpReady:false,feedbackReady:false},sessionReady:false,streaming:false,starting:false,speaking:false, socket:null,browserSpeech:null,activeSpeechProvider:null,stream:null,audioContext:null,sourceNode:null,processor:null,minuteTicker:null,keepAlive:null,startedAt:0,sessionId:crypto.randomUUID(),history:[],currentText:'',translatedText:'',lastSource:'',lastTranslation:'',partialTimer:null,previewSerial:0,turnQueue:Promise.resolve(),lastPreviewText:'',uncommitted:[],lastFinalAt:0,stopRequested:false,fallingBack:false,openaiRecorder:null,openaiTimer:null,openaiQueue:Promise.resolve(),view:'live',wordLanguages:[],sampleActive:false};
const trim=x=>String(x||'').trim();
let toastTimer;
function toast(message){const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),4200);}
function make(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function languageName(code){return byCode[code]?.name||code;}
function assertSettings(){const l=state.settings.languages;if(!Array.isArray(l)||l.length!==3||new Set(l).size!==3||l.some(c=>!byCode[c]))state.settings.languages=defaults.languages.slice();if(!state.settings.languages.includes(state.settings.target))state.settings.target=state.settings.languages[0];if(!['auto',...state.settings.languages].includes(state.settings.replyPreference))state.settings.replyPreference='auto';if(!['conversation','interpreter','coach'].includes(state.settings.mode))state.settings.mode='conversation';if(![0.82,0.96,1.1].includes(Number(state.settings.voiceSpeed)))state.settings.voiceSpeed=0.96;if(!['auto','browser','deepgram','accurate'].includes(state.settings.speechEngine))state.settings.speechEngine='auto';if(!['device','studio'].includes(state.settings.voiceEngine))state.settings.voiceEngine='device';if(!state.settings.voiceProfiles||typeof state.settings.voiceProfiles!=='object')state.settings.voiceProfiles={};if(!state.settings.deviceVoices||typeof state.settings.deviceVoices!=='object')state.settings.deviceVoices={};if(typeof state.settings.telemetryConsent!=='boolean')state.settings.telemetryConsent=false;if(!state.settings.languages.includes(state.settings.freeLanguage))state.settings.freeLanguage=state.settings.languages[0];}
function settingsChange(){assertSettings();store(CONFIG_KEY,state.settings);renderLanguages();renderMode();renderVoicePicker();trackTelemetry('setting_changed');}
function populateSelect(select,codes,selected){select.replaceChildren();for(const code of codes){const data=byCode[code];if(!data)continue;const opt=new Option(`${data.flag}  ${data.name}`,code);select.add(opt);}select.value=selected;}
function renderLanguages(){const {languages,target}=state.settings;const rail=$('languageRail'),side=$('sidebarLanguages');rail.replaceChildren();side.replaceChildren();languages.forEach((code,i)=>{const d=byCode[code];const chip=make('span','lang-chip');chip.append(make('span','chip-flag',d.flag),document.createTextNode(d.name));rail.append(chip);if(i<2)rail.append(make('span','lang-join','↔'));const row=make('div','sidebar-lang');row.append(make('span','language-dot'),document.createTextNode(d.name));side.append(row);});populateSelect($('targetLanguage'),languages,target);$('lang1').value=languages[0];$('lang2').value=languages[1];$('lang3').value=languages[2];populateReply();renderFreeLanguageControls();}
function populateReply(){const select=$('replyPreference');select.replaceChildren(new Option('Follow my language automatically','auto'));for(const code of state.settings.languages)select.add(new Option(`${byCode[code].flag} Speak ${byCode[code].name}`,code));select.value=state.settings.replyPreference;}
function renderMode(){document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===state.settings.mode));const explanations={conversation:'Your AI companion replies naturally in your language.',interpreter:'Faithful translation without extra AI conversation.',coach:'Practice freely and get gentle, useful language tips.'};$('modeHint').textContent=explanations[state.settings.mode];}
function showView(view){if(state.streaming&&view!=='live')stopAudio().catch(()=>{});state.view=view;['live','history','phrases'].forEach(name=>{$(name+'View').hidden=name!==view;});$('viewBreadcrumb').textContent=({live:'LIVE STUDIO',history:'SESSIONS',phrases:'SAVED PHRASES'})[view];document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));if(view==='history')renderSessions();if(view==='phrases')renderPhrases();window.scrollTo({top:0,behavior:'smooth'});}
function browserMicAvailable(){return Boolean(window.SpeechRecognition||window.webkitSpeechRecognition);}
function useBrowserSpeech(){return state.settings.speechEngine==='browser'||(state.settings.speechEngine==='auto'&&!state.config.speechReady&&!state.config.openAITranscribeReady);}
function renderFreeLanguageControls(){const bar=$('freeLanguageControls');if(!bar)return;bar.replaceChildren();bar.hidden=!useBrowserSpeech();if(bar.hidden)return;
 const label=make('span','free-language-label','FREE MIC · SPEAKING LANGUAGE');bar.append(label);
 for(const code of state.settings.languages){const d=byCode[code],b=make('button','free-language-btn'+(state.settings.freeLanguage===code?' selected':''),`${d.flag} ${d.name}`);b.type='button';b.addEventListener('click',()=>{state.settings.freeLanguage=code;settingsChange();if(state.browserSpeech&&state.streaming)try{state.browserSpeech.stop();}catch{};toast(`Browser listening language: ${d.name}. To switch again, tap a language.`);});bar.append(b);}
}
function renderConfig(){const {speechReady,aiReady}=state.config;const browser=browserMicAvailable(),listeningAvailable=speechReady||state.config.openAITranscribeReady||browser;const ready=listeningAvailable;const advanced=(speechReady||state.config.openAITranscribeReady)&&!useBrowserSpeech();$('providerIndicator').classList.toggle('good',ready);
 $('providerLabel').textContent=advanced?(aiReady?'Multilingual engine configured · AI ready':'Multilingual speech configured · AI unavailable'):browser?(aiReady?'Free microphone + AI connected':'Free microphone · limited mode'):'Voice not supported on this browser';
 const claim=document.querySelector('.live-stats .stat-muted');if(claim)claim.textContent=advanced?'Automatic language switching':'Automatic with multilingual provider';
 $('setupNotice').hidden=advanced&&aiReady;
 const msg=!speechReady&&!state.config.openAITranscribeReady?browser?'Free browser microphone is available. Select each language when speaking; automatic mid-sentence language switching needs the multilingual provider. AI translation needs Cloudflare Workers AI, OpenAI or a compatible on-device Translator.':'This browser does not support speech recognition. You can type, or use a browser with Web Speech API support.':aiReady?(speechReady?'Deepgram is configured; we verify it when you start. If its connection fails, OpenAI automatically handles speech in short segments.':'Automatic multilingual OpenAI microphone is available; translations update every few seconds.'):'Automatic speech is configured, but AI translation needs Cloudflare Workers AI (SourceB pattern) or OpenAI.';
 $('setupNoticeText').textContent=msg;renderFreeLanguageControls();const line=$('voiceProviderDescription');if(line)line.textContent=useBrowserSpeech()?'Voice: browser speech recognition (free, one selected language at a time) · Playback: device voice':!speechReady&&state.config.openAITranscribeReady?'Voice: automatic multilingual transcription in short segments (OpenAI) · Playback: device voice':'Voice: automatic three-language recognition, OpenAI fallback available · Playback: device voice';
}
async function api(path,body){let r;try{r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body??{})});}catch{throw Error('Network unavailable. Check your connection.');}let data;try{data=await r.json();}catch{throw Error('Invalid response from server.');}if(!r.ok){if(data.error==='SESSION_REQUIRED'){state.sessionReady=false;await initSession();throw Error('Your session expired. Please retry.');}const errMap={AI_NOT_CONFIGURED:'Connect Cloudflare Workers AI or OpenAI to translate and chat.',SPEECH_NOT_CONFIGURED:'Automatic code-switching needs a multilingual speech provider. Select Free microphone while it is being configured.',HOURLY_LIMIT_REACHED:'Usage limit reached. Come back later.',RATE_LIMITED:'Too many requests. Please try later.',UPSTREAM_TIMEOUT:'Language service timed out. Please retry.',AI_RATE_LIMIT:'AI service is busy. Try again shortly.',INVALID_TURN:'Invalid language settings or text.'};throw Error(errMap[data.error]||data.error||'Something went wrong.');}return data;}
async function initSession(){try{await api('/api/session',{});state.sessionReady=true;return true;}catch(e){toast(e.message);return false;}}
async function initialize(){assertSettings();for(const id of ['lang1','lang2','lang3'])populateSelect($(id),LANGUAGES.map(x=>x[0]),state.settings.languages[Number(id.at(-1))-1]);renderLanguages();renderMode();$('speakReplies').checked=state.settings.speakReplies;$('livePreviews').checked=state.settings.livePreviews;buildWaveform();try{const r=await fetch('/api/config');if(!r.ok)throw Error('Configuration unavailable');state.config=await r.json();renderConfig();await initSession();}catch(e){toast(e.message);$('setupNotice').hidden=false;$('setupNoticeText').textContent='Unable to reach the application API.';}registerEvents();initializeExperience().catch(err=>console.warn('Experience features unavailable:',err.message));if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});}
function buildWaveform(){const wave=$('waveform');for(let i=0;i<32;i++){const bar=make('i');bar.style.height= `${7+(i%7)*3}px`;wave.append(bar);}}
function setWave(level){const amount=Math.min(1,Math.max(0,level*9));[...$('waveform').children].forEach((bar,i)=>{const v=Math.abs(Math.sin(i*.54+performance.now()*.002));bar.style.height=`${7+Math.round(v*amount*39)}px`;bar.style.opacity=String(.45+amount*.55);});}
function setMicState(kind,label,sub){$('sessionState').className='session-state'+(kind==='active'?' active':kind==='error'?' error':'');$('sessionState').lastChild.textContent=' '+(kind==='active'?'Listening':kind==='error'?'Needs attention':'Ready to begin');$('voiceStatus').textContent=label;$('voiceHint').textContent=sub;$('micButton').classList.toggle('live',kind==='active');$('micIcon').textContent=kind==='active'?'■':'♬';$('micButton').setAttribute('aria-label',kind==='active'?'Stop microphone session':'Start microphone session');}
function showTranscript(text,pending=false){state.currentText=text;const el=$('sourceText');el.textContent=trim(text)||'Your words will appear here as you speak, even when you switch languages mid-sentence.';el.classList.toggle('has-content',Boolean(trim(text)));$('detectedPill').textContent=pending?'LISTENING…':trim(text)?'CAPTURED':'AUTO-DETECT';}
function showTranslation(text,subtitle){state.translatedText=text;const el=$('translatedText');el.textContent=trim(text)||'The meaning, beautifully preserved.';$('translationMeta').textContent=subtitle||'Live translation appears when you begin speaking.';}
/** Render word-level language evidence without ever interpreting transcript text as HTML. */
function renderLanguageEvidence(words=[], detected=[]) {
 const box=$('languageEvidence');box.replaceChildren();box.append(make('span','evidence-caption','LANGUAGE FLOW'));
 const list=[];for(const w of words){const code=String(w?.language||'').split('-')[0];if(!byCode[code])continue;let prev=list.at(-1);if(prev?.code===code)prev.count++;else list.push({code,count:1});}
 if(!list.length){for(const code of detected){const c=String(code).split('-')[0];if(byCode[c]&&!list.some(x=>x.code===c))list.push({code:c,count:0});}}
 if(!list.length){box.append(make('span','evidence-placeholder','Language shifts appear here in real time'));return;}
 for(const item of list.slice(-12)){const tag=make('span','evidence-language');tag.dataset.language=item.code;tag.append(make('span','evidence-pip'),document.createTextNode(languageName(item.code)+(item.count?' · '+item.count+' words':'')));box.append(tag);}
}
const CHALLENGE = {
 languages:['en','es','fr'], source:"I think que podemos parler demain, if that works for you.",
 translations:{en:'I think we can talk tomorrow, if that works for you.',es:'Creo que podemos hablar mañana, si te viene bien.',fr:'Je pense que nous pouvons parler demain, si cela te convient.'},
 words:[{word:'I',language:'en'},{word:'think',language:'en'},{word:'que',language:'es'},{word:'podemos',language:'es'},{word:'parler',language:'fr'},{word:'demain',language:'fr'},{word:'if',language:'en'},{word:'that',language:'en'},{word:'works',language:'en'}]
};
function runSampleChallenge(){
 if(state.streaming){toast('Finish your microphone session before previewing the sample.');return;}
 state.sampleActive=true;showTranscript(CHALLENGE.source);renderLanguageEvidence(CHALLENGE.words);
 const target=state.settings.target;const value=CHALLENGE.translations[target];
 if(value){showTranslation(value,'INTERACTIVE SAMPLE · no AI request or microphone used');state.lastSource=CHALLENGE.source;state.lastTranslation=value;}else{state.lastSource='';state.lastTranslation='';showTranslation('Choose English, Spanish or French in Settings for this sample.','INTERACTIVE SAMPLE · not a real AI translation');}
 $('detectedPill').textContent='EN · ES · FR';$('sampleChallenge').classList.add('sample-complete');
 toast('Sample preview: one sentence, three languages, no manual switching.');
}
function startBrowserRecognizer(){const Constructor=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Constructor)return false;const recognition=new Constructor();const code=state.settings.freeLanguage;
 recognition.lang=byCode[code]?.locale||'en-US';recognition.interimResults=true;recognition.continuous=true;recognition.maxAlternatives=1;
 recognition.onresult=event=>{if(!state.streaming||state.activeSpeechProvider!=='browser')return;let pending='';for(let i=event.resultIndex;i<event.results.length;i++){const item=event.results[i];const text=trim(item[0]?.transcript);if(!text)continue;if(item.isFinal){showTranscript(text);state.lastSource=text;$('detectedPill').textContent=languageName(code).toUpperCase()+' · BROWSER';renderLanguageEvidence([{language:code,word:text}]);queueTurn(text,false);}else pending+=' '+text;}if(trim(pending))showTranscript(trim(pending),true);};
 recognition.onerror=event=>{if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){toast('Microphone was denied or unavailable. Check browser permission.');stopAudio().catch(()=>{});}else if(event.error!=='no-speech')toast('Browser speech recognition: '+event.error);};
 recognition.onend=()=>{if(!state.streaming||state.stopRequested||state.activeSpeechProvider!=='browser')return;state.browserSpeech=null;setTimeout(()=>{if(state.streaming&&!state.stopRequested&&state.activeSpeechProvider==='browser')try{startBrowserRecognizer();}catch{stopAudio().catch(()=>{});}},200);};
 state.browserSpeech=recognition;recognition.start();return true;
}
async function startBrowserAudio(){if(!browserMicAvailable()){toast('This browser does not offer speech recognition. Try Chrome or Safari, or type below.');return;}if(!state.sessionReady&&!await initSession())return;
 state.starting=true;state.stopRequested=false;state.activeSpeechProvider='browser';state.streaming=true;state.sampleActive=false;state.startedAt=Date.now();setMicState('ready','Starting free microphone…','Browser recognition: one selected language at a time.');
 try{startBrowserRecognizer();state.minuteTicker=setInterval(()=>{const seconds=Math.floor((Date.now()-state.startedAt)/1000);$('sessionTimer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;if(seconds>=15*60){toast('Free session complete. You can start another.');stopAudio().catch(()=>{});}},1000);
 setMicState('active',`Listening in ${languageName(state.settings.freeLanguage)}`,'To change languages in free mode, tap a language pill. Automatic code-switching needs the multilingual engine.');}
 catch(e){toast('Browser microphone error: '+e.message);await stopAudio();}
 finally{state.starting=false;}
}
function getDeepgramUrl(){const q=new URLSearchParams({model:'nova-3',language:'multi',encoding:'linear16',sample_rate:'16000',channels:'1',interim_results:'true',punctuate:'true',smart_format:'true',endpointing:'450',utterance_end_ms:'1200'});for(const c of state.settings.languages)q.append('language_hint',c);return `wss://api.deepgram.com/v1/listen?${q}`;}
async function startAudio(){if(state.starting||state.streaming)return;if(state.settings.speechEngine==='accurate')return startOpenAIAudio();if(useBrowserSpeech())return startBrowserAudio();if(!state.config.speechReady){if(state.config.openAITranscribeReady)return startOpenAIAudio();toast('Automatic three-language recognition is not configured. Choose Free browser mode.');return;}if(!state.sessionReady){if(!await initSession())return;}if(!navigator.mediaDevices?.getUserMedia||!window.AudioWorkletNode){toast('This browser does not support live microphone audio. Use Chrome or Safari over HTTPS.');return;}
 state.starting=true;state.stopRequested=false;setMicState('ready','Connecting securely…','Preparing your multilingual stream');$('micButton').disabled=true;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});state.stream=stream;
  const upstreamUrl=new URL(getDeepgramUrl());const secure=location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(secure+'//'+location.host+'/api/ws/stream'+upstreamUrl.search);
  socket.binaryType='arraybuffer';state.socket=socket;
  // Wait for Deepgram itself, not merely the Railway proxy, to accept the stream.
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Multilingual speech provider timed out.')),14000);
    const settle=(error)=>{clearTimeout(timer);socket.removeEventListener('message',message);socket.removeEventListener('error',failed);socket.removeEventListener('close',closed);error?reject(error):resolve();};
    const message=event=>{try{const m=JSON.parse(event.data);if(m.type==='ProxyReady')settle();else if(m.type==='ProviderError')settle(Error('Deepgram connection was rejected.'));}catch{}};
    const failed=()=>settle(Error('Speech WebSocket unavailable.'));
    const closed=()=>settle(Error('Speech service disconnected.'));
    socket.addEventListener('message',message);socket.addEventListener('error',failed);socket.addEventListener('close',closed);
  });
  const ctx=new AudioContext({latencyHint:'interactive'});state.audioContext=ctx;await ctx.audioWorklet.addModule('/audio-worklet.js');
  const source=ctx.createMediaStreamSource(stream);const node=new AudioWorkletNode(ctx,'pcm16-processor');state.sourceNode=source;state.processor=node;
  node.port.onmessage=event=>{if(event.data?.type==='pcm'&&socket.readyState===WebSocket.OPEN&&!state.speaking&&socket.bufferedAmount<512*1024){socket.send(event.data.buffer);}if(event.data?.type==='level')setWave(event.data.level);};
  source.connect(node);const silent=ctx.createGain();silent.gain.value=0;node.connect(silent);silent.connect(ctx.destination);await ctx.resume();
  state.activeSpeechProvider='deepgram';state.streaming=true;state.startedAt=Date.now();state.uncommitted=[];state.wordLanguages=[];state.sampleActive=false;renderLanguageEvidence();state.lastFinalAt=0;state.lastPreviewText='';state.previewSerial++;
  socket.addEventListener('message',e=>{try{
    const data=JSON.parse(e.data);
    if(data.type==='ProviderError'){
      if(state.activeSpeechProvider==='deepgram'&&!state.fallingBack){
        state.fallingBack=true;toast('Streaming provider unavailable — switching to automatic OpenAI speech.');
        stopAudio().then(()=>{state.fallingBack=false;if(state.config.openAITranscribeReady)startOpenAIAudio();}).catch(()=>{state.fallingBack=false;});
      }
      return;
    }
    handleSpeech(data);
  }catch(err){console.warn('transcript processing error',err);}});
  socket.addEventListener('close',e=>{if(state.streaming){stopAudio().catch(()=>{});if(!e.wasClean)toast('Speech connection ended unexpectedly.');}});
  socket.addEventListener('error',()=>{if(state.streaming&&!state.fallingBack){
   if(state.config.openAITranscribeReady){state.fallingBack=true;stopAudio().then(()=>{state.fallingBack=false;startOpenAIAudio();}).catch(()=>{state.fallingBack=false;});}
   else{setMicState('error','Speech connection interrupted','Try starting a new session.');stopAudio().catch(()=>{});}
 }});
  state.minuteTicker=setInterval(()=>{const seconds=Math.floor((Date.now()-state.startedAt)/1000);$('sessionTimer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;if(seconds>=15*60){toast('15-minute session limit reached. Start a new session to continue.');stopAudio().catch(()=>{});}},1000);
  state.keepAlive=setInterval(()=>{if(socket.readyState===WebSocket.OPEN&&state.speaking)socket.send(JSON.stringify({type:'KeepAlive'}));},4000);
  setMicState('active','We’re listening. Just speak.','Switch between your three languages naturally.');
 }catch(e){toast(e.message);await stopAudio();setMicState('error','Could not start microphone','Check permissions and provider configuration.');if(state.config.openAITranscribeReady&&state.settings.speechEngine==='auto')setTimeout(()=>startOpenAIAudio().catch(err=>toast(err.message)),100);}
 finally{state.starting=false;$('micButton').disabled=false;}
}

async function startOpenAIAudio(){
 if(state.starting||state.streaming)return;
 if(!state.config.openAITranscribeReady){toast('Multilingual fallback is not configured.');return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Audio recording is unsupported in this browser. Try Chrome or Safari.');return;}
 if(!state.sessionReady&&!await initSession())return;
 state.starting=true;state.stopRequested=false;state.sampleActive=false;
 setMicState('ready','Starting automatic multilingual microphone…','Using short speech segments via OpenAI');
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  state.stream=stream;state.streaming=true;state.activeSpeechProvider='openai-file';state.startedAt=Date.now();
  const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(x=>MediaRecorder.isTypeSupported(x));
  function nextChunk(){
   if(!state.streaming||state.stopRequested||state.activeSpeechProvider!=='openai-file')return;
   const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
   state.openaiRecorder=rec;
   rec.ondataavailable=event=>{
    const chunk=event.data;
    if(!chunk||chunk.size<1000||state.stopRequested)return;
    state.openaiQueue=state.openaiQueue.then(async()=>{
     const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':chunk.type||'audio/webm','X-TriFlow-Languages':state.settings.languages.join(',')},credentials:'same-origin',body:chunk});
     const body=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(body.error||'Transcription unavailable');
     const utterance=trim(body.text);
     if(utterance){showTranscript(utterance);$('detectedPill').textContent='AUTO · OPENAI';queueTurn(utterance,false);}
    }).catch(error=>toast('Voice transcription: '+error.message));
   };
   rec.onstop=()=>{clearTimeout(state.openaiTimer);if(state.streaming&&!state.stopRequested&&state.activeSpeechProvider==='openai-file')setTimeout(nextChunk,20);};
   rec.start();
   state.openaiTimer=setTimeout(()=>{if(rec.state==='recording')rec.stop();},6500);
  }
  nextChunk();
  state.minuteTicker=setInterval(()=>{
   const seconds=Math.floor((Date.now()-state.startedAt)/1000);
   $('sessionTimer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
   if(seconds>=15*60)stopAudio().catch(()=>{});
  },1000);
  setMicState('active','Listening across your three languages','Automatic switching • translations update every few seconds.');
  $('translationMeta').textContent='OpenAI microphone mode · segmented transcription, not word-by-word streaming';
 }catch(error){toast('Microphone unavailable: '+error.message);await stopAudio();}
 finally{state.starting=false;}
}
async function stopAudio(){if(state.stopRequested)return;state.stopRequested=true;if(state.activeSpeechProvider==='openai-file'){clearInterval(state.minuteTicker);clearTimeout(state.openaiTimer);state.streaming=false;try{if(state.openaiRecorder?.state==='recording')state.openaiRecorder.stop();}catch{}try{state.stream?.getTracks().forEach(t=>t.stop());}catch{}state.openaiRecorder=null;state.stream=null;state.activeSpeechProvider=null;setMicState('ready','Session complete','Ready for another conversation.');persistSession();return;}if(state.activeSpeechProvider==='browser'){clearInterval(state.minuteTicker);clearTimeout(state.partialTimer);try{state.browserSpeech?.abort();}catch{}state.browserSpeech=null;state.streaming=false;state.activeSpeechProvider=null;setWave(0);setMicState('ready','Free microphone stopped','Start again whenever you like.');persistSession();return;}clearInterval(state.minuteTicker);clearInterval(state.keepAlive);clearTimeout(state.partialTimer);state.previewSerial++;
 const socket=state.socket;state.socket=null;if(socket&&socket.readyState===WebSocket.OPEN){try{socket.send(JSON.stringify({type:'Finalize'}));}catch{}};
 try{state.stream?.getTracks().forEach(t=>t.stop());}catch{}try{state.sourceNode?.disconnect();state.processor?.disconnect();await state.audioContext?.close();}catch{};
 state.stream=null;state.audioContext=null;state.sourceNode=null;state.processor=null;
 await new Promise(resolve=>setTimeout(resolve,450));
 state.streaming=false;state.activeSpeechProvider=null;
 if(socket&&socket.readyState===WebSocket.OPEN)try{socket.send(JSON.stringify({type:'CloseStream'}));socket.close(1000,'Done');}catch{};
 if(state.uncommitted.length)finalizeUtterance();setWave(0);setMicState('ready','Session complete','Start again whenever you like.');persistSession();}
function handleSpeech(msg){if(!state.streaming)return;if(msg.type==='UtteranceEnd'){finalizeUtterance();return;}if(msg.type!=='Results')return;const alt=msg.channel?.alternatives?.[0];if(!alt)return;const transcript=trim(alt.transcript);if(!transcript)return;
 if(msg.is_final || msg.speech_final){state.uncommitted.push(transcript);if(Array.isArray(alt.words))state.wordLanguages.push(...alt.words);state.lastFinalAt=Date.now();}
 const draft=[...state.uncommitted,...(msg.is_final?[]:[transcript])].join(' ').trim();
 if(draft){showTranscript(draft,!msg.speech_final);renderLanguageEvidence([...state.wordLanguages,...(msg.is_final?[]:Array.isArray(alt.words)?alt.words:[])],alt.languages||[]);if(Array.isArray(alt.languages)&&alt.languages.length)$('detectedPill').textContent=alt.languages.map(languageName).join(' · ').slice(0,40);if(!msg.speech_final)schedulePreview(draft);}
 if(msg.speech_final)finalizeUtterance();}
function finalizeUtterance(){const transcript=trim(state.uncommitted.join(' '));state.uncommitted=[];state.wordLanguages=[];clearTimeout(state.partialTimer);state.previewSerial++;state.lastPreviewText='';if(!transcript)return;showTranscript(transcript);state.lastSource=transcript;queueTurn(transcript,false);}
function schedulePreview(draft){if(!state.settings.livePreviews||!state.config.aiReady||draft.length<12||draft===state.lastPreviewText)return;clearTimeout(state.partialTimer);const serial=++state.previewSerial;state.partialTimer=setTimeout(async()=>{if(serial!==state.previewSerial||!state.streaming)return;state.lastPreviewText=draft;try{const s=state.settings;const out=await api('/api/turn',{text:draft,languages:s.languages,target:s.target,mode:s.mode,replyPreference:s.replyPreference,preview:true});if(serial===state.previewSerial&&state.streaming)showTranslation(out.translation,'Live preview · translation will refine as you speak');}catch(e){console.warn('preview unavailable',e.message);}},1150);}
function queueTurn(text,isTyped){state.turnQueue=state.turnQueue.then(()=>processTurn(text,isTyped)).catch(e=>toast(e.message));}
async function deviceTranslation(text,settings){
 const API=window.Translator;const Detector=window.LanguageDetector;if(!API?.create)return null;
 let source=settings.freeLanguage;if(Detector?.create){try{const d=await Detector.create();const hits=await d.detect(text);const best=hits?.[0]?.detectedLanguage?.split('-')[0];if(best&&settings.languages.includes(best))source=best;d.destroy?.();}catch{}}
 if(source===settings.target)return null; // Mixed speech may still need translation; never relabel the raw text as a verified translation.
 try{const status=await API.availability({sourceLanguage:source,targetLanguage:settings.target});if(status==='unavailable')return null;const translator=await API.create({sourceLanguage:source,targetLanguage:settings.target});const translated=await translator.translate(text);translator.destroy?.();return {translation:translated,provider:'browser-translator'};}catch{return null;}
}
async function processTurn(text,isTyped){if(!state.sessionReady){if(!await initSession())return;}
 if(!state.config.aiReady){const settings={...state.settings};showTranscript(text);let out=await deviceTranslation(text,settings);const hasResult=Boolean(out?.translation);showTranslation(hasResult?out.translation:'Translation is unavailable on this browser. Your spoken words were captured.',hasResult?'Device translation · availability and accuracy depend on your browser':'For automatic translation and AI chat, connect SourceB-style Cloudflare Workers AI or OpenAI.');
 state.lastSource=text;state.lastTranslation=hasResult?out.translation:'';state.history.push({id:crypto.randomUUID(),time:Date.now(),source:text,translation:hasResult?out.translation:'',reply:'',replyLanguage:settings.target,note:'',target:settings.target});renderFeed();persistSession();return;}

 const settings={...state.settings};state.sampleActive=false;showTranscript(text);showTranslation('Translating…','Preserving meaning across your three languages');
 try{const out=await api('/api/turn',{text,languages:settings.languages,target:settings.target,mode:settings.mode,replyPreference:settings.replyPreference,history:state.history.slice(-8).map(({source,reply})=>({text:source,reply})),preview:false});
  showTranslation(out.translation,`Translated into ${languageName(settings.target)} · ${out.detectedLanguages.map(languageName).join(' + ')||'Auto-detected'}`);
  const turn={id:crypto.randomUUID(),time:Date.now(),source:text,translation:out.translation,reply:out.reply,replyLanguage:out.replyLanguage,note:out.note,suggestedPhrase:out.suggestedPhrase,target:settings.target};state.history.push(turn);state.lastSource=text;state.lastTranslation=out.translation;renderFeed();persistSession();trackTelemetry('turn_completed',out.provider||'ai');
  if(out.reply&&settings.speakReplies) speak(out.reply,out.replyLanguage);
 }catch(e){showTranslation('Translation failed.','You can retry by sending the sentence below.');if(isTyped)$('typedInput').value=text;throw e;}
}
let activeVoiceAudio=null,activeVoiceUrl=null;
function stopVoicePlayback(){
 try{activeVoiceAudio?.pause();}catch{}
 if(activeVoiceUrl)URL.revokeObjectURL(activeVoiceUrl);
 activeVoiceAudio=null;activeVoiceUrl=null;
 if('speechSynthesis' in window)window.speechSynthesis.cancel();
 state.speaking=false;
}
async function speak(text,code){
 if(!trim(text)){toast('Nothing to play yet.');return;}
 stopVoicePlayback();
 const voiceMode=state.settings.voiceEngine;
 const catalogue=state.experience.voiceCatalog?.[code]||[];
 if(voiceMode==='studio' && state.experience.neuralVoicesReady && catalogue.length){
  try{
   if(!state.sessionReady && !await initSession())throw Error('Session unavailable');
   const voice=state.settings.voiceProfiles?.[code]||catalogue[0][0];
   const response=await fetch('/api/voice',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({text:text.slice(0,650),language:code,voice,speed:1})});
   if(!response.ok)throw Error('Neural voice unavailable');
   const blob=await response.blob();
   if(blob.size<300||!blob.type.startsWith('audio/'))throw Error('Unexpected audio output');
   const player=new Audio();activeVoiceUrl=URL.createObjectURL(blob);player.src=activeVoiceUrl;activeVoiceAudio=player;
   player.playbackRate=Number(state.settings.voiceSpeed)||0.96;
   player.onplay=()=>{state.speaking=true;$('voiceHint').textContent='Studio voice is speaking · AI-generated audio';};
   player.onended=player.onerror=()=>{state.speaking=false;if(state.streaming)$('voiceHint').textContent='Switch between your languages naturally.';};
   await player.play();
   trackTelemetry('voice_generated','deepgram-flux');
   return;
  }catch(error){stopVoicePlayback();toast('Studio voice unavailable. Switching to your device voice.');}
 }
 if(!('speechSynthesis' in window)){toast('This device cannot play synthetic speech.');return;}
 const u=new SpeechSynthesisUtterance(text);u.lang=byCode[code]?.locale||'en-US';
 u.rate=Number(state.settings.voiceSpeed)||0.96;u.pitch=1.02;
 const voices=window.speechSynthesis.getVoices();
 const wanted=state.settings.deviceVoices?.[code];
 const selected=voices.find(v=>wanted&&v.voiceURI===wanted);
 const exact=voices.find(v=>v.lang?.toLowerCase()===u.lang.toLowerCase());
 const similar=voices.find(v=>v.lang?.toLowerCase().startsWith(code.toLowerCase()+'-'));
 if(selected||exact||similar)u.voice=selected||exact||similar;
 u.onstart=()=>{state.speaking=true;$('voiceHint').textContent='Your device voice is speaking · synthetic audio';};
 u.onend=u.onerror=()=>{state.speaking=false;if(state.streaming)$('voiceHint').textContent='Switch between your three languages naturally.';};
 window.speechSynthesis.speak(u);
}
function renderFeed(){const feed=$('conversationFeed');feed.replaceChildren();if(!state.history.length){const empty=make('div','empty-feed');empty.append(make('span','empty-star','✳'),make('strong',null,'Your conversation begins here.'),make('p',null,'Start speaking above, or try a mixed-language sentence below.'));feed.append(empty);return;}
 for(const turn of state.history){const block=make('div','turn');block.append(make('div','turn-label','YOU · '+new Date(turn.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})),make('p',null,turn.source));block.append(make('div','turn-translation',turn.translation));feed.append(block);if(turn.reply){const ai=make('div','turn ai');ai.append(make('div','turn-label',`TRIFLOW · ${languageName(turn.replyLanguage)}`),make('p',null,turn.reply));if(turn.note)ai.append(make('div','turn-tip',`✧ ${turn.note}`));const replay=make('button','replay-voice','♫ Play voice');replay.type='button';replay.addEventListener('click',()=>speak(turn.reply,turn.replyLanguage));ai.append(replay);feed.append(ai);}else if(turn.note){const tip=make('div','turn ai');tip.append(make('div','turn-label','LANGUAGE COACH'),make('p',null,turn.note));feed.append(tip);}}
 feed.scrollTop=feed.scrollHeight;}
function persistSession(){if(!state.history.length)return;const saved=load(SESSIONS_KEY,[]);const item={id:state.sessionId,created:state.history[0].time,updated:Date.now(),languages:[...state.settings.languages],history:state.history.slice(-100)};const next=[item,...saved.filter(s=>s.id!==state.sessionId)].slice(0,20);store(SESSIONS_KEY,next);}
function newSession(){if(state.streaming)stopAudio().catch(()=>{});persistSession();state.history=[];state.sessionId=crypto.randomUUID();state.lastSource='';state.lastTranslation='';showTranscript('');showTranslation('');renderLanguageEvidence();state.sampleActive=false;$('sampleChallenge').classList.remove('sample-complete');$('sessionTimer').textContent='00:00';renderFeed();toast('Fresh conversation, ready when you are.');}
function exportSession(){if(!state.history.length){toast('Start a conversation before exporting.');return;}const lines=[`TriFlow Session — ${new Date().toLocaleString()}`,`Languages: ${state.settings.languages.map(languageName).join(' / ')}`,''];for(const t of state.history){lines.push(`YOU: ${t.source}`,`TRANSLATION (${languageName(t.target)}): ${t.translation}`);if(t.reply)lines.push(`TRIFLOW (${languageName(t.replyLanguage)}): ${t.reply}`);if(t.note)lines.push(`TIP: ${t.note}`);lines.push('');}const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`triflow-session-${new Date().toISOString().slice(0,10)}.txt`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Conversation exported.');}
function savePhrase(){const text=state.lastTranslation,source=state.lastSource;if(!text){toast('Translate a phrase first.');return;}const current=load(PHRASES_KEY,[]);if(current.some(p=>p.source===source&&p.target===state.settings.target)){toast('Already in your phrasebook.');return;}current.unshift({id:crypto.randomUUID(),source,translation:text,target:state.settings.target,created:Date.now()});store(PHRASES_KEY,current.slice(0,100));toast('Saved to your phrasebook ✳');}
function renderSessions(){const list=$('sessionList');list.replaceChildren();const sessions=load(SESSIONS_KEY,[]);if(!sessions.length){list.append(make('p','list-empty','Your language journey is just getting started.'));return;}for(const s of sessions){const row=make('div','session-row');const main=make('div','session-row-main');main.append(make('strong',null,s.history?.[0]?.source?.slice(0,130)||'Conversation'),make('span',null,`${new Date(s.created).toLocaleString()} · ${s.history.length} turns · ${(s.languages||[]).map(languageName).join(' / ')}`));const b=make('button',null,'Open ↗');b.addEventListener('click',()=>{if(state.streaming)stopAudio().catch(()=>{});persistSession();state.sessionId=s.id;state.history=s.history||[];renderFeed();const last=state.history.at(-1);if(last){state.lastSource=last.source;state.lastTranslation=last.translation;showTranscript(last.source);showTranslation(last.translation,`Translated into ${languageName(last.target)}`);}showView('live');});row.append(main,b);list.append(row);}}
function renderPhrases(){const list=$('phraseList');list.replaceChildren();const items=load(PHRASES_KEY,[]);if(!items.length){list.append(make('p','list-empty','Save a translation to start your personal phrasebook.'));return;}for(const p of items){const row=make('div','session-row');const main=make('div','session-row-main');main.append(make('strong',null,p.translation),make('span',null,`${p.source} · ${languageName(p.target)}`));const b=make('button',null,'Copy ↗');b.addEventListener('click',()=>copyText(p.translation));row.append(main,b);list.append(row);}}
async function copyText(text){if(!text){toast('Nothing to copy yet.');return;}try{await navigator.clipboard.writeText(text);toast('Copied to clipboard.');}catch{toast('Clipboard unavailable.');}}
function openSettings(){if(state.streaming){toast('Finish your live session before changing languages.');return;}const {languages,speakReplies,livePreviews}=state.settings;languages.forEach((v,i)=>$('lang'+(i+1)).value=v);populateReply();$('speakReplies').checked=speakReplies;$('livePreviews').checked=livePreviews;$('voiceSpeed').value=String(state.settings.voiceSpeed);$('speechEngine').value=state.settings.speechEngine;$('settingsDialog').showModal();}
function registerEvents(){document.querySelectorAll('[data-view]').forEach(x=>x.addEventListener('click',()=>showView(x.dataset.view)));for(const id of ['editLanguages','settingsButton'])$(id).addEventListener('click',openSettings);
 $('chooseAccurateMode').addEventListener('click',()=>{if(state.streaming){toast('Finish this microphone session first.');return;}state.settings.speechEngine='accurate';store(CONFIG_KEY,state.settings);$('speechEngine').value='accurate';renderConfig();toast('Accuracy-first selected. Tap the microphone and speak across all three languages.');});
 $('micButton').addEventListener('click',()=>{if(state.streaming){trackTelemetry('voice_stopped');stopAudio().catch(()=>{});}else{trackTelemetry('voice_started');startAudio();}});
 $('targetLanguage').addEventListener('change',event=>{state.settings.target=event.target.value;settingsChange();if(state.sampleActive)runSampleChallenge();else showTranslation('','Translation target updated. Say something new.');});
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.settings.mode=b.dataset.mode;settingsChange();}));
 $('copyTranslation').addEventListener('click',()=>copyText(state.lastTranslation||state.translatedText));$('savePhrase').addEventListener('click',savePhrase);$('listenTranslation').addEventListener('click',()=>speak(state.lastTranslation||state.translatedText,state.settings.target));$('sampleChallenge').addEventListener('click',()=>{trackTelemetry('sample_preview');runSampleChallenge();});$('newSession').addEventListener('click',newSession);$('exportSession').addEventListener('click',()=>{trackTelemetry('session_exported');exportSession();});
 $('composeForm').addEventListener('submit',e=>{e.preventDefault();const text=trim($('typedInput').value);if(!text)return;$('typedInput').value='';queueTurn(text,true);});
 $('settingsForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;const languages=[$('lang1').value,$('lang2').value,$('lang3').value];if(new Set(languages).size!==3){e.preventDefault();toast('Please choose three different languages.');return;}state.settings.languages=languages;state.settings.replyPreference=$('replyPreference').value;state.settings.speakReplies=$('speakReplies').checked;state.settings.livePreviews=$('livePreviews').checked;state.settings.voiceSpeed=Number($('voiceSpeed').value);state.settings.speechEngine=$('speechEngine').value;settingsChange();renderConfig();toast('Your language studio is updated.');});
 $('aboutButton').addEventListener('click',()=>$('aboutDialog').showModal());$('aboutClose').addEventListener('click',()=>$('aboutDialog').close());$('aboutDone').addEventListener('click',()=>$('aboutDialog').close());
 $('setupDetails').addEventListener('click',()=>$('aboutDialog').showModal());
 document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('typedInput').value=b.dataset.prompt;$('typedInput').focus();toast('Try sending it to experience multilingual understanding.');}));
 $('clearHistory').addEventListener('click',()=>{if(!confirm('Clear all locally saved session history?'))return;store(SESSIONS_KEY,[]);renderSessions();});
 $('clearPhrases').addEventListener('click',()=>{if(!confirm('Clear all saved phrases on this device?'))return;store(PHRASES_KEY,[]);renderPhrases();});
 registerExperienceEvents();window.addEventListener('pagehide',()=>{try{state.stream?.getTracks().forEach(t=>t.stop());state.socket?.close();stopVoicePlayback();}catch{}});
}

/* Premium voice selection, opt-in product analytics and the Flow in-app guide. */
const VISITOR_KEY='triflow_anonymous_visitor_v1';
const visitorId=(()=>{let id=load(VISITOR_KEY,null);if(!id||!/^[a-zA-Z0-9_-]{10,70}$/.test(id)){id=crypto.randomUUID();store(VISITOR_KEY,id);}return id;})();
let flowRating=null,flowBusy=false,flowMessages=[],flowPreviousFocus=null;
function trackTelemetry(event,provider=''){
 if(!state.settings.telemetryConsent||!state.sessionReady)return;
 fetch('/api/events',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({consent:true,visitor:visitorId,event,languages:state.settings.languages,mode:state.settings.mode,provider})}).catch(()=>{});
}
async function initializeExperience(){
 try{
  const response=await fetch('/api/experience/config',{credentials:'same-origin',cache:'no-store'});
  if(response.ok)state.experience=await response.json();
 }catch{}
 $('voiceEngine').value=state.settings.voiceEngine;
 $('flowUsageConsent').checked=state.settings.telemetryConsent;
 renderVoicePicker();
 if('speechSynthesis' in window)window.speechSynthesis.addEventListener('voiceschanged',renderVoicePicker);
 trackTelemetry('app_open');
}
function renderVoicePicker(){
 const select=$('voicePersona'),lang=state.settings.target,mode=state.settings.voiceEngine;
 if(!$('voiceEngine'))return;
 $('voiceEngine').value=mode;
 const studio=mode==='studio',available=state.experience.voiceCatalog?.[lang]||[];
 select.replaceChildren();
 if(studio){
  for(const item of available)select.add(new Option(item[2],item[0]));
  const saved=state.settings.voiceProfiles?.[lang];
  if(available.length)select.value=available.some(x=>x[0]===saved)?saved:available[0][0];
  if(!available.length)select.add(new Option('Not supported for this language','system'));
  $('voiceAvailability').textContent=state.experience.neuralVoicesReady?'Neural voices ready':'Voice service offline';
  $('studioVoiceCaption').textContent=available.length?'Natural AI-generated speech · cloud processing · device playback is always available as a fallback.':'Studio voices are not available in '+languageName(lang)+'. Free device speech will play instead.';
 }else{
  select.add(new Option('Auto · best device voice','system'));
  const voices='speechSynthesis' in window?window.speechSynthesis.getVoices().filter(v=>v.lang?.toLowerCase().startsWith(lang.toLowerCase())):[];
  for(const voice of voices.slice(0,25))select.add(new Option(voice.name+' · '+voice.lang,voice.voiceURI));
  select.value=voices.some(x=>x.voiceURI===state.settings.deviceVoices?.[lang])?state.settings.deviceVoices[lang]:'system';
  $('voiceAvailability').textContent='Free · on this device';
  $('studioVoiceCaption').textContent='Device voices are free and available offline on supported devices. Quality depends on your browser and installed voices.';
 }
 select.disabled=studio&&!available.length;
 const studioStatus=$('studioVoicePanel');
 if(studioStatus)studioStatus.classList.toggle('studio-unavailable',studio&&!state.experience.neuralVoicesReady);
}
function setFlowTab(tab){
 for(const button of document.querySelectorAll('[data-flow-tab]')){
  const selected=button.dataset.flowTab===tab;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));
 }
 $('flowAssistantPane').hidden=tab!=='assistant';$('flowFeedbackPane').hidden=tab!=='feedback';
}
function openFlow(tab='assistant'){
 flowPreviousFocus=document.activeElement;
 $('flowDrawer').hidden=false;$('flowBackdrop').hidden=false;document.body.classList.add('flow-open');setFlowTab(tab);
 (tab==='assistant'?$('flowInput'):$('flowFeedbackMessage')).focus();
 trackTelemetry('help_opened');
}
function closeFlow(){
 $('flowDrawer').hidden=true;$('flowBackdrop').hidden=true;document.body.classList.remove('flow-open');
 if(flowPreviousFocus&&flowPreviousFocus.isConnected)flowPreviousFocus.focus();
}
function addFlowMessage(role,text){
 const row=make('div','flow-msg '+role);
 if(role==='assistant')row.append(make('span','flow-msg-icon','✦'));
 row.append(make('p',null,String(text)));
 $('flowConversation').append(row);
 $('flowConversation').scrollTop=$('flowConversation').scrollHeight;
}
async function askFlow(message){
 const question=trim(message);if(!question||flowBusy)return;
 flowBusy=true;$('flowInput').disabled=true;
 addFlowMessage('user',question);
 try{
  const result=await api('/api/support',{message:question,history:flowMessages.slice(-6)});
  const reply=trim(result.answer)||'I could not answer that. Please try a simpler question.';
  addFlowMessage('assistant',reply);
  flowMessages.push({role:'user',content:question},{role:'assistant',content:reply});
  flowMessages=flowMessages.slice(-10);
 }catch(error){addFlowMessage('assistant','I am having trouble connecting. You can still change your languages in Settings or send feedback here.');}
 finally{flowBusy=false;$('flowInput').disabled=false;$('flowInput').focus();}
}
function updateFlowStars(){
 for(const button of document.querySelectorAll('[data-score]')){
  const selected=flowRating!==null&&Number(button.dataset.score)<=flowRating;
  button.textContent=selected?'★':'☆';button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(Number(button.dataset.score)===flowRating));
 }
}
async function submitFlowFeedback(event){
 event.preventDefault();
 const comment=trim($('flowFeedbackMessage').value);
 if(comment.length<8){$('flowFeedbackStatus').textContent='Please add a little more detail (at least 8 characters).';return;}
 const button=$('flowFeedbackSubmit');button.disabled=true;$('flowFeedbackStatus').textContent='Sending your feedback securely…';
 try{
  const result=await api('/api/feedback',{visitor:visitorId,category:$('flowFeedbackCategory').value,rating:flowRating,comment,alias:trim($('flowFeedbackAlias').value),languages:state.settings.languages});
  $('flowFeedbackStatus').textContent='Thank you. Your feedback is recorded · '+result.receipt;
  $('flowFeedbackMessage').value='';flowRating=null;updateFlowStars();trackTelemetry('feedback_sent');
 }catch(error){$('flowFeedbackStatus').textContent='Feedback could not be sent: '+error.message;}
 finally{button.disabled=false;}
}
function registerExperienceEvents(){
 for(const id of ['flowHelpTop','flowHelpSidebar','flowFloatingHelp'])$(id).addEventListener('click',()=>openFlow());
 $('flowClose').addEventListener('click',closeFlow);$('flowBackdrop').addEventListener('click',closeFlow);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('flowDrawer').hidden)closeFlow();});
 for(const btn of document.querySelectorAll('[data-flow-tab]'))btn.addEventListener('click',()=>setFlowTab(btn.dataset.flowTab));
 for(const btn of document.querySelectorAll('[data-flow-prompt]'))btn.addEventListener('click',()=>{setFlowTab('assistant');askFlow(btn.dataset.flowPrompt);});
 $('flowForm').addEventListener('submit',e=>{e.preventDefault();const msg=trim($('flowInput').value);if(!msg)return;$('flowInput').value='';askFlow(msg);});
 $('flowFeedbackForm').addEventListener('submit',submitFlowFeedback);
 for(const btn of document.querySelectorAll('[data-score]'))btn.addEventListener('click',()=>{flowRating=Number(btn.dataset.score);updateFlowStars();});
 $('flowUsageConsent').addEventListener('change',e=>{state.settings.telemetryConsent=Boolean(e.target.checked);store(CONFIG_KEY,state.settings);if(state.settings.telemetryConsent)trackTelemetry('app_open');});
 $('voiceEngine').addEventListener('change',e=>{state.settings.voiceEngine=e.target.value;store(CONFIG_KEY,state.settings);renderVoicePicker();trackTelemetry('setting_changed');});
 $('voicePersona').addEventListener('change',e=>{
  const code=state.settings.target;if(state.settings.voiceEngine==='studio')state.settings.voiceProfiles[code]=e.target.value;
  else state.settings.deviceVoices[code]=e.target.value;
  store(CONFIG_KEY,state.settings);trackTelemetry('setting_changed');
 });
 $('previewStudioVoice').addEventListener('click',()=>{
  const language=state.settings.target;const sample={en:'Hi! I am Flow. Speak freely, and let your languages find their rhythm.',es:'Hola, soy Flow. Habla con naturalidad y disfruta de cada idioma.',fr:'Bonjour, je suis Flow. Parlons naturellement, dans les langues que tu aimes.',de:'Hallo, ich bin Flow. Sprich ganz natürlich mit mir.',it:'Ciao, sono Flow. Parliamo insieme con naturalezza.',pt:'Olá, eu sou Flow. Vamos conversar naturalmente.',ja:'こんにちは、Flowです。いっしょに自然に話しましょう。'};
  speak(sample[language]||'Hello, welcome to TriFlow.',language);
 });
}

initialize();
