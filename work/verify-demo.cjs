const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../dist/replay.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Unique HTML ids');
class Element {
  constructor(){this.children=[];this.attributes={};this.events={};this.value='';this.checked=false;this.hidden=true;this.textContent='';this.dataset={};this.classes=new Set();this.classList={toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)};}
  append(...items){this.children.push(...items)} replaceChildren(...items){this.children=items}
  setAttribute(k,v){this.attributes[k]=v} addEventListener(k,v){this.events[k]=v}
  closest(){return {querySelectorAll:sel=>sel.includes(':checked')?choices.filter(c=>c.checked):choices}}
  querySelectorAll(){return []}
  focus(){this.focused=true} select(){this.selected=true} scrollIntoView(){this.scrolled=true}
  showModal(){this.open=true} close(){this.open=false} click(){this.clicked=true}
  remove(){this.removed=true}
}
const choices=[...html.matchAll(/type="checkbox" value="([^"]+)"/g)].map(m=>Object.assign(new Element(),{value:m[1]}));
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
const checkinButtons=[...html.matchAll(/data-checkin="([^"]+)"/g)].map(match=>{const button=new Element();button.dataset.checkin=match[1];return button});elements['checkin-actions'].querySelectorAll=()=>checkinButtons;
let timer;let clock=0;const intervals=[];const docEvents={};const storage=new Map();const files=[],revoked=[],timeouts=[];
const sandbox={document:{getElementById:id=>{assert.ok(elements[id],'Existing DOM id '+id);return elements[id]},createElement:()=>new Element(),body:new Element(),addEventListener:(name,fn)=>{docEvents[name]=fn},hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},performance:{now:()=>clock},setInterval:(fn,ms)=>{intervals.push({fn,ms});if(ms===4000)timer=fn},setTimeout:fn=>timeouts.push(fn),navigator:{clipboard:{writeText:async text=>{sandbox.copied=text}}},Blob,URL:{createObjectURL:file=>{files.push(file);return 'blob:local-test'},revokeObjectURL:url=>revoked.push(url)}};
let js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
js=js.replace(/\}\)\(\);\s*$/, 'globalThis.demo={state,profile,phase,result,systemStates,points,render,milestones,buildReport,journalEntries,getStore,getDecisions,getCheckins,chartSignals,tour,tourSteps,startTour,stopTour,tourTick,comparison,comparisonRows,eventsInWindow,applyComparison,crewMembers,switchCrew,currentCrew,recordKey,taskEntries,getTaskStore,saveTask,queueCurrentDay,menuConfiguration,launchFromMenu,openMenu,resumeFromMenu};})();');
vm.runInNewContext(js,sandbox);
const {state,profile,phase,result,systemStates,points,render,milestones}=sandbox.demo;
let count=0;function check(name,fn){fn();console.log('PASS '+name);count++}
check('Fresh page shows only the entry menu without writing records',()=>{assert.equal(elements['entry-menu'].hidden,false);assert.equal(elements['mission-dashboard'].hidden,true);assert.equal(elements['menu-resume'].hidden,true);assert.equal(elements['menu-crew'].value,'A');assert.equal(elements['menu-scenario'].value,'nominal');assert.equal(elements['menu-day'].value,'0');assert.equal(storage.size,0);assert.ok(html.includes('id="mission-dashboard" hidden'));assert.ok(sandbox.document.body.classes.has('is-menu'))});
check('All 363 day/scenario combinations render',()=>{for(const scenario of ['persistent','nominal','missing'])for(let day=0;day<=120;day++){Object.assign(state,{scenario,day});render();assert.equal(elements.systems.children.length,4);assert.equal(elements['day-selector'].value,String(day));assert.ok(!elements.chart.innerHTML.includes('NaN'));}});
check('Prelaunch baseline and one-day launch event',()=>{state.scenario='nominal';assert.equal(profile(0).hr,62);state.day=1;assert.equal(result(profile(1)).kind,'info');assert.equal(systemStates(profile(1))[0].status,'Esperado en el guion');state.day=2;assert.equal(phase(2).name,'Inserción orbital');assert.ok(profile(2).hr<72);assert.equal(result(profile(2)).kind,'nominal')});
check('Sustained change differs from nominal and absent data',()=>{state.day=73;state.scenario='persistent';assert.equal(result(profile(73)).kind,'alert');assert.equal(systemStates(profile(73))[0].status,'Revisar');assert.equal(systemStates(profile(73))[1].status,'Revisar');state.scenario='nominal';assert.equal(result(profile(73)).kind,'nominal');state.scenario='missing';assert.equal(result(profile(73)).kind,'review');assert.equal(systemStates(profile(73))[0].status,'No evaluable');assert.equal(systemStates(profile(73))[1].status,'No evaluable');assert.equal(systemStates(profile(73))[2].status,'Registro disponible');});
check('Adaptation, EVA and reentry milestones',()=>{assert.equal(phase(3).name,'Adaptación inicial');assert.equal(phase(90).name,'EVA simulada');assert.equal(phase(118).name,'Reentrada');assert.equal(new Set(milestones.map(m=>m.day)).size,milestones.length);state.day=90;assert.equal(systemStates(profile(90))[3].status,'Revisar contexto');assert.ok(profile(90).radiation<.6)});
check('Chart has gaps and correctly positioned final ticks',()=>{assert.match(points([1,null,2],0,0,100,100,0,3),/^M0,.* M100,/);for(const day of [0,73,120]){state.day=day;render();assert.equal((elements.chart.innerHTML.match(/text-anchor="middle"/g)||[]).length,18);assert.ok(!elements.chart.innerHTML.includes('NaN'))}});
check('Day selector pauses playback and updates summaries',()=>{state.playing=true;elements['day-selector'].events.input({target:{value:'118'}});assert.equal(state.day,118);assert.equal(state.playing,false);assert.equal(elements['mission-phase'].textContent,'Reentrada')});
check('Decision storage is isolated by day and scenario',()=>{state.day=73;state.scenario='persistent';render();choices[0].checked=true;elements['save-decision'].events.click();assert.match(elements['decision-status'].textContent,/guardada/);state.day=74;render();assert.equal(choices[0].checked,false);assert.equal(elements['decision-status'].textContent,'');state.day=73;render();assert.equal(choices[0].checked,true);state.scenario='nominal';render();assert.equal(choices[0].checked,false);state.scenario='persistent';render();assert.equal(choices[0].checked,true)});
check('Unsaved choices survive redraws at the same moment',()=>{choices[1].checked=true;render();assert.equal(choices[1].checked,true)});
check('Storage failure reports an error',()=>{const original=sandbox.localStorage.setItem;sandbox.localStorage.setItem=()=>{throw Error('unavailable')};elements['save-decision'].events.click();assert.match(elements['decision-status'].textContent,/No se pudo guardar/);sandbox.localStorage.setItem=original});
check('Playback stops at mission end',()=>{state.day=118;state.speed=8;state.playing=true;timer();assert.equal(state.day,120);assert.equal(state.playing,false)});

