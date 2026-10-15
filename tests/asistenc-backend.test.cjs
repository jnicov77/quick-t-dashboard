const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function backend(){
 const sheets=new Map();
 function sheet(name){
  if(!sheets.has(name)) sheets.set(name,[]);
  const data=sheets.get(name);
  return {getLastRow:()=>data.length,getLastColumn:()=>Math.max(0,...data.map(r=>r.length)),getDataRange(){return {getValues:()=>data.map(r=>r.slice())};},
   getRange(r,c,n=1,m=1){return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r-1+i]?.[c-1+j]??'')),setNumberFormat(){return this;},setValues(values){values.forEach((row,i)=>row.forEach((v,j)=>{data[r-1+i] ||= [];data[r-1+i][c-1+j]=v;}));return this;}};},
   appendRow(row){data.push(row);}};
 }
 const ctx=vm.createContext({console,Date,JSON,Map,Set,_getSpreadsheet:()=>({getSheetByName:n=>sheets.has(n)?sheet(n):null,insertSheet:sheet}),
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-admin-secret'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return JSON.parse(s);}})},
  legacyDoGet:()=>[],legacyDoPost:()=>({status:'ok'}),_getTodayEvents:()=>[],Utilities:{formatDate:()=>new Date().toISOString()},Session:{getScriptTimeZone:()=> 'America/Bogota'}});
 const file=path.join(__dirname,'../backend/asistenc-ia-personal.gs');
 if(fs.existsSync(file)) vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 return {ctx,run:s=>vm.runInContext(s,ctx),sheets,sheet};
}
test('backend imports full personnel, allocates only real same-area cards, and rejects duplicates before writes',()=>{
 const {run,sheets}=backend();
 assert.equal(run('typeof qtImportPersonal'),'function');
 run(`qtCaptureEvent({uid:'01:02:03:04',action:'ENTRADA',DEVICE_LOC:'Administración',timestamp:'2026-10-15T08:00:00-05:00'});`);
 run(`qtImportPersonal([{nombre:'Ana',cedula:'001',cargo:'Jefa',area:'Administración',uid:'',extras:{correo:'ana@example.test'}},{nombre:'Luis',cedula:'002',cargo:'Operario',area:'Operación',uid:'',extras:{}}]);`);
 assert.equal(run("qtPersonnel().find(p=>p.cedula==='001').uid"),'01:02:03:04');
 assert.equal(run("qtPersonnel().find(p=>p.cedula==='002').uid"),'');
 assert.equal(run("qtPersonnel().find(p=>p.cedula==='001').extras.correo"),'ana@example.test');
 const before=JSON.stringify(sheets.get('empleados'));
 assert.throws(()=>run(`qtImportPersonal([{nombre:'Bob',cedula:'001',cargo:'Jefe',area:'Administración',extras:{}}])`),/registrada/);
 assert.equal(JSON.stringify(sheets.get('empleados')),before);
});
test('assignment joins a pending imported person and resolves future events by UID',()=>{
 const {run}=backend();
 assert.equal(run('typeof qtAssignNfc'),'function');
 run(`qtImportPersonal([{nombre:'Luis',cedula:'002',cargo:'Operario',area:'Operación',extras:{}}]); qtCaptureEvent({uid:'05:06:07:08',action:'ENTRADA',location:'Operación',timestamp:'2026-10-15T08:00:00-05:00'}); qtAssignNfc({uid:'05:06:07:08',nombre:'Luis',area:'Operación'});`);
 assert.equal(run('qtPersonnel().length'),1);
 assert.equal(run("qtPersonnel()[0].cedula"),'002');
 run(`qtCaptureEvent({uid:'05:06:07:08',action:'SALIDA',location:'Operación',timestamp:'2026-10-15T09:00:00-05:00'});`);
 assert.equal(run('qtEvents().at(-1).nombre'),'Luis');
 assert.equal(run('qtPending().length'),0);
 assert.throws(()=>run(`qtAssignNfc({uid:'05:06:07:08',nombre:'Otro',area:'Operación'})`),/asignad/);
});
test('new write routes reject missing admin secret without modifying sheets',()=>{
 const {run,sheets}=backend();
 assert.equal(run('typeof doPost'),'function');
 const result=run(`doPost({postData:{contents:JSON.stringify({action:'importar_personal',employees:[]})}})`);
 assert.equal(result.status,'error');
 assert.match(result.msg,/administración/);
 assert.equal(sheets.size,0);
});
