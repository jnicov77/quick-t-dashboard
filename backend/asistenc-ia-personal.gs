/**
 * Add-on for APPS-SCRIPT-COMPLETO.gs (V8 runtime).
 * Rename original doGet/doPost to legacyDoGet/legacyDoPost before adding this file.
 * Uses existing _getSpreadsheet(). Never replaces the historical eventos schema.
 * Configure Script Property PERSONAL_ADMIN_TOKEN (16+ chars) outside source control.
 * See asistenc-ia-deploy.md. NOT automatically deployed by GitHub Pages.
 */
const QT_PERSONAL_HEADERS = ['uid','nombre','fecha_registro','cedula','cargo','area','extras'];
function qtJson(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function qtArea(value) {
  var key = String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (['admin','administracion','administrativa'].indexOf(key) >= 0) return 'Administración';
  if (['operacion','operaciones','operativa'].indexOf(key) >= 0) return 'Operación';
  return String(value || '').trim();
}
function qtUid(value) { return String(value || '').trim().toUpperCase(); }
function qtValidUid(uid) { return /^(?:[0-9A-F]{2}:){3}[0-9A-F]{2}$|^(?:[0-9A-F]{2}:){6}[0-9A-F]{2}$|^(?:[0-9A-F]{2}:){9}[0-9A-F]{2}$/.test(uid); }
function qtRead(name) {
  var sh = _getSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getDataRange().getValues();
  var keys = data.shift().map(function(k){return String(k).trim().toLowerCase();});
  return data.filter(function(r){return r.some(function(c){return c !== '';});}).map(function(r){
    var obj = {}; keys.forEach(function(k,i){if(k) obj[k] = r[i] == null ? '' : r[i] instanceof Date ? r[i].toISOString() : String(r[i]);}); return obj;
  });
}
function qtPersonnel() {
  return qtRead('empleados').map(function(p){
    p.uid = qtUid(p.uid); p.nombre = String(p.nombre || '').trim(); p.area = qtArea(p.area);
    try { p.extras = JSON.parse(p.extras || '{}'); } catch(e) { p.extras = {}; }
    return p;
  });
}
function qtEvents() {
  return qtRead('eventos').concat(qtRead('eventos_nfc')).map(function(r){
    var uid = qtUid(r.uid || r.identificacion);
    return {uid:uid, identificacion:uid, nombre:r.nombre || r.employee_name || '',
      area:qtArea(r.device_loc || r.location || r.area), location:qtArea(r.device_loc || r.location || r.area),
      device_id:r.device_id || '', timestamp:r.timestamp || '', action:r.action || '', entrada:r.entrada || '', salida:r.salida || ''};
  });
}
function qtPending() {
  var people = qtPersonnel(), events = qtEvents(), used = {}, pending = {};
  people.forEach(function(p){if(p.nombre && p.uid) used[p.uid] = true;});
  events.forEach(function(r){if(r.nombre && r.uid) used[r.uid] = true;});
  events.concat(people).forEach(function(r){
    if(qtValidUid(r.uid) && !r.nombre && !used[r.uid]) pending[r.uid] = {uid:r.uid,area:qtArea(r.area)};
  });
  return Object.keys(pending).sort().map(function(uid){return pending[uid];});
}
function qtSafeCell(value) {
  var s = String(value == null ? '' : value);
  // Plain-text format plus escape for formula-leading text. Sheets returns the literal value.
  return /^[=+@-]/.test(s) ? "'" + s : s;
}
function qtWritePersonnel(people) {
  var ss = _getSpreadsheet(), sh = ss.getSheetByName('empleados') || ss.insertSheet('empleados');
  var headers = sh.getLastRow() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(k){return String(k).trim().toLowerCase();}) : [];
  QT_PERSONAL_HEADERS.forEach(function(k){if(headers.indexOf(k)<0) headers.push(k);});
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if (people.length) sh.getRange(2,1,people.length,headers.length).setNumberFormat('@').setValues(people.map(function(p){
    return headers.map(function(k){return qtSafeCell(k === 'extras' ? JSON.stringify(p.extras || {}) : p[k]);});
  }));
}
function qtValidatePerson(row) {
  if (!row || typeof row !== 'object') throw new Error('Fila de personal inválida.');
  var p = {};
  ['nombre','cedula','cargo','area'].forEach(function(k){
    p[k] = String(row[k] || '').trim();
    if(!p[k] || p[k].length > 500) throw new Error('Campo obligatorio o demasiado largo: ' + k);
  });
  if (/^[=+@-]|[\r\n]/.test(p.cedula)) throw new Error('Cédula inválida.');
  p.area = qtArea(p.area);
  if(['Administración','Operación'].indexOf(p.area)<0) throw new Error('Área debe ser Administración u Operación.');
  p.uid = qtUid(row.uid);
  if(p.uid && !qtValidUid(p.uid)) throw new Error('UID inválido: no se normalizan formatos de tarjeta.');
  p.extras = row.extras && typeof row.extras === 'object' && !Array.isArray(row.extras) ? row.extras : {};
  if (JSON.stringify(p.extras).length > 10000) throw new Error('Demasiados campos adicionales.');
  p.fecha_registro = new Date().toISOString();
  return p;
}
function qtImportPersonal(rows) {
  if(!Array.isArray(rows) || !rows.length || rows.length>500) throw new Error('Carga entre 1 y 500 empleados.');
  var people = qtPersonnel(), ids = {}, used = {};
  people.forEach(function(p){if(p.cedula) ids[p.cedula]=true;if(p.uid && p.nombre) used[p.uid]=true;});
  qtEvents().forEach(function(e){if(e.nombre && e.uid) used[e.uid]=true;});
  var incoming = rows.map(qtValidatePerson);
  incoming.forEach(function(p){
    if(ids[p.cedula]) throw new Error('Cédula ya registrada o repetida: ' + p.cedula);
    ids[p.cedula]=true;
    if(p.uid && used[p.uid]) throw new Error('NFC ya asignado o repetido: ' + p.uid);
    if(p.uid) used[p.uid]=true;
  });
  var pool = qtPending().filter(function(p){return !used[p.uid];});
  incoming.forEach(function(p){
    if(!p.uid) {
      var i = pool.findIndex(function(card){return card.area === p.area;});
      if(i>=0) p.uid = pool.splice(i,1)[0].uid;
    }
    var blank = p.uid ? people.findIndex(function(old){return old.uid === p.uid && !old.nombre;}) : -1;
    if(blank>=0) people[blank]=p; else people.push(p);
  });
  qtWritePersonnel(people);
  return {status:'ok', count:incoming.length};
}
function qtAssignNfc(data) {
  var uid = qtUid(data.uid), nombre = String(data.nombre || '').trim(), area = qtArea(data.area);
  if(!qtValidUid(uid) || !nombre || nombre.length>120 || ['Administración','Operación'].indexOf(area)<0) throw new Error('UID, nombre y área válidos son obligatorios.');
  var people = qtPersonnel();
  var assigned = people.find(function(p){return p.uid === uid && p.nombre;});
  if(assigned) {
    if(assigned.nombre === nombre && assigned.area === area) return {status:'ok',uid:uid}; // Safe retry.
    throw new Error('El NFC ya está asignado. No se sobrescribió el empleado.');
  }
  if(!qtPending().some(function(card){return card.uid===uid;})) throw new Error('El NFC no está pendiente. Actualiza la lista.');
  var matches = people.filter(function(p){return !p.uid && p.nombre === nombre && p.area === area;});
  if(matches.length>1) throw new Error('Hay empleados homónimos pendientes. Vincula el UID con la cédula en Sheets.');
  var blank = people.find(function(p){return p.uid===uid && !p.nombre;});
  if(matches.length) {
    matches[0].uid=uid;
    if(blank) { blank.uid=''; } // Blank row remains harmless; preserve existing range length.
  } else if(blank) Object.assign(blank,{nombre:nombre,area:area});
  else people.push({uid:uid,nombre:nombre,area:area,cedula:'',cargo:'',extras:{},fecha_registro:new Date().toISOString()});
  qtWritePersonnel(people);
  return {status:'ok',uid:uid};
}
function qtCaptureEvent(data) {
  var uid=qtUid(data.uid || data.identificacion), action=String(data.action || data.accion || '').toUpperCase();
  if(!qtValidUid(uid) || ['ENTRADA','SALIDA'].indexOf(action)<0) throw new Error('Evento NFC inválido.');
  var person=qtPersonnel().find(function(p){return p.uid===uid && p.nombre;});
  var timestamp=String(data.timestamp || data.hora || new Date().toISOString());
  if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(timestamp)) throw new Error('Timestamp inválido.');
  var area=qtArea(data.DEVICE_LOC || data.device_loc || data.location || data.area);
  var name=person ? person.nombre : String(data.nombre || data.employee_name || '').trim();
  var ss=_getSpreadsheet(), sh=ss.getSheetByName('eventos_nfc') || ss.insertSheet('eventos_nfc');
  if(!sh.getLastRow()) sh.appendRow(['uid','nombre','timestamp','action','device_id','location']);
  sh.getRange(sh.getLastRow()+1,1,1,6).setNumberFormat('@').setValues([[uid,name,timestamp,action,String(data.device_id || ''),area].map(qtSafeCell)]);
  return {status:'ok',ok:true,uid:uid,nombre:name,employee_name:name,action:action};
}
function qtWithLock(fn) {
  var lock=LockService.getScriptLock(); lock.waitLock(30000);
  try { return fn(); } finally {lock.releaseLock();}
}
function doGet(e) {
  var data=e && e.parameter || {}, action=String(data.action || data.accion || '').toLowerCase();
  try {
    if(action==='empleados' || action==='registro_lista') {
      if(data.capabilities==='1') return qtJson({personal_version:1,empleados:qtPersonnel().map(function(p,i){
        return {id:'personal-'+i,uid:p.uid,nombre:p.nombre,area:p.area}; // Never publish cédulas or extra fields.
      }),pending:qtPending()});
      // Keep old firmware list contract and do not send unassigned employees as empty UID records.
      return qtJson(qtPersonnel().filter(function(p){return p.uid && p.nombre;}).map(function(p){return {uid:p.uid,nombre:p.nombre,fecha_registro:p.fecha_registro};}));
    }
    if(action==='today') {
      var byUid={}; qtPersonnel().forEach(function(p){if(p.uid) byUid[p.uid]=p;});
      return qtJson(qtEvents().filter(function(r){
        if(!data.fecha && !data.hasta) return true;
        var day=String(r.timestamp || r.entrada || r.salida).slice(0,10), last=data.hasta || data.fecha;
        return day && (!data.fecha || day>=data.fecha) && (!last || day<=last);
      }).map(function(r){
        if(byUid[r.uid] && byUid[r.uid].nombre) r.nombre=byUid[r.uid].nombre;
        return r;
      }));
    }
    if((data.uid || data.identificacion) && (action==='entrada' || action==='salida')) return qtJson(qtWithLock(function(){return qtCaptureEvent(data);}));
    // Serialize legacy employee registration too, so an import cannot race the device.
    if(action==='registro' || action==='registrar' || data.target==='empleados') return qtWithLock(function(){return legacyDoGet(e);});
    return legacyDoGet(e);
  } catch(err) {return qtJson({status:'error',msg:err.message});}
}
function doPost(e) {
  try {
    var data=e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : (e && e.parameter || {});
    var action=String(data.action || data.accion || '').toLowerCase();
    if(action==='importar_personal' || action==='asignar_nfc' || action==='leer_personal') {
      var secret=PropertiesService.getScriptProperties().getProperty('PERSONAL_ADMIN_TOKEN');
      if(!secret || secret.length<16 || data.admin_token!==secret) throw new Error('Clave de administración inválida o no configurada.');
      if(action==='leer_personal') return qtJson({status:'ok',empleados:qtPersonnel()});
      return qtJson(qtWithLock(function(){return action==='importar_personal' ? qtImportPersonal(data.employees) : qtAssignNfc(data);}));
    }
    if((data.uid || data.identificacion) && (action==='entrada' || action==='salida')) return qtJson(qtWithLock(function(){return qtCaptureEvent(data);}));
    return qtWithLock(function(){return legacyDoPost(e);});
  } catch(err) {return qtJson({status:'error',msg:err.message});}
}
