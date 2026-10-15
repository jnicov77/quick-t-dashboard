const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function dashboard(){
 const elements=new Map();
 const document={readyState:'loading',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById(id){if(!elements.has(id)) elements.set(id,{value:'',textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}}});return elements.get(id);}};
 const ctx=vm.createContext({document,console,Date,Map,Set,URLSearchParams,AbortSignal,setTimeout,clearTimeout});
 const html=fs.readFileSync(path.join(root,'asistenc-ia.html'),'utf8');
 vm.runInContext(fs.readFileSync(path.join(root,'asistenc-ia-personal.js'),'utf8'),ctx);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1],ctx);
 return {run:code=>vm.runInContext(code,ctx),ctx,document};
}
test('DEVICE_LOC is retained and both areas aggregate independently',()=>{
 const {run}=dashboard();
 assert.equal(run(`normalizeEventoRow({nombre:'Ana',uid:'01',DEVICE_LOC:'Administración'}).area`),'Administración');
 run(`registros=[normalizeEventoRow({uid:'01',nombre:'Ana',DEVICE_LOC:'Admin',action:'ENTRADA',timestamp:hoyColombia()+'T08:00:00-05:00'}),normalizeEventoRow({uid:'01',nombre:'Ana',location:'Operacion',action:'SALIDA',timestamp:hoyColombia()+'T09:00:00-05:00'})]; aggregateEmpleados();`);
 assert.equal(run('empleadosDia.length'),1);
 assert.equal(run('empleadosDia[0].area'),'Operación');
 assert.equal(run("getAreaEmployees('Administración')[0].estado"),'ingreso');
 assert.equal(run("getAreaEmployees('Operación')[0].estado"),'salida');
 assert.equal(run("getAreaEmployees('Administración').length"),1);
 assert.equal(run("normalizeEventoRow({nombre:'Ana'}).area"),'');
});
test('bulk parser accepts CSV, semicolon and Excel paste without losing IDs or extra fields',()=>{
 const {run}=dashboard();
 assert.equal(run('typeof parsePersonalCSV'),'function');
 for(const delimiter of [',',';','\t']) {
  const text=['Nombre,Cédula,Cargo,Área,Correo','Ana,00123,Gerente,Admin,ana@example.test'].map(r=>r.replaceAll(',',delimiter)).join('\r\n');
  const result=run(`parsePersonalCSV(${JSON.stringify('\ufeff'+text)})`);
  assert.equal(result.length,1); assert.equal(result[0].cedula,'00123'); assert.equal(result[0].area,'Administración');
  assert.equal(result[0].extras.correo,'ana@example.test');
 }
 assert.equal(run(`parsePersonalCSV('Nombre,Cédula,Cargo,Área\\n"Ana, María",0001,"Jefa\\nTurno",Operación')[0].nombre`),'Ana, María');
 assert.throws(()=>run(`parsePersonalCSV('Nombre,Cédula,Cargo,Área\\nAna,1,Jefa,Admin\\nBob,1,Jefe,Operación')`),/duplicada/);
 assert.throws(()=>run(`parsePersonalCSV('Nombre,Cédula,Cargo,Área\\nAna,1,Jefa,Otro')`),/área/i);
 assert.throws(()=>run(`parsePersonalCSV('Nombre,Cédula,Cargo,Área\\n"Ana,1,Jefa,Admin')`),/comillas/);
 assert.throws(()=>run(`parsePersonalCSV('Nombre,Cédula,Cargo,Área\\nAna,1,Jefa,Admin,extra')`),/columnas/);
});
test('unassigned cards dedupe and named/invalid UIDs are excluded',()=>{
 const {run}=dashboard();
 run(`personal=[{uid:'01:02:03:04',nombre:'Known',area:'Administración'}]; registros=[{identificacion:'AA:BB:CC:DD',nombre:'',area:'Operación'},{identificacion:'AA:BB:CC:DD',nombre:'',area:'Operación'},{identificacion:'01:02:03:04',nombre:'',area:'Administración'},{identificacion:'not-a-card',nombre:'',area:''}];`);
 assert.equal(run('getPendingCards().length'),1);
 assert.equal(run('getPendingCards()[0].uid'),'AA:BB:CC:DD');
});
test('confirmation refuses an acknowledged write when persisted fields do not match',async()=>{
 const {run,ctx,document}=dashboard();
 run(`personalCapabilities=true; importRows=[{nombre:'Test',cedula:'0005',cargo:'Test',area:'Operación',uid:'',extras:{}}];`);
 document.getElementById('importAdminKey').value='fixture-secret';
 ctx.fetch=async(url,opts)=>({ok:true,json:async()=>opts?.method==='POST' ? {status:'ok',empleados:[]} : {personal_version:1,empleados:[],pending:[]}});
 await run('confirmImport()');
 assert.match(document.getElementById('importFeedback').textContent,/No se confirmó la carga/);
 assert.doesNotMatch(document.getElementById('importFeedback').textContent,/guardados y verificados/);
});
test('Colombia day boundaries and last exit after re-entry stay consistent',()=>{
 const {run}=dashboard();
 run(`registros=[normalizeEventoRow({uid:'01:02:03:04',nombre:'Ana',location:'Operación',entrada:hoyColombia()+' 08:00:00',salida:hoyColombia()+' 10:00:00'}),normalizeEventoRow({uid:'01:02:03:04',nombre:'Ana',location:'Operación',entrada:hoyColombia()+' 11:00:00'})]; aggregateEmpleados();`);
 assert.equal(run('empleadosDia[0].estado'),'ingreso');
 assert.equal(run("eventTime('2026-10-15 08:00:00')"),Date.parse('2026-10-15T13:00:00Z'));
 assert.ok(run("Number.isNaN(eventTime('bad'))"));
});
test('employee area never invents a missing device location',()=>{
 const {run}=dashboard();
 run(`personal=[{uid:'01:02:03:04',nombre:'Ana',area:'Administración'}]; registros=[normalizeEventoRow({uid:'01:02:03:04',nombre:'Ana',action:'ENTRADA',timestamp:hoyColombia()+'T08:00:00-05:00'})]; aggregateEmpleados();`);
 assert.equal(run("getAreaEmployees('Administración')[0].estado"),'sin-registro');
 assert.equal(run('empleadosDia[0].estado'),'ingreso');
});
module.exports={dashboard};
