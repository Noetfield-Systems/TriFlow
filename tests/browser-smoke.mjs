import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base=process.env.TRIFLOW_TEST_URL||'http://127.0.0.1:3100';
await mkdir('qa-screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const problems=[];
async function run(name,viewport){
 const page=await browser.newPage({viewport,deviceScaleFactor:1,hasTouch:viewport.width<500,isMobile:viewport.width<500});
 page.on('pageerror',e=>problems.push(name+' JS: '+e.message));
 // UI test: simulate configured language provider while leaving the real API and signed session in place.
 await page.route('**/api/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({speechReady:false,openAITranscribeReady:false,aiReady:true,accessCodeRequired:false,gateReady:true})}));
 const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response.status(),200,name+' HTTP');
 await page.locator('#micButton').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#providerLabel')?.textContent&&!document.querySelector('#providerLabel')?.textContent.includes('Checking'),null,{timeout:12000});
 await page.locator('#sampleChallenge').click();
 await page.waitForFunction(()=>document.querySelector('#sourceText')?.textContent.includes('que podemos parler demain'));
 assert.match(await page.locator('#translationMeta').textContent(),/INTERACTIVE SAMPLE/);
 assert.match(await page.locator('#translatedText').textContent(),/tomorrow/);
 await page.locator('[data-mode="interpreter"]').click();
 assert.match(await page.locator('#modeHint').textContent(),/translat/i);
 await page.locator('#settingsButton').click();
 await page.locator('#settingsDialog').waitFor({state:'visible'});
 await page.locator('#lang3').selectOption('de');
 await page.locator('#saveSettings').click();
 await page.locator('#settingsDialog').waitFor({state:'hidden'});
 await page.locator('#targetLanguage').selectOption('es');
 assert.match(await page.locator('#targetLanguage').inputValue(),/es/);
 // Simulated provider response only to verify that the real browser UI handles
 // a mixed-language transcript; live provider acceptance is tested separately.
 await page.route('**/api/turn',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,translation:'Podemos hablar mañana.',reply:'Oui!',replyLanguage:'fr',detectedLanguages:['en','es','fr'],provider:'browser-test-mock'})}));
 await page.locator('#typedInput').fill('I think que podemos parler demain');
 await page.locator('#sendTyped').click();
 await page.waitForFunction(()=>document.querySelector('#conversationFeed')?.textContent.includes('Podemos hablar mañana'),null,{timeout:12000});
 // Premium voice picker and in-app Flow feedback + help work on both form factors.
 await page.locator('#flowHelpTop').click();
 await page.locator('#flowDrawer').waitFor({state:'visible'});
 await page.locator('#flowInput').fill('How can I switch between English, Spanish and French?');
 await page.locator('#flowForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.flow-msg.ai').length>=2,null,{timeout:12000});
 await page.screenshot({path:'qa-screenshots/'+name+'-flow-assistant.png',fullPage:true,animations:'disabled'});
 await page.locator('[data-flow-tab="feedback"]').click();
 await page.locator('[data-score="5"]').click();
 await page.locator('#flowFeedbackCategory').selectOption('idea');
 await page.locator('#flowFeedbackMessage').fill('QA BROWSER TEST: Check the persistence of feedback without sharing audio or conversation text.');
 await page.locator('#flowFeedbackAlias').fill('TriFlow QA');
 await page.locator('#flowFeedbackSubmit').click();
 await page.waitForFunction(()=>document.querySelector('#flowFeedbackStatus')?.textContent.includes('TF-FB-'),null,{timeout:12000});
 await page.screenshot({path:'qa-screenshots/'+name+'-feedback.png',fullPage:true,animations:'disabled'});
 await page.locator('#flowUsageConsent').check();
 await page.locator('#flowClose').click();
 await page.locator('#flowDrawer').waitFor({state:'hidden'});
 await page.locator('#voiceEngine').selectOption('studio');
 assert.ok((await page.locator('#voicePersona option').count())>=2,'Curated neural voice choices');
 await page.locator('#voiceEngine').selectOption('device');
 await page.locator('#chooseAccurateMode').click();
 await page.locator('#settingsButton').click();
 assert.equal(await page.locator('#speechEngine').inputValue(),'accurate');
 await page.locator('#settingsDialog button[value="cancel"]').click();

 await page.waitForTimeout(4400); // Capture the stable premium UI rather than a transient toast.
 await page.screenshot({path:'qa-screenshots/'+name+'.png',fullPage:true,animations:'disabled'});
 const width=await page.evaluate(()=>({document:document.documentElement.scrollWidth,screen:window.innerWidth}));
 assert.ok(width.document<=width.screen+8,name+' horizontal overflow '+JSON.stringify(width));
 assert.equal(problems.length,0,name+' JS errors');
 console.log('BROWSER_QA_PASS',name,'viewport',viewport.width+'x'+viewport.height,'microphone-visible','mixed-language-UI','sample','interpreter','settings','target','no-overflow');
 await page.close();
}
try{
 await run('desktop',{width:1440,height:900});
 await run('mobile',{width:390,height:844});
}finally{await browser.close();}
if(problems.length)throw new Error(problems.join('\n'));
