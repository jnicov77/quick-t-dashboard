const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../asistencia/index.html'), 'utf8');
function app(data) {
  const elements = new Map();
  function element() { return {textContent:'', children:[], disabled:false, dataset:{}, append(...nodes){this.children.push(...nodes)}, replaceChildren(...nodes){this.children=nodes}, setAttribute(){}, addEventListener(){}, classList:{toggle(){}}}; }
  const document = {getElementById(id){if(!elements.has(id)) elements.set(id,element()); return elements.get(id)}, createElement:element, querySelectorAll(){return []}};
  const calls = [];
  const context = vm.createContext({document, console, Intl, Date, AbortController, setTimeout, clearTimeout, fetch:async(url, options)=>{calls.push({url,options}); return {ok:true,json:async()=>data}}});
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  return {run:code=>vm.runInContext(code,context), document,calls};
}
test('JusTTime reads today events, including unnamed UID, into five columns',async()=>{
  assert.match(html, /<title>JusTTime<\/title>/);
  const a = app([{uid:'5A:08:2C:1D',nombre:'',area:'Administración',timestamp:'2026-10-16 11:44:01',action:'ENTRADA'}]);
  await a.run('loadEvents()');
  const row = a.document.getElementById('eventsBody').children[0];
  assert.deepEqual(row.children.map(c=>c.textContent), ['Sin nombre','5A:08:2C:1D','Administración','ENTRADA','11:44:01']);
  assert.ok(a.calls.every(c=>c.url.endsWith('?action=today') && (!c.options.method || c.options.method==='GET')));
});
test('area filters preserve individual events and handle accented aliases',async()=>{
  const a=app([{nombre:'Ana',uid:'01',area:'Administracion',action:'ENTRADA'},{nombre:'Ana',uid:'01',DEVICE_LOC:'Operacion',action:'SALIDA'},{uid:'02',area:'Otra'}]);
  await a.run('loadEvents()');
  a.run("selectArea('Administración')");
  assert.equal(a.document.getElementById('eventsBody').children.length,1);
  assert.equal(a.document.getElementById('eventsBody').children[0].children[2].textContent,'Administración');
  a.run("selectArea('Operación')");
  assert.equal(a.document.getElementById('eventsBody').children[0].children[3].textContent,'SALIDA');
  a.run("selectArea('')");
  assert.equal(a.document.getElementById('eventsBody').children.length,3);
});
test('empty and invalid API responses are distinct and allow retry',async()=>{
  const empty=app([]); await empty.run('loadEvents()');
  assert.match(empty.document.getElementById('eventsBody').children[0].children[0].textContent,/No hay eventos registrados/);
  const invalid=app({error:'unavailable'}); await invalid.run('loadEvents()');
  assert.match(invalid.document.getElementById('status').textContent,/No se pudieron cargar/);
  assert.equal(invalid.document.getElementById('refresh').disabled,false);
});
test('timestamps respect Colombia and strings are rendered only as text',async()=>{
  const a=app([{nombre:'<img src=x onerror=alert(1)>',uid:'01',timestamp:'2026-10-16T16:44:01Z'}]);
  await a.run('loadEvents()');
  assert.equal(a.document.getElementById('eventsBody').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(a.document.getElementById('eventsBody').children[0].children[4].textContent,'11:44:01');
  assert.equal(a.run("eventHour('invalid')"),'—');
  assert.ok(!/NDEFReader|action=empleados|novedades|personal\.js/.test(html));
});
module.exports={app,html};
