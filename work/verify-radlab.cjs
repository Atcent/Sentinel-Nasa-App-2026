const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../dist/replay.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.classList={toggle(){}}}
  append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}setAttribute(k,v){this.attributes[k]=v}addEventListener(k,v){this.events[k]=v}focus(){}scrollIntoView(){}click(){this.clicked=true}remove(){}
}
const elements=Object.fromEntries(ids.map(id=>[id,new Element('div')]));elements['data-person-default'].value='Persona 1';elements['mission-dashboard'].hidden=true;
const blobs=[],revoked=[];
const sandbox={document:{getElementById:id=>{assert.ok(elements[id],id);return elements[id]},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),body:new Element('body')},Blob,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:test'},revokeObjectURL:url=>revoked.push(url)},setTimeout:fn=>fn(),localStorage:{getItem(){throw Error('Imported mode must not read simulation storage')},setItem(){throw Error('Imported mode must not persist data')}}};
const requests=[],pendingTimeouts=[];class AbortControllerMock{constructor(){this.signal={aborted:false};this.abort=()=>{this.signal.aborted=true}}}sandbox.AbortController=AbortControllerMock;sandbox.setTimeout=(fn,ms)=>{pendingTimeouts.push({fn,ms});return pendingTimeouts.length};sandbox.clearTimeout=()=>{};sandbox.fetch=async()=>{throw Error('Fetch not configured')};
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/,'globalThis.api={parseCSV,parseDate,validateDataset,fields,measures,imported,controls,readFile,reviewData,commitData,filteredRecords,renderImported,csvExport,plot,radLab,radLabConfig,radLabRows,queryRadLab,renderRadLab};})();'),sandbox);

const a=sandbox.api;let count=0;function check(name,fn){fn();count++;console.log('PASS '+name)}
check('RadLab builds a fixed, minimal NASA request from only validated UTC dates',()=>{
  elements['radlab-from'].value='2022-04-01';elements['radlab-to'].value='2022-04-07';const c=a.radLabConfig();
  assert.match(c.url,/^https:\/\/visualization\.osdr\.nasa\.gov\/radlab\/api\/\?spacecraft=ISS&instrument=DosTel&timestamp%3E=2022-04-01T00%3A00&timestamp%3C=2022-04-08T00%3A00&dose_equivalent_rate&format=json$/);
  assert.ok(!c.url.includes('Persona'));assert.ok(!c.url.includes('health'));assert.ok(!c.url.includes('data-person'));
  for(const [from,to] of [['2022-04-08','2022-04-01'],['2022-02-30','2022-04-01'],['2022-04-01','2022-04-08']]){elements['radlab-from'].value=from;elements['radlab-to'].value=to;assert.throws(()=>a.radLabConfig())}
});
check('RadLab normalizes valid object and column-array responses, filtering bad and duplicate rows',()=>{
  const object=a.radLabRows([{timestamp:'2022-04-01T23:01:00Z',dose_equivalent_rate:'1.25',instrument_id:'DosTel1'},{timestamp:'2022-04-01T23:01:00Z',dose_equivalent_rate:'1.25',instrument_id:'DosTel1'},{timestamp:'2022-04-01T23:02:00Z',dose_equivalent_rate:-1,instrument_id:'DosTel1'},{timestamp:'bad',dose_equivalent_rate:2},{timestamp:1648854180,dose_equivalent_rate:2,instrument:'DosTel2'}]);
  assert.equal(object.length,2);assert.equal(object[0].rate,1.25);assert.equal(object[1].date,'2022-04-01T23:03:00.000Z');
  const columns=a.radLabRows({columns:['timestamp','dose_equivalent_rate','instrument_id'],data:[['2022-04-02T00:00:00Z','2,5','D']]});assert.equal(columns.length,1);assert.equal(columns[0].rate,2.5);assert.equal(columns[0].instrument,'D');
});
check('RadLab rejects response structures or sizes it cannot safely display',()=>{
  assert.throws(()=>a.radLabRows({message:'unexpected'}));assert.throws(()=>a.radLabRows(Array(5001).fill({timestamp:'2022-04-01T00:00:00Z',dose_equivalent_rate:1})));assert.equal(a.radLabRows([]).length,0);
});
(async()=>{
  const originalMission={name:'Local',records:[]};a.imported.mission=originalMission;
  elements['radlab-from'].value='2022-04-01';elements['radlab-to'].value='2022-04-01';let calls=0;
  sandbox.fetch=async(url,options)=>{calls++;requests.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify([{timestamp:'2022-04-01T23:01:00Z',dose_equivalent_rate:1.2,instrument_id:'DosTel1'},{timestamp:'2022-04-01T23:02:00Z',dose_equivalent_rate:2.4,instrument_id:'DosTel1'}])}};
  check('No NASA request runs until the user explicitly starts the query',()=>assert.equal(calls,0));await a.queryRadLab();
  check('Explicit query sends no body or credentials and renders public context separately',()=>{assert.equal(calls,1);const request=requests[0];assert.equal(request.options.credentials,'omit');assert.equal(request.options.method,'GET');assert.equal(request.options.body,undefined);assert.equal(a.imported.mission,originalMission);assert.equal(elements['radlab-results'].hidden,false);assert.match(elements['radlab-summary'].textContent,/2 lecturas válidas/);assert.equal(elements['radlab-table'].children[0].children[1].children.length,2);assert.match(elements['radlab-status'].textContent,/Consulta completada/)});
  sandbox.fetch=async()=>{throw Error('offline')};await a.queryRadLab();
  check('Network failure reports the issue without changing the local mission',()=>{assert.equal(a.imported.mission,originalMission);assert.match(elements['radlab-status'].textContent,/No se pudo consultar/);assert.equal(elements['radlab-query'].disabled,false)});
  sandbox.fetch=async()=>({ok:false,status:503,text:async()=>''});await a.queryRadLab();
  check('HTTP failure is handled without rendering stale readings',()=>{assert.match(elements['radlab-status'].textContent,/No se pudo consultar/);assert.equal(elements['radlab-results'].hidden,true)});
  sandbox.fetch=async()=>({ok:true,status:200,text:async()=>'{not json'});await a.queryRadLab();
  check('Malformed JSON is handled without affecting imported data',()=>{assert.match(elements['radlab-status'].textContent,/No se pudo consultar/);assert.equal(a.imported.mission,originalMission)});
  sandbox.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify([])});await a.queryRadLab();
  check('Empty but valid response is reported as no readings',()=>{assert.equal(elements['radlab-results'].hidden,false);assert.match(elements['radlab-summary'].textContent,/no hubo lecturas/)});
  console.log(count+' RadLab checks passed. Live NASA connectivity and browser CORS were not verified.');
})().catch(error=>{console.error(error);process.exitCode=1});
