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