const {buildReport,journalEntries,getStore,getDecisions,getCheckins}=sandbox.demo;
const reviewKey='salud-de-mision/replay-reviews/v1',decisionKey='salud-de-mision/replay-decisions/v1',checkinKey='salud-de-mision/replay-checkins/v1';
const literal='<img src=x onerror=alert(1)> Contexto de prueba';
check('Report includes only saved records for the selected day and scenario',()=>{
  state.day=73;state.scenario='persistent';
  storage.set(reviewKey,JSON.stringify({persistent:[{day:73,context:literal,recheck:true,date:'29/9/2026'},{day:74,context:'OTRO DÍA',recheck:false,date:'29/9/2026'}],nominal:[{day:73,context:'OTRO ESCENARIO',recheck:false,date:'29/9/2026'}]}));
  storage.set(checkinKey,JSON.stringify({persistent:{73:'Cansado',74:'Con energía'}}));
  render();elements.context.value='BORRADOR SIN GUARDAR';choices[3].checked=true;
  const report=buildReport(new Date('2026-09-29T03:00:00Z'));
  assert.match(report.text,/Día 73 de 120/);assert.match(report.text,/Cambio sostenido/);assert.match(report.text,/Cansado/);assert.ok(report.text.includes(literal));assert.ok(!report.text.includes('OTRO DÍA'));assert.ok(!report.text.includes('OTRO ESCENARIO'));assert.ok(!report.text.includes('BORRADOR SIN GUARDAR'));assert.ok(!report.text.includes(choices[3].value));assert.ok(report.text.includes('µSv/h'));assert.match(report.text,/Tres periodos completos/);assert.equal(report.filename,'salud-de-mision-dia-073-persistent.txt');assert.ok(!report.text.includes('undefined'));
});
check('Reports distinguish missing observations from zero',()=>{state.scenario='missing';const report=buildReport();assert.match(report.text,/Pulso: Sin registro/);assert.match(report.text,/No evaluable/);assert.doesNotMatch(report.text,/Pulso: 0 bpm/);state.scenario='persistent'});
check('Journal filters, ordering and navigation keep scenario boundaries',()=>{
  elements['journal-filter'].value='all';render();const entries=journalEntries().entries;assert.equal(entries[0].day,74);assert.ok(!entries.some(e=>e.copy.includes('OTRO ESCENARIO')));
  const rows=elements['mission-journal'].children;assert.ok(rows.some(row=>row.children[1]?.children[1]?.textContent===('Nueva medición simulada solicitada. '+literal)));
  rows[0].children[0].events.click();assert.equal(state.day,74);assert.equal(state.playing,false);
  elements['journal-filter'].value='decision';elements['journal-filter'].events.change();assert.equal(elements['mission-journal'].children.length,1);assert.equal(elements['mission-journal'].children[0].children[1].children[0].textContent,'Decisión');
  state.scenario='missing';render();assert.match(elements['mission-journal'].children[0].textContent,/Todavía no hay registros/);state.scenario='persistent';state.day=73;elements['journal-filter'].value='all';render();
});
check('Editing a record pauses mission playback',()=>{state.playing=true;elements.context.events.input();assert.equal(state.playing,false);state.playing=true;choices[0].events.change();assert.equal(state.playing,false)});
check('Unreadable or malformed storage remains intact and is reported',()=>{
  const old=storage.get(reviewKey);for(const value of ['{broken','null','[]','{"persistent":[null]}']){storage.set(reviewKey,value);assert.equal(getStore(),null);assert.doesNotThrow(()=>render());assert.match(buildReport().text,/No se pudo leer el almacenamiento/);assert.equal(storage.get(reviewKey),value);assert.match(elements['mission-journal'].children[0].textContent,/incompleta/)}storage.set(reviewKey,old);
  for(const [key,reader] of [[decisionKey,getDecisions],[checkinKey,getCheckins]]){const previous=storage.get(key);storage.set(key,'{"persistent":{"73":null}}');assert.equal(reader(),null);assert.doesNotThrow(()=>render());storage.set(key,previous)}
  const read=sandbox.localStorage.getItem;sandbox.localStorage.getItem=()=>{throw Error('disabled')};assert.doesNotThrow(()=>render());assert.match(buildReport().text,/No se pudo leer el almacenamiento/);sandbox.localStorage.getItem=read;
});
check('Opening summary pauses playback and displays a frozen snapshot',()=>{state.playing=true;elements['prepare-summary'].events.click();assert.equal(state.playing,false);assert.equal(elements['report-dialog'].open,true);assert.match(elements['report-text'].value,/Día 73 de 120/);assert.match(elements['report-meta'].textContent,/Día 73/);state.day=90;assert.match(elements['report-text'].value,/Día 73 de 120/)});
check('Download creates a local text file from that same snapshot',()=>{elements['download-report'].events.click();assert.equal(files.length,1);assert.equal(files[0].type,'text/plain;charset=utf-8');const anchor=sandbox.document.body.children.at(-1);assert.equal(anchor.download,'salud-de-mision-dia-073-persistent.txt');assert.equal(anchor.clicked,true);assert.equal(anchor.removed,true);timeouts.forEach(fn=>fn());assert.deepEqual(revoked,['blob:local-test'])});
check('Download failure provides an alternative',()=>{const create=sandbox.URL.createObjectURL;sandbox.URL.createObjectURL=()=>{throw Error('download unavailable')};elements['download-report'].events.click();assert.match(elements['report-feedback'].textContent,/No se pudo iniciar la descarga/);sandbox.URL.createObjectURL=create});
(async()=>{
  await elements['copy-report'].events.click();assert.equal(sandbox.copied,elements['report-text'].value);assert.equal(elements['report-feedback'].textContent,'Texto copiado.');count++;console.log('PASS Clipboard receives the exact snapshot');
  sandbox.navigator.clipboard.writeText=async()=>{throw Error('clipboard denied')};await elements['copy-report'].events.click();assert.equal(elements['report-text'].selected,true);assert.match(elements['report-feedback'].textContent,/Ctrl\+C/);count++;console.log('PASS Clipboard denial selects text for manual copy');
  const text=await files[0].text();assert.ok(text.includes(elements['report-text'].value));count++;console.log('PASS Download bytes contain complete snapshot');
  elements['close-report'].events.click();assert.equal(elements['report-dialog'].open,false);count++;console.log('PASS Summary close action');

  const {tour,tourSteps,startTour,stopTour,tourTick,chartSignals}=sandbox.demo;
  check('Three charts show explicit units, baselines and fixed axes',()=>{
    state.day=73;state.scenario='persistent';render();
    assert.equal((elements.chart.innerHTML.match(/class="signal-panel"/g)||[]).length,3);
    assert.equal((elements.chart.innerHTML.match(/class="baseline"/g)||[]).length,3);
    for(const signal of chartSignals){assert.ok(elements.chart.innerHTML.includes('('+signal.unit+')'));assert.ok(elements.chart.innerHTML.includes(signal.baseline.toLocaleString('es-PY')+' '+signal.unit));}
    assert.equal((elements['chart-data'].innerHTML.match(/<tr/g)||[]).length,15);
    assert.equal((elements.chart.innerHTML.match(/class="selected-point"/g)||[]).length,3);
    state.scenario='missing';render();assert.ok(elements.chart.innerHTML.includes('missing-band'));assert.ok(elements.chart.innerHTML.includes('Sin registro'));assert.equal((elements.chart.innerHTML.match(/class="selected-point"/g)||[]).length,0);
    for(const scenario of ['nominal','persistent','missing'])for(let day=0;day<=120;day++)for(const signal of chartSignals){const value=profile(day,scenario)[signal.key];assert.ok(value===null||(value>=signal.min&&value<=signal.max),'Signal fits fixed axis');}
  });
  check('Tour starts at baseline, pauses free playback and preserves saved data',()=>{
    state.day=42;state.scenario='missing';state.showEvidence=true;state.playing=true;render();elements.context.value='Borrador original';elements.recheck.checked=true;choices[2].checked=true;
    const before=JSON.stringify([...storage]);startTour();assert.equal(tour.active,true);assert.equal(state.day,0);assert.equal(state.scenario,'nominal');assert.equal(state.playing,false);assert.equal(elements.scenario.disabled,true);assert.equal(elements['tour-panel'].hidden,false);assert.equal(elements['baseline-card'].classes.has('tour-focus'),true);assert.equal(elements.context.value,'');assert.equal(JSON.stringify([...storage]),before);
  });
  check('Guided timing respects pause, manual navigation and evidence',()=>{
    clock+=15000;tourTick();assert.equal(tour.index,1);assert.equal(state.day,73);assert.equal(state.scenario,'persistent');assert.equal(elements['charts-card'].classes.has('tour-focus'),true);
    elements['tour-pause'].events.click();assert.equal(tour.paused,true);clock+=30000;tourTick();assert.equal(tour.index,1);
    elements['tour-next'].events.click();assert.equal(tour.index,2);assert.equal(state.showEvidence,true);assert.equal(elements.evidence.hidden,false);
    elements['tour-previous'].events.click();assert.equal(tour.index,1);assert.equal(state.showEvidence,false);
    elements['tour-pause'].events.click();clock+=15000;tourTick();assert.equal(tour.index,2);
    elements['tour-next'].events.click();assert.equal(state.scenario,'missing');assert.match(elements['alert-title'].textContent,/No evaluable/);
  });
  check('Exiting restores original view and unsaved notes without auto-saving',()=>{
    const before=JSON.stringify([...storage]);elements['tour-exit'].events.click();assert.equal(tour.active,false);assert.equal(state.day,42);assert.equal(state.scenario,'missing');assert.equal(state.showEvidence,true);assert.equal(state.playing,false);assert.equal(elements.context.value,'Borrador original');assert.equal(elements.recheck.checked,true);assert.equal(choices[2].checked,true);assert.equal(elements.scenario.disabled,false);assert.equal(elements['tour-panel'].hidden,true);assert.equal(JSON.stringify([...storage]),before);
  });
  check('Uninterrupted tour lasts 90 seconds and opens day-73 summary',()=>{
    const before=JSON.stringify([...storage]);startTour();
    for(let step=0;step<6;step++){assert.equal(tour.index,step);clock+=14999;tourTick();assert.equal(tour.active,true);assert.equal(tour.index,step);clock+=1;tourTick();}
    assert.equal(tour.active,false);assert.equal(elements['report-dialog'].open,true);assert.match(elements['report-text'].value,/Día 73 de 120/);assert.match(elements['report-text'].value,/Cambio sostenido/);assert.equal(state.day,42);assert.equal(state.scenario,'missing');assert.equal(JSON.stringify([...storage]),before);elements['close-report'].events.click();
  });
  check('Backgrounding, drafting and opening a report pause the tour',()=>{
    startTour();sandbox.document.hidden=true;docEvents.visibilitychange();assert.equal(tour.paused,true);sandbox.document.hidden=false;elements['tour-pause'].events.click();
    elements.context.events.input();assert.equal(tour.paused,true);elements['tour-pause'].events.click();elements['prepare-summary'].events.click();assert.equal(tour.paused,true);elements['close-report'].events.click();stopTour();
  });
  check('Manual completion and restart leave a single timer and clean state',()=>{
    const before=JSON.stringify([...storage]);startTour();startTour();for(let i=0;i<5;i++)elements['tour-next'].events.click();assert.match(elements['tour-next'].textContent,/Ver resumen/);elements['tour-next'].events.click();assert.equal(tour.active,false);assert.equal(elements['report-dialog'].open,true);assert.match(elements['report-meta'].textContent,/Día 73/);assert.equal(JSON.stringify([...storage]),before);assert.equal(intervals.filter(i=>i.ms===250).length,1);elements['close-report'].events.click();startTour();assert.equal(tour.index,0);assert.equal(tour.paused,false);stopTour();
  });


  const {comparison,comparisonRows,eventsInWindow,applyComparison}=sandbox.demo;
  check('Mission events use inclusive chart windows and shared indices',()=>{
    assert.deepEqual(Array.from(eventsInWindow(0,14),event=>event.day),[0,1,2,3,14]);
    state.day=55;state.scenario='persistent';render();assert.ok(elements.chart.innerHTML.includes('Ejercicio programado'));
    assert.equal((elements.chart.innerHTML.match(/class="mission-event-badge"/g)||[]).length,3);
    assert.match(elements['chart-data'].innerHTML,/Ejercicio programado/);
    assert.equal(elements['chart-events'].children.length,1);assert.match(elements['chart-events'].children[0].textContent,/1 · D55/);
    state.day=120;render();assert.equal((elements.chart.innerHTML.match(/class="mission-event-badge"/g)||[]).length,6);assert.ok(elements.chart.innerHTML.includes('Reentrada'));assert.ok(elements.chart.innerHTML.includes('Cierre de misión'));
  });
  check('Event buttons inspect the corresponding day and pause playback',()=>{
    state.day=53;state.playing=true;render();elements['chart-events'].children[0].events.click();assert.equal(state.day,55);assert.equal(state.playing,false);assert.equal(elements['event-title'].textContent,'Ejercicio programado');assert.equal(elements['event-title'].focused,true);
    state.day=104;render();assert.match(elements['chart-events'].children[0].textContent,/No hay hitos/);
  });
  check('Day comparison uses exact profiles in the selected scenario',()=>{
    state.scenario='persistent';elements['compare-a'].value='7';elements['compare-b'].value='73';applyComparison();
    const rows=comparisonRows(),a=profile(7),b=profile(73);
    for(const row of rows){assert.equal(row.from,a[row.key]);assert.equal(row.to,b[row.key]);assert.equal(row.delta,Number((b[row.key]-a[row.key]).toFixed(1)));assert.equal(row.percent,Number(((b[row.key]-a[row.key])/a[row.key]*100).toFixed(1)))}
    assert.ok(rows.find(row=>row.key==='hr').delta>0);assert.ok(rows.find(row=>row.key==='sleep').delta<0);assert.equal(elements['comparison-results'].children.length,3);
    const mainDay=state.day;elements['compare-swap'].events.click();assert.equal(comparison.a,73);assert.equal(comparison.b,7);assert.match(elements['comparison-context'].textContent,/anterior/);assert.equal(state.day,mainDay);
    for(let i=0;i<rows.length;i++)assert.equal(comparisonRows()[i].delta,-rows[i].delta);
  });
  check('Comparison handles same-day readings and missing values',()=>{
    state.scenario='nominal';elements['compare-a'].value='73';elements['compare-b'].value='73';applyComparison();assert.ok(comparisonRows().every(row=>row.delta===0&&row.percent===0));assert.match(elements['comparison-context'].textContent,/mismo día/);
    state.scenario='missing';render();assert.ok(comparisonRows().every(row=>row.delta===null&&row.percent===null));assert.ok(elements['comparison-results'].children.every(card=>card.children[2].textContent==='No comparable'));
    elements['compare-a'].value='7';applyComparison();assert.ok(comparisonRows().every(row=>row.from!==null&&row.to===null&&row.delta===null));
    state.scenario='nominal';render();assert.ok(comparisonRows().every(row=>row.delta!==null));assert.match(elements['comparison-scenario'].textContent,/Misión nominal/);
  });
  check('Invalid days hide results until corrected; boundaries are accepted',()=>{
    const previous=comparison.a;
    for(const invalid of ['', '-1','121','2.5','oops','Infinity']){elements['compare-a'].value=invalid;elements['compare-b'].value='73';applyComparison();assert.equal(comparison.error,true);assert.equal(elements['comparison-results'].hidden,true);assert.equal(comparison.a,previous);assert.match(elements['compare-error'].textContent,/0 y 120/)}
    elements['compare-a'].value='0';elements['compare-b'].value='120';applyComparison();assert.equal(comparison.error,false);assert.equal(elements['comparison-results'].hidden,false);assert.equal(comparison.a,0);assert.equal(comparison.b,120);assert.equal(elements['compare-error'].textContent,'');
  });
  check('Comparison controls use selected day and inspect each endpoint',()=>{
    state.playing=true;elements['compare-a'].events.input();assert.equal(state.playing,false);
    state.day=90;elements['compare-current'].events.click();assert.equal(comparison.b,90);assert.equal(comparison.a,0);
    elements['compare-open-a'].events.click();assert.equal(state.day,0);elements['compare-open-b'].events.click();assert.equal(state.day,90);assert.equal(state.playing,false);
  });
  check('Guided tour protects chart-event navigation and comparison selection',()=>{
    const originalA=comparison.a,originalB=comparison.b;startTour();assert.equal(elements['compare-a'].disabled,true);assert.equal(elements['compare-open-b'].disabled,true);assert.ok(elements['chart-events'].children.every(button=>button.disabled));
    const day=state.day;elements['chart-events'].children[1].events.click();assert.equal(state.day,day);stopTour();assert.equal(elements['compare-a'].disabled,false);assert.equal(comparison.a,originalA);assert.equal(comparison.b,originalB);
  });


  const {crewMembers,switchCrew,currentCrew,recordKey,taskEntries,getTaskStore,saveTask,queueCurrentDay}=sandbox.demo;
  const taskKey='salud-de-mision/replay-tasks/v1';
  check('All 1089 crew/day/scenario views remain within chart axes',()=>{
    for(const member of crewMembers)for(const scenario of ['persistent','nominal','missing'])for(let day=0;day<=120;day++){
      Object.assign(state,{crew:member.id,day,scenario});render();assert.equal(elements['crew-list'].children.length,3);assert.match(elements['crew-subtitle'].textContent,new RegExp(member.name));assert.equal(elements['base-hr'].textContent,member.hr+' bpm');
      for(const signal of chartSignals){assert.equal(signal.baseline,member[signal.key]);const value=profile(day)[signal.key];assert.ok(value===null||(value>=signal.min&&value<=signal.max));}assert.ok(!elements.chart.innerHTML.includes('NaN'));
    }
    state.day=73;state.scenario='persistent';state.crew='A';assert.equal(result(profile(73)).kind,'alert');state.crew='B';assert.equal(result(profile(73)).kind,'nominal');state.crew='C';assert.equal(result(profile(73)).kind,'alert');
  });
  check('Legacy A records remain intact and are not visible to B or C',()=>{
    state.crew='A';const legacy=storage.get(reviewKey);assert.equal(getStore().persistent[0].context,literal);
    switchCrew('B');assert.equal(getStore().persistent,undefined);assert.equal(getDecisions().persistent,undefined);assert.equal(getCheckins().persistent,undefined);
    assert.match(buildReport().text,/Tripulante B/);assert.ok(!buildReport().text.includes(literal));assert.match(buildReport().filename,/tripulante-b/);assert.match(elements['base-hr'].textContent,/66 bpm/);assert.equal(storage.get(reviewKey),legacy);
    switchCrew('C');assert.equal(getStore().persistent,undefined);assert.equal(storage.get(reviewKey),legacy);
  });
  check('Saving reviews and decisions is isolated by crew and scenario',()=>{
    switchCrew('B');state.scenario='nominal';state.day=20;render();elements.context.value='Nota exclusiva de B';elements.recheck.checked=true;elements.save.events.click();choices[1].checked=true;elements['save-decision'].events.click();
    checkinButtons[2].events.click();assert.equal(getCheckins().nominal[20],'Cansado');
    assert.equal(getStore().nominal[0].context,'Nota exclusiva de B');assert.ok(getDecisions().nominal[20].choices.includes(choices[1].value));assert.ok(storage.has(recordKey(reviewKey,'B')));assert.match(buildReport().text,/Nota exclusiva de B/);
    switchCrew('C');assert.equal(getStore().nominal,undefined);assert.equal(getCheckins().nominal,undefined);assert.ok(!buildReport().text.includes('Nota exclusiva de B'));state.scenario='persistent';switchCrew('B');assert.equal(getStore().persistent,undefined);state.scenario='nominal';render();
  });
  check('Switching crew restores drafts and pauses playback',()=>{
    elements.context.value='Borrador B';elements.recheck.checked=true;choices[2].checked=true;state.playing=true;switchCrew('C');assert.equal(state.playing,false);assert.equal(elements.context.value,'');assert.equal(elements.recheck.checked,false);assert.equal(choices[2].checked,false);elements.context.value='Borrador C';switchCrew('B');assert.equal(elements.context.value,'Borrador B');assert.equal(elements.recheck.checked,true);assert.equal(choices[2].checked,true);switchCrew('C');assert.equal(elements.context.value,'Borrador C');switchCrew('B');
  });
  check('Measurement requests appear once per day and manual queue deduplicates',()=>{
    const measurement=taskEntries().entries.filter(task=>task.type==='measurement');assert.equal(measurement.length,1);assert.equal(measurement[0].day,20);assert.equal(measurement[0].status,'pending');
    queueCurrentDay();queueCurrentDay();assert.equal(taskEntries().entries.filter(task=>task.type==='review').length,1);assert.match(elements['task-status'].textContent,/ya figura/);
    const before=JSON.stringify(profile(20));const task=taskEntries().entries.find(task=>task.type==='measurement');assert.equal(saveTask(task,'reviewed'),true);assert.equal(taskEntries().entries.find(item=>item.id===task.id).status,'reviewed');assert.equal(JSON.stringify(profile(20)),before);assert.match(buildReport().text,/Revisado/);
    assert.equal(saveTask(task,'pending'),true);assert.equal(taskEntries().entries.find(item=>item.id===task.id).status,'pending');
  });
  check('Queue filters and a new request reopen the measurement follow-up',()=>{
    let task=taskEntries().entries.find(task=>task.type==='measurement');saveTask(task,'reviewed');elements['task-filter'].value='reviewed';elements['task-filter'].events.change();assert.equal(elements['task-list'].children.length,1);assert.match(elements['task-list'].children[0].children[0].textContent,/Solicitud/);
    choices[1].checked=true;elements['save-decision'].events.click();task=taskEntries().entries.find(item=>item.type==='measurement');assert.equal(task.status,'pending');assert.equal(elements['task-list'].children.length,1);assert.match(elements['task-list'].children[0].textContent,/No hay/);elements['task-filter'].value='all';elements['task-filter'].events.change();assert.equal(elements['task-list'].children.length,2);
  });
  check('Reviewed state never clears a sustained-change signal',()=>{
    switchCrew('C');state.scenario='persistent';state.day=73;render();queueCurrentDay();const task=taskEntries().entries.find(task=>task.type==='review');assert.equal(result(profile(73)).kind,'alert');saveTask(task,'reviewed');assert.equal(result(profile(73)).kind,'alert');assert.equal(taskEntries().entries[0].status,'reviewed');switchCrew('A');assert.equal(taskEntries().entries.some(task=>task.id==='review:73'),false);
  });
  check('Task storage errors preserve source records and show failure',()=>{
    switchCrew('B');state.scenario='nominal';state.day=20;render();const task=taskEntries().entries[0],before=storage.get(recordKey(taskKey)),reviews=storage.get(recordKey(reviewKey));
    const setter=sandbox.localStorage.setItem;sandbox.localStorage.setItem=()=>{throw Error('quota')};assert.equal(saveTask(task,'reviewed'),false);assert.match(elements['task-status'].textContent,/No se pudo/);assert.equal(storage.get(recordKey(taskKey)),before);sandbox.localStorage.setItem=setter;
    storage.set(recordKey(taskKey),'[]');assert.equal(getTaskStore(),null);assert.doesNotThrow(()=>render());assert.equal(taskEntries().incomplete,true);assert.equal(saveTask(task,'reviewed'),false);assert.equal(storage.get(recordKey(taskKey)),'[]');assert.equal(storage.get(recordKey(reviewKey)),reviews);storage.set(recordKey(taskKey),before);
  });
  check('Tour uses A and restores selected crew without writing any queue entries',()=>{
    switchCrew('C');state.day=42;render();const before=JSON.stringify([...storage]);startTour();assert.equal(state.crew,'A');assert.ok(elements['crew-list'].children.every(button=>button.disabled));switchCrew('B');assert.equal(state.crew,'A');queueCurrentDay();assert.equal(JSON.stringify([...storage]),before);for(let i=0;i<6;i++)elements['tour-next'].events.click();assert.equal(state.crew,'C');assert.match(elements['report-meta'].textContent,/Tripulante A/);assert.match(elements['report-text'].value,/Tripulante A/);assert.equal(JSON.stringify([...storage]),before);elements['close-report'].events.click();
  });

  const {menuConfiguration,launchFromMenu,openMenu,resumeFromMenu}=sandbox.demo;
  check('Menu selections configure the dashboard with the matching crew and scenario',()=>{
    const before=JSON.stringify([...storage]);elements['menu-crew'].value='B';elements['menu-scenario'].value='persistent';elements['menu-day'].value='73';elements['menu-scenario'].events.change();assert.match(elements['menu-selection'].textContent,/Tripulante B/);assert.match(elements['menu-scenario-detail'].textContent,/73/);elements['menu-enter'].events.click();
    assert.equal(state.crew,'B');assert.equal(state.scenario,'persistent');assert.equal(state.day,73);assert.equal(state.playing,false);assert.equal(elements['entry-menu'].hidden,true);assert.equal(elements['mission-dashboard'].hidden,false);assert.equal(elements['dashboard-heading'].focused,true);assert.equal(sandbox.document.body.classes.has('is-menu'),false);assert.match(elements['base-hr'].textContent,/66 bpm/);assert.equal(JSON.stringify([...storage]),before);
  });
  check('Returning to menu pauses the mission and resume ignores uncommitted menu choices',()=>{
    elements.context.value='Nota sin guardar en la vista B';elements.recheck.checked=true;choices[0].checked=true;state.playing=true;const before=JSON.stringify([...storage]);elements['back-to-menu'].events.click();assert.equal(state.playing,false);assert.equal(elements['entry-menu'].hidden,false);assert.equal(elements['mission-dashboard'].hidden,true);assert.equal(elements['menu-resume'].hidden,false);assert.match(elements['menu-resume'].textContent,/Tripulante B/);
    elements['menu-crew'].value='C';elements['menu-scenario'].value='missing';elements['menu-day'].value='20';elements['menu-resume'].events.click();assert.equal(state.crew,'B');assert.equal(state.scenario,'persistent');assert.equal(state.day,73);assert.equal(elements.context.value,'Nota sin guardar en la vista B');assert.equal(elements.recheck.checked,true);assert.equal(choices[0].checked,true);assert.equal(JSON.stringify([...storage]),before);
  });
  check('Starting another menu configuration isolates and restores existing drafts',()=>{
    openMenu();const before=JSON.stringify([...storage]);elements['menu-crew'].value='C';elements['menu-scenario'].value='nominal';elements['menu-day'].value='14';launchFromMenu();assert.equal(elements.context.value,'');assert.equal(elements.recheck.checked,false);assert.equal(choices[0].checked,false);elements.context.value='Borrador de C en día 14';
    openMenu();elements['menu-crew'].value='B';elements['menu-scenario'].value='persistent';elements['menu-day'].value='73';launchFromMenu();assert.equal(elements.context.value,'Nota sin guardar en la vista B');assert.equal(elements.recheck.checked,true);assert.equal(choices[0].checked,true);assert.equal(JSON.stringify([...storage]),before);
  });
  check('Menu includes any current day and rejects invalid configurations',()=>{
    state.day=11;render();openMenu();assert.equal(elements['menu-day'].value,'11');assert.ok(elements['menu-day'].children.some(option=>option.value==='11'));const before=JSON.stringify(state);
    for(const [id,value] of [['menu-day','121'],['menu-day',''],['menu-day','1.5'],['menu-crew','unknown'],['menu-scenario','unknown']]){elements['menu-crew'].value='B';elements['menu-scenario'].value='persistent';elements['menu-day'].value='11';elements[id].value=value;assert.equal(menuConfiguration(),null);launchFromMenu();assert.equal(elements['entry-menu'].hidden,false);assert.match(elements['menu-error'].textContent,/Elegí/);assert.equal(JSON.stringify(state),before)}
    elements['menu-crew'].value='B';elements['menu-scenario'].value='persistent';elements['menu-day'].value='11';elements['menu-day'].events.change();assert.equal(elements['menu-error'].textContent,'');
  });
  check('Guided entry opens the dashboard and returning to menu ends the tour',()=>{
    const before=JSON.stringify([...storage]);elements['menu-crew'].value='C';elements['menu-scenario'].value='missing';elements['menu-day'].value='42';elements['menu-demo'].events.click();assert.equal(elements['mission-dashboard'].hidden,false);assert.equal(tour.active,true);assert.equal(state.crew,'A');assert.equal(state.day,0);
    elements['back-to-menu'].events.click();assert.equal(tour.active,false);assert.equal(state.crew,'C');assert.equal(state.day,42);assert.equal(state.scenario,'missing');assert.equal(elements['entry-menu'].hidden,false);clock+=90000;tourTick();assert.equal(state.day,42);assert.equal(JSON.stringify([...storage]),before);
  });
  check('Menu closes an open report and returning never clears saved records',()=>{
    resumeFromMenu();elements['prepare-summary'].events.click();assert.equal(elements['report-dialog'].open,true);const before=JSON.stringify([...storage]);openMenu();assert.equal(elements['report-dialog'].open,false);assert.equal(elements['mission-dashboard'].hidden,true);assert.equal(JSON.stringify([...storage]),before);resumeFromMenu();assert.equal(elements['mission-dashboard'].hidden,false);assert.equal(state.playing,false);
  });

  check('A fresh app instance reads the saved crew-specific queues',()=>{
    const fresh={...sandbox};vm.runInNewContext(js,fresh);fresh.demo.state.crew='B';fresh.demo.state.scenario='nominal';assert.equal(fresh.demo.getStore().nominal[0].context,'Nota exclusiva de B');assert.ok(fresh.demo.taskEntries().entries.some(task=>task.type==='review'));fresh.demo.state.crew='C';fresh.demo.state.scenario='persistent';assert.equal(fresh.demo.taskEntries().entries.find(task=>task.id==='review:73').status,'reviewed');
  });

  console.log(count+' checks passed. Browser layout and actual OS download/clipboard were not verified.');
})().catch(error=>{console.error(error);process.exitCode=1});

