import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.REQUESTLAB_URL||'http://localhost:5173';
try{
 await page.goto(base+'/dns');
 await page.getByRole('button',{name:'Rebinding',exact:true}).click({timeout:5000});
 await page.getByRole('button',{name:'New profile',exact:true}).click();
 await page.locator('summary').filter({hasText:'Bulk address entry'}).click();
 await page.getByLabel('Bulk IP addresses',{exact:true}).fill('192.0.2.1\n192.0.2.2\n192.0.2.3');
 await page.getByRole('button',{name:'Replace with phases',exact:true}).click();
 await page.getByRole('button',{name:'Move phase 3 up',exact:true}).click();
 await page.getByRole('button',{name:'Save profiles',exact:true}).click();
 await page.getByText('Configuration applied.',{exact:false}).waitFor();
 await page.getByLabel('Preview query index',{exact:true}).fill('2');
 await page.getByRole('button',{name:'Simulate answer',exact:true}).click();
 await page.getByLabel('Simulated DNS answer').getByText('192.0.2.2',{exact:true}).waitFor();
 assert.ok(await page.getByText('0 qualifying queries',{exact:true}).count());
 let releasePreview;let previewStarted;const started=new Promise(resolve=>{previewStarted=resolve;});
 await page.route('**/api/v2/dns/rebinding/preview',async route=>{previewStarted();await new Promise(resolve=>{releasePreview=resolve;});await route.continue().catch(()=>{});});
 await page.getByRole('button',{name:'Simulate answer',exact:true}).click();await started;
 await page.getByLabel('Profile name',{exact:true}).fill('Editing while preview is pending');
 assert.equal(await page.getByRole('button',{name:'Simulate answer',exact:true}).isEnabled(),true,'Editing must cancel a pending preview without leaving controls stuck');
 releasePreview();await page.unroute('**/api/v2/dns/rebinding/preview');

 await page.getByLabel('Profile name',{exact:true}).fill('My unsaved CTF draft');
 await page.waitForResponse(r=>r.url().endsWith('/api/v2/dns/rebinding')&&r.request().method()==='GET');
 assert.equal(await page.getByLabel('Profile name',{exact:true}).inputValue(),'My unsaved CTF draft');
 await page.getByRole('button',{name:'Save profiles',exact:true}).click();
 await page.getByText('Configuration applied.',{exact:false}).waitFor();
 await page.getByLabel('Strategy',{exact:true}).selectOption('manual');
 await page.getByRole('button',{name:'Save profiles',exact:true}).click();
 await page.getByText('Configuration applied.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Serve phase 3',exact:true}).click();
 await page.getByText('Manual phase: Phase 2',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Reset profile',exact:true}).click();
 await page.getByText('0 qualifying queries',{exact:true}).waitFor();

 // A completed save from session A must never replace session B's draft.
 await page.evaluate(async()=>{const{useSessionStore}=await import('/src/stores/sessionStore.ts');window.qaSessionA=useSessionStore.getState().activeSubdomain;});
 let releaseSave;let saveStarted;const saving=new Promise(resolve=>{saveStarted=resolve;});
 await page.route('**/api/v2/dns/rebinding',async route=>{if(route.request().method()!=='PUT')return route.continue();saveStarted();await new Promise(resolve=>{releaseSave=resolve;});await route.continue();});
 await page.getByLabel('Profile name',{exact:true}).fill('Late session A');
 await page.getByRole('button',{name:'Save profiles',exact:true}).click();await saving;
 await page.evaluate(async()=>{const{useSessionStore}=await import('/src/stores/sessionStore.ts');const value=await(await fetch('/api/v2/sessions',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();useSessionStore.getState().addSession({...value,createdAt:new Date().toISOString()});});
 await page.getByText('Build your first rebinding profile',{exact:true}).waitFor();
 await page.getByRole('button',{name:'New profile',exact:true}).click();await page.getByLabel('Profile name',{exact:true}).fill('Session B draft');
 const lateResponse=page.waitForResponse(r=>r.url().endsWith('/api/v2/dns/rebinding')&&r.request().method()==='PUT');releaseSave();await lateResponse;
 assert.equal(await page.getByLabel('Profile name',{exact:true}).inputValue(),'Session B draft');await page.unroute('**/api/v2/dns/rebinding');
 await page.evaluate(async()=>{const{useSessionStore}=await import('/src/stores/sessionStore.ts');useSessionStore.getState().setActiveSession(window.qaSessionA);});
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Profile name"]')?.value==='Late session A');
 // Import and apply 128 phases through the real UI; then restore a compact profile for screenshots.
 const applied=await page.evaluate(async()=>{const{useSessionStore}=await import('/src/stores/sessionStore.ts');const session=useSessionStore.getState().getActiveSession();return(await(await fetch('/api/v2/dns/rebinding',{headers:{Authorization:`Bearer ${session.token}`}})).json()).profiles[0];});
 const large={...applied,phases:Array.from({length:128},(_,i)=>({id:`many-${i}`,label:`Phase ${i+1}`,values:[`192.0.2.${i+1}`],ttl:0,query_count:1,duration_ms:5,weight:1}))};
 await page.getByLabel('Import rebinding JSON',{exact:true}).setInputFiles({name:'rebinding.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,profiles:[large]}))});
 await page.getByLabel('Phase 128 addresses',{exact:true}).waitFor({state:'attached'});
 assert.equal(await page.locator('textarea[aria-label^="Phase "][aria-label$=" addresses"]').count(),128);
 await page.getByRole('button',{name:'Save profiles',exact:true}).click();await page.getByText('Configuration applied.',{exact:false}).waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const download=await downloadPromise;
 const {readFile}=await import('node:fs/promises');const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.profiles[0].phases.length,128);assert.equal('token'in exported,false);assert.equal('token'in exported.profiles[0],false);
 await page.getByLabel('Import rebinding JSON',{exact:true}).setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,profiles:[applied]}))});
 await page.getByRole('button',{name:'Save profiles',exact:true}).click();await page.getByText('Configuration applied.',{exact:false}).waitFor();
 for(const width of [360,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);
 if(process.env.REQUESTLAB_SCREENSHOTS){await page.screenshot({path:process.env.REQUESTLAB_SCREENSHOTS+'/rebinding-desktop.png',fullPage:true});}
 console.log('PASS bulk N-address entry, reorder, save, isolated preview, unsaved drafts, manual phase, reset, delayed cross-session save, 128-phase import/export, mobile layout');
}finally{await context.close();await browser.close();}
