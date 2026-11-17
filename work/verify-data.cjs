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
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/,'globalThis.api={parseCSV,parseDate,validateDataset,fields,measures,imported,controls,readFile,reviewData,commitData,filteredRecords,renderImported,csvExport,plot};})();'),sandbox);
const a=sandbox.api;let count=0;function check(name,fn){fn();count++;console.log('PASS '+name)}
const mapping={person:0,date:1,hr:2,sleep:3,spo2:-1,temp:-1,mass:-1,reaction:-1},units={hr:'bpm',sleep:'h'};
const csv='persona,fecha,pulso_bpm,sueno_h\nA,2026-09-02,65,7\nA,2026-09-01,62,7.5\nB,2026-09-01,70,\nA,2026-09-03,,8';
const validate=(text=csv,map=mapping,u=units,p='Persona 1',name='Misión')=>a.validateDataset(a.parseCSV(text),map,u,p,name);
check('CSV handles BOM, delimiters, quoted separators, escaped quotes and line breaks',()=>{
  for(const delim of [',',';','\t']){const parsed=a.parseCSV('\uFEFFpersona'+delim+'fecha'+delim+'pulso\r\n"A'+delim+'B"'+delim+'2026-09-01'+delim+'62\r\n');assert.equal(parsed.delimiter,delim);assert.equal(parsed.rows[0][0],'A'+delim+'B')}
  const p=a.parseCSV('a,b\n"A""B","first\nsecond"');assert.equal(p.rows[0][0],'A"B');assert.equal(p.rows[0][1],'first\nsecond');
});
check('Malformed, empty, oversized and ambiguous-header files are rejected',()=>{
  for(const text of ['','a,b','a,a\n1,2','a,\n1,2','a,b\n"bad,2','a,b\n"x"evil,2','a,b\n1,\uFFFD','a,b\n1,\0','a,b\n'+('x'.repeat(501))+',2'])assert.throws(()=>a.parseCSV(text));
  assert.throws(()=>a.parseCSV('x'.repeat(2*1024*1024+1)));assert.throws(()=>a.parseCSV('a,b\n'+Array(5001).fill('1,2').join('\n')));
});
check('Strict dates reject rollover, ambiguous dates, missing zones and invalid times',()=>{
  for(const date of ['2026-02-30','2025-02-29','30/09/2026','2026-13-01','2026-09-01T24:00:00Z','2026-09-01T10:30:00','2026-09-01T10:30:00+02:00','1800-01-01'])assert.equal(a.parseDate(date),null,date);
  assert.ok(a.parseDate('2024-02-29'));assert.equal(a.parseDate('2026-09-01T10:30:00.1Z').date,'2026-09-01T10:30:00.100Z');
});
check('Validation sorts records and preserves missing values and zero',()=>{
  const r=validate();assert.equal(r.errors.length,0);assert.equal(r.records.length,4);assert.equal(r.missing,2);assert.equal(r.records[0].date,'2026-09-01');assert.equal(r.records[1].values.sleep,null);
  const zero=validate('persona,fecha,pulso_bpm,sueno_h\nA,2026-09-01,0,0');assert.equal(zero.records[0].values.hr,0);
});
check('Mapping requires a mission, date, measurements, distinct columns and confirmed units',()=>{
  for(const r of [validate(csv,mapping,{}),validate(csv,{...mapping,date:-1}),validate(csv,{...mapping,hr:-1,sleep:-1}),validate(csv,{...mapping,hr:1}),validate(csv,{...mapping,hr:100}),validate(csv,mapping,units,'',''),validate(csv,{...mapping,person:-1},units,'')])assert.ok(r.errors.length);
  assert.equal(validate(csv,{...mapping,person:-1},units,'ID único').records[0].person,'ID único');
});
check('Duplicates, conflicting precision, row width and empty rows block import',()=>{
  const header='persona,fecha,pulso_bpm,sueno_h\n';
  for(const body of ['A,2026-09-01,62,7\nA,2026-09-01,64,8','A,2026-09-01T00:00:00Z,62,7\nA,2026-09-01T00:00:00.000Z,64,8','A,2026-09-01,62,7\nB,2026-09-01T01:00:00Z,64,8','A,2026-09-01,62','A,2026-09-01,,'])assert.ok(validate(header+body).errors.length);
});
check('Numeric formats, domain bounds and identifiers are checked without clinical thresholds',()=>{
  for(const value of ['NaN','Infinity','=1+1','62 bpm','1,000,000','-1','1000001'])assert.ok(validate('persona;fecha;pulso_bpm;sueno_h\nA;2026-09-01;'+value+';7').errors.length);
  assert.equal(validate('persona;fecha;pulso_bpm;sueno_h\nA;2026-09-01;62,5;7,25').records[0].values.hr,62.5);
  for(const person of ['=SUM(1)','+1','-X','@formula',''])assert.ok(validate('persona,fecha,pulso_bpm,sueno_h\n'+person+',2026-09-01,62,7').errors.length);
  const r=a.validateDataset(a.parseCSV('fecha,spo2,temp\n2026-09-01,101,-1'),{person:-1,date:0,spo2:1,temp:2},{spo2:'%',temp:'°C'},'A','Test');assert.ok(r.errors.some(e=>e.includes('SpO₂')));
});
check('CSV export is lossless across reimport for all people, missing cells and decimals',()=>{
  const first=validate(),out=a.csvExport(first),second=validate(out);assert.equal(second.errors.length,0);assert.equal(JSON.stringify(second.records),JSON.stringify(first.records));
});
check('Opening own data and returning to menu only switch the relevant panels',()=>{
  elements['menu-own-data'].events.click();assert.equal(elements['data-workspace'].hidden,false);assert.equal(elements['entry-menu'].hidden,true);assert.equal(elements['mission-dashboard'].hidden,true);elements['data-menu'].events.click();assert.equal(elements['data-workspace'].hidden,true);assert.equal(elements['entry-menu'].hidden,false);
});
function textOf(n){return n.textContent+' '+n.children.map(textOf).join(' ')}
(async()=>{
  await a.readFile({name:'estudio.csv',size:csv.length,text:async()=>csv});elements['data-name'].value='Misión de prueba';for(const f of a.measures)a.controls[f.key].unit.value=f.unit;
  check('Reading file builds preview and suggestions, but requires review before commit',()=>{assert.equal(a.controls.date.select.value,'1');assert.equal(elements['data-commit'].disabled,true);assert.equal(elements['data-mapping'].hidden,false);a.reviewData();assert.equal(elements['data-commit'].disabled,false);assert.equal(a.imported.mission,null)});
  check('Editing configuration invalidates the reviewed import',()=>{elements['data-name'].events.input();assert.equal(a.imported.review,null);assert.equal(elements['data-commit'].disabled,true);a.commitData();assert.equal(a.imported.mission,null);a.reviewData()});
  check('Committing creates an isolated mission and renders charts and paginated readings',()=>{a.commitData();assert.equal(a.imported.mission.name,'Misión de prueba');assert.equal(elements['data-results'].hidden,false);assert.equal(a.filteredRecords().length,3);assert.equal(elements['data-charts'].children.length,2);assert.equal(elements['data-stats'].children.length,2);assert.equal(elements['data-page'].textContent,'Página 1 de 1')});
  check('Person and date filters change only displayed records; inverted range is explicit',()=>{
    elements['data-person'].value='B';elements['data-person'].events.change();assert.equal(a.filteredRecords().length,1);elements['data-person'].value='A';elements['data-from'].value='2026-09-02';elements['data-to'].value='2026-09-02';a.renderImported();assert.equal(a.filteredRecords().length,1);elements['data-to'].value='2026-09-01';a.renderImported();assert.equal(a.filteredRecords(),null);assert.equal(elements['data-charts'].children.length,0);assert.match(elements['data-filter-status'].textContent,/Revisá/);elements['data-reset'].events.click();assert.equal(a.filteredRecords().length,3);
  });
  check('Missing values break chart paths; one reading renders without NaN',()=>{
    const field=a.measures[0],rows=validate().records.filter(r=>r.person==='A');const middle={...rows[1],values:{hr:null}};const plot=a.plot([rows[0],middle,{...rows[2],values:{hr:70}}],field);const svg=plot.children[1],p=svg.children.find(n=>n.tag==='path');assert.equal((p.attributes.d.match(/M/g)||[]).length,2);const single=a.plot([rows[0]],field);assert.ok(!JSON.stringify(single).includes('NaN'));
  });
  check('Export includes records outside active filters and revokes the download URL',()=>{elements['data-person'].value='B';a.renderImported();elements['data-export'].events.click();assert.equal(blobs.length,1);assert.equal(revoked.length,1)});
  const exported=await blobs[0].text();assert.equal(a.parseCSV(exported).rows.length,4);
  const old=a.imported.mission;
  await a.readFile({name:'broken.csv',size:10,text:async()=> 'a,a\n1,2'});
  check('Failed replacement never destroys the active mission',()=>{assert.equal(a.imported.mission,old);assert.equal(a.imported.source,null);assert.equal(elements['data-commit'].disabled,true);assert.match(elements['data-file-status'].textContent,/No se pudo/)});
  await a.readFile({name:'too-big.csv',size:3*1024*1024,text:()=>{throw Error('Must not read oversized file')}});
  check('Oversized files fail before being read',()=>assert.match(elements['data-file-status'].textContent,/2 MB/));
  let resolve;const first=a.readFile({name:'slow.csv',size:1,text:()=>new Promise(r=>resolve=r)});await a.readFile({name:'fast.csv',size:csv.length,text:async()=>csv});resolve('a,a\n1,2');await first;
  check('New file selection wins over an earlier asynchronous read',()=>assert.equal(a.imported.source.filename,'fast.csv'));
  await a.readFile({name:'unsafe.csv',size:100,text:async()=> 'persona,fecha,pulso_bpm\n<img src=x onerror=alert(1)>,2026-09-01,62'});
  check('Imported strings are text nodes, never HTML markup',()=>{assert.ok(textOf(elements['data-preview']).includes('<img src=x onerror=alert(1)>'));assert.ok(!script.includes('.innerHTML'));assert.ok(script.includes("const radLabBase='https://visualization.osdr.nasa.gov/radlab/api/'"));assert.ok(script.includes("credentials:'omit'"));assert.ok(!script.includes('localStorage.'))});
  const rows=Array.from({length:251},(_,i)=>({person:'A',date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),stamp:Date.UTC(2026,0,1+i),values:{hr:60+i%5}}));a.imported.mission={records:rows,active:[a.measures[0]],name:'Large'};elements['data-person'].value='A';
  check('Large series are capped for plotting and fully accessible through pagination',()=>{a.renderImported();assert.match(elements['data-chart-note'].textContent,/200 registros más recientes/);assert.equal(elements['data-page'].textContent,'Página 1 de 6');for(let i=0;i<5;i++)elements['data-next'].events.click();assert.equal(elements['data-page'].textContent,'Página 6 de 6');assert.equal(elements['data-next'].disabled,true);assert.equal(elements['data-table'].children[0].children[1].children.length,1)});
  elements['data-template'].events.click();const template=await blobs.at(-1).text();
  check('Downloadable example can be imported using all supported metrics',()=>{const s=a.parseCSV(template),m=Object.fromEntries(a.fields.map((f,i)=>[f.key,i])),u=Object.fromEntries(a.measures.map(f=>[f.key,f.unit]));const result=a.validateDataset(s,m,u,'','Ejemplo');assert.equal(result.errors.length,0);assert.equal(result.records.length,5)});
  console.log(count+' data checks passed. Browser visuals and actual OS downloads were not verified.');
})().catch(e=>{console.error(e);process.exitCode=1});
