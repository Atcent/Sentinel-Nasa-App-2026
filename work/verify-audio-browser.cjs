const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.PW_CHANNEL?{channel:process.env.PW_CHANNEL}:{})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:960}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(() => {
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) { super(...args); window.testAudioContext=this; window.testAudioSources=[]; window.testAudioGains=[]; }
        createGain() { const node=super.createGain(); window.testAudioGains.push(node); return node; }
        createOscillator() { const node=super.createOscillator(); window.testAudioSources.push(node); return node; }
      };
      window.testAudioTransitions=[];
    });
    await page.goto(pathToFileURL(path.join(__dirname,'../dist/replay.html')).href);
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'false');
    await page.locator('#sound-toggle').click();
    await page.waitForFunction(()=>window.testAudioContext?.state==='running');
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{
      const api=window.MissionAudio;
      window.MissionAudio={...api,update(next){window.testAudioTransitions.push(next);api.update(next)},cue(name){window.testAudioTransitions.push({cue:name});api.cue(name)}};
      window.testAnalyser=window.testAudioContext.createAnalyser();window.testAnalyser.fftSize=2048;window.testAudioGains[0].connect(window.testAnalyser);
    });
    await page.locator('#menu-enter').click();
    await page.waitForTimeout(700);
    const rms=await page.evaluate(()=>{const data=new Float32Array(window.testAnalyser.fftSize);window.testAnalyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length)});
    assert.ok(rms>0,'Cabin produces a real audio waveform');
    await page.locator('#day-selector').fill('1');
    assert.ok(await page.evaluate(()=>window.testAudioSources.some(node=>node.frequency.value===196)),'Launch motif produced');
    await page.waitForTimeout(900);
    const launchRms=await page.evaluate(()=>{const data=new Float32Array(window.testAnalyser.fftSize);window.testAnalyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length)});
    assert.ok(launchRms>rms*2,'Engine atmosphere is measurably different from the quiet cabin');
    assert.match(await page.locator('#sound-status').textContent(),/motores y vibración/);
    await page.locator('#evidence-button').click();
    assert.equal(await page.evaluate(()=>window.testAudioSources.filter(n=>n.frequency.value===46).length),1,'Opening evidence never restarts engine atmosphere');
    await page.locator('#day-selector').fill('2');
    assert.match(await page.locator('#sound-status').textContent(),/Órbita/);
    await page.locator('#scenario').selectOption('persistent');
    await page.locator('#day-selector').fill('73');
    const sustained=await page.evaluate(()=>window.testAudioSources.filter(node=>node.frequency.value===520).length);
    assert.equal(sustained,2,'Two-tone review');
    await page.locator('#evidence-button').click();
    assert.equal(await page.evaluate(()=>window.testAudioSources.filter(node=>node.frequency.value===520).length),sustained,'Evidence toggle does not repeat review');
    await page.locator('#save-decision').click();
    assert.ok(await page.evaluate(()=>window.testAudioTransitions.some(value=>value.cue==='saved')));
    await page.locator('#day-selector').fill('90');
    assert.match(await page.locator('#sound-status').textContent(),/escotilla/);
    assert.equal(await page.evaluate(()=>window.testAudioSources.filter(n=>n.type==='triangle').length),2,'Two airlock latches at EVA entry');
    await page.locator('#evidence-button').click();
    assert.equal(await page.evaluate(()=>window.testAudioSources.filter(n=>n.type==='triangle').length),2,'EVA redraw does not repeat airlock');
    await page.locator('#day-selector').fill('118');
    assert.match(await page.locator('#sound-status').textContent(),/turbulencia/);
    const reentrySources=await page.evaluate(()=>window.testAudioSources.filter(n=>n.frequency.value===58).length);
    await page.locator('#day-selector').fill('119');
    assert.equal(await page.evaluate(()=>window.testAudioSources.filter(n=>n.frequency.value===58).length),reentrySources,'Reentry continues without rebuilding its sound');
    await page.locator('#sound-controls summary').click();
    await page.locator('#sound-volume').fill('58');
    assert.equal(await page.locator('#sound-volume-value').textContent(),'58 %');
    await page.locator('#sound-ambient').uncheck();
    await page.waitForTimeout(700);
    const silence=await page.evaluate(()=>{const data=new Float32Array(window.testAnalyser.fftSize);window.testAnalyser.getFloatTimeDomainData(data);return Math.max(...data.map(Math.abs))});
    assert.ok(silence<.00001,'Ambient-off is silent after tone ends');
    await page.locator('#sound-ambient').check();
    await page.locator('#sound-controls summary').click();
    await page.locator('#back-to-menu').click();
    await page.waitForTimeout(700);
    assert.ok(await page.evaluate(()=>{const data=new Float32Array(window.testAnalyser.fftSize);window.testAnalyser.getFloatTimeDomainData(data);return Math.max(...data.map(Math.abs))<.00001}),'Menu stops ambient');
    await page.locator('#sound-toggle').click();
    await page.waitForFunction(()=>window.testAudioContext.state==='suspended');
    await page.reload();
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'false');
    await page.locator('#sound-controls summary').click();
    assert.equal(await page.locator('#sound-volume').inputValue(),'58');
    await page.locator('#sound-controls summary').click();
    await page.screenshot({path:path.join(__dirname,'audio-menu-qa.png'),fullPage:false});
    await page.locator('#menu-demo').click();
    assert.ok(await page.evaluate(()=>document.getElementById('tour-panel').getBoundingClientRect().top >= document.getElementById('sound-controls').getBoundingClientRect().bottom),'Audio bar does not cover the tour header');
    await page.screenshot({path:path.join(__dirname,'audio-dashboard-qa.png'),fullPage:false});
    assert.deepEqual(errors,[]);
    console.log('PASS Real browser: activation, cabin and engine waveforms, launch/orbit/EVA/reentry transitions, deduplication, successful save, volume, ambient stop, mute, restored preferences, guided entry and no page errors.');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
