/* Personal/NFC: no local-only saves, invented card IDs, or opaque POST success. */
let personalCapabilities = false;
let personalLoadError = '';
let pendingCards = [];
let importRows = [];
let personalBusy = false;
const personalDrafts = new Map();

function parsePersonalCSV(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('Selecciona un CSV o pega las filas de Excel, incluyendo encabezados.');
  if (text.length > 2 * 1024 * 1024) throw new Error('Máximo 2 MB por carga.');
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = ['\t', ';', ','].sort((a,b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  function endCell() { row.push(cell.trim()); cell = ''; closed = false; }
  function endRow() { endCell(); if (row.some(Boolean)) rows.push(row); row = []; }
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === delimiter) endCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; endRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === '"' || (closed && c.trim())) throw new Error('CSV inválido: revisa las comillas.');
    else if (!closed) cell += c;
  }
  if (quoted) throw new Error('CSV inválido: faltan comillas de cierre.');
  if (cell || row.length || closed) endRow();
  const headers = (rows.shift() || []).map(h => h.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim());
  if (new Set(headers).size !== headers.length || headers.includes('')) throw new Error('Encabezados vacíos o duplicados.');
  for (const key of ['nombre','cedula','cargo','area']) if (!headers.includes(key)) throw new Error('Falta la columna ' + key + '. Formato: Nombre, Cédula, Cargo, Área.');
  if (!rows.length || rows.length > 500) throw new Error('Carga entre 1 y 500 empleados por archivo.');
  const seenIDs = new Set(), seenUIDs = new Set();
  return rows.map((values,index) => {
    const line = index + 2;
    if (values.length !== headers.length) throw new Error(`Fila ${line}: cantidad de columnas incorrecta.`);
    const obj = Object.fromEntries(headers.map((h,i) => [h,values[i]]));
    for (const key of ['nombre','cedula','cargo','area']) if (!obj[key]) throw new Error(`Fila ${line}: falta ${key}.`);
    if (values.some(v => v.length > 500)) throw new Error(`Fila ${line}: un campo supera 500 caracteres.`);
    if (/^[=+@-]/.test(obj.cedula) || /[\r\n]/.test(obj.cedula)) throw new Error(`Fila ${line}: cédula inválida; usa formato de texto.`);
    if (seenIDs.has(obj.cedula)) throw new Error(`Fila ${line}: cédula duplicada ${obj.cedula}.`);
    seenIDs.add(obj.cedula);
    const area = normalizeArea(obj.area);
    if (!['Administración','Operación'].includes(area)) throw new Error(`Fila ${line}: área debe ser Administración u Operación.`);
    const uid = (obj.uid || '').toUpperCase();
    if (uid && (!validNfcUID(uid) || seenUIDs.has(uid))) throw new Error(`Fila ${line}: UID inválido o duplicado. Usa XX:XX:XX:XX (4, 7 o 10 bytes).`);
    if (uid) seenUIDs.add(uid);
    return {nombre:obj.nombre, cedula:obj.cedula, cargo:obj.cargo, area, uid,
      extras:Object.fromEntries(Object.entries(obj).filter(([k]) => !['nombre','cedula','cargo','area','uid'].includes(k)))};
  });
}
function validNfcUID(uid) { return /^(?:[0-9A-F]{2}:){3}[0-9A-F]{2}$|^(?:[0-9A-F]{2}:){6}[0-9A-F]{2}$|^(?:[0-9A-F]{2}:){9}[0-9A-F]{2}$/.test(uid); }

async function personalRequest(url, options = {}) {
  const res = await fetch(url, {...options, cache:'no-store', signal:AbortSignal.timeout(30000)});
  if (!res.ok) throw new Error('Servidor no disponible (HTTP ' + res.status + ').');
  const data = await res.json();
  if (data.status === 'error' || data.ok === false) throw new Error(data.msg || data.error || 'El servidor rechazó la operación.');
  return data;
}
async function fetchPersonal() {
  try {
    // This read is backwards-compatible: the old backend returns only an array.
    const data = await personalRequest(APPS_SCRIPT_URL + '?action=empleados&capabilities=1');
    const rows = Array.isArray(data) ? data : data.empleados;
    if (!Array.isArray(rows)) throw new Error('Respuesta de personal no válida.');
    personal = rows.map(p => ({...p,uid:String(p.uid || '').trim().toUpperCase(),nombre:String(p.nombre || '').trim(),area:normalizeArea(p.area)}));
    personalCapabilities = !Array.isArray(data) && data.personal_version === 1;
    pendingCards = personalCapabilities && Array.isArray(data.pending) ? data.pending : [];
    personalLoadError = '';
    return personal;
  } catch (err) {
    personalCapabilities = false;
    personalLoadError = 'No se pudo consultar personal. Se conservan los últimos datos; vuelve a actualizar.';
    throw err;
  } finally { renderPersonalGate(); }
}
function renderPersonalGate() {
  const message = personalLoadError || (personalCapabilities ?
    'Personal conectado. Guardados verificados en Google Sheets. La clave de administración no se almacena en este navegador.' :
    'El backend actual requiere actualización para guardar áreas, importar personal y asignar NFC. Puedes preparar y revisar el CSV; aún no se enviará.');
  document.getElementById('personalStatus').textContent = message;
  document.getElementById('importBackendStatus').textContent = message;
  document.getElementById('confirmImport').disabled = personalBusy || !personalCapabilities || !importRows.length;
}
function getPendingCards() {
  const assigned = new Set(personal.filter(p => p.nombre).map(p => p.uid));
  const namedEvents = new Set(registros.filter(r => r.nombre).map(r => r.identificacion.toUpperCase()));
  const cards = new Map();
  const candidates = [...pendingCards, ...personal.filter(p => !p.nombre),
    ...registros.filter(r => !r.nombre).map(r => ({uid:r.identificacion,area:r.area}))];
  for (const card of candidates) {
    const uid = String(card.uid || '').trim().toUpperCase();
    if (validNfcUID(uid) && !assigned.has(uid) && !namedEvents.has(uid)) cards.set(uid, {uid, area:normalizeArea(card.area)});
  }
  return [...cards.values()].sort((a,b) => a.uid.localeCompare(b.uid));
}
function renderPendingCards() {
  if (personalBusy) return;
  const body = document.getElementById('pendingNfcBody');
  const cards = getPendingCards();
  if (body.contains && body.contains(document.activeElement) && document.activeElement.matches('input,select')) return; // Keep typing focus during polling.
  document.getElementById('pendingNfcCount').textContent = cards.length;
  body.innerHTML = cards.length ? cards.map((card,i) => {
    const draft = personalDrafts.get(card.uid) || {nombre:'',area:card.area};
    return `<tr data-uid="${escapeHtml(card.uid)}"><td><code>${escapeHtml(card.uid)}</code></td>
      <td class="field"><input id="nfcName${i}" data-name aria-label="Nombre para ${escapeHtml(card.uid)}" maxlength="120" placeholder="Nombre completo" value="${escapeHtml(draft.nombre)}"></td>
      <td><select data-area aria-label="Área para ${escapeHtml(card.uid)}"><option value="">Seleccionar área</option>${['Administración','Operación'].map(a => `<option${a === draft.area ? ' selected' : ''}>${a}</option>`).join('')}</select></td>
      <td><button type="button" class="btn-primary" data-save${personalCapabilities ? '' : ' disabled'}>Guardar</button></td></tr>`;
  }).join('') : '<tr><td colspan="4" class="empty-state">No hay NFC sin nombre. Acerca una tarjeta nueva al lector; su UID debe llegar a Sheets para asignarla aquí.</td></tr>';
}
function invalidateImport() {
  importRows = [];
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('importFeedback').textContent = '';
  renderPersonalGate();
}
function previewImport() {
  invalidateImport();
  try {
    importRows = parsePersonalCSV(document.getElementById('personalPaste').value);
    const existing = new Set(personal.map(p => p.cedula).filter(Boolean));
    const duplicate = importRows.find(p => existing.has(p.cedula));
    if (duplicate) throw new Error('La cédula ' + duplicate.cedula + ' ya está registrada. La carga no sobrescribe empleados.');
    const shown = importRows.slice(0,20);
    document.getElementById('importPreview').innerHTML = `<table><thead><tr><th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Área</th><th>NFC</th></tr></thead><tbody>${shown.map(r => `<tr><td>${escapeHtml(r.nombre)}</td><td>${escapeHtml(r.cedula)}</td><td>${escapeHtml(r.cargo)}</td><td>${escapeHtml(r.area)}</td><td>${escapeHtml(r.uid || 'Automático / pendiente')}</td></tr>`).join('')}</tbody></table>`;
    document.getElementById('importFeedback').textContent = `${importRows.length} empleados válidos. Vista previa: ${shown.length}. Los campos adicionales también se conservarán. Sin UID: se asignan tarjetas reales disponibles de la misma área; el resto queda pendiente de vinculación.`;
  } catch (err) {
    importRows = [];
    document.getElementById('importFeedback').textContent = err.message;
  }
  renderPersonalGate();
}
function matchesImportedRow(saved, expected) {
  return saved && ['nombre','cedula','cargo','area'].every(k => String(saved[k] || '') === expected[k]) &&
    (!expected.uid || saved.uid === expected.uid) && Object.entries(expected.extras).every(([k,v]) => saved.extras && saved.extras[k] === v);
}
async function savePersonalChanges(action, payload, token) {
  if (!personalCapabilities) throw new Error('Actualiza el backend antes de guardar.');
  if (!token.trim()) throw new Error('Ingresa la clave de administración.');
  return personalRequest(APPS_SCRIPT_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action,...payload,admin_token:token})});
}
async function confirmImport() {
  if (personalBusy || !importRows.length) return;
  const rows = importRows.slice();
  const feedback = document.getElementById('importFeedback');
  personalBusy = true;
  document.getElementById('importControls').disabled = true;
  document.getElementById('closeImport').disabled = true;
  renderPersonalGate();
  try {
    feedback.textContent = 'Guardando personal… No cierres esta ventana.';
    await savePersonalChanges('importar_personal', {employees:rows}, document.getElementById('importAdminKey').value);
    const verified = await savePersonalChanges('leer_personal', {}, document.getElementById('importAdminKey').value);
    await fetchPersonal();
    if (!Array.isArray(verified.empleados) || !rows.every(row => matchesImportedRow(verified.empleados.find(p => p.cedula === row.cedula), row))) throw new Error('El servidor respondió, pero no se pudo verificar toda la carga. Actualiza antes de reintentar.');
    const assigned = rows.filter(row => verified.empleados.find(p => p.cedula === row.cedula)?.uid).length;
    importRows = [];
    feedback.textContent = `${rows.length} empleados guardados y verificados. ${assigned} con NFC; ${rows.length-assigned} pendientes de vincular en Asignar NFC. Consulta el UID en Seguimiento Personal antes de entregar cada tarjeta.`;
    document.getElementById('importAdminKey').value = '';
    renderAll();
  } catch (err) {
    feedback.textContent = 'No se confirmó la carga: ' + err.message + ' Si hubo un corte de conexión, actualiza y revisa el personal antes de repetir.';
  } finally {
    personalBusy = false;
    document.getElementById('importControls').disabled = false;
    document.getElementById('closeImport').disabled = false;
    renderPersonalGate(); renderPendingCards();
  }
}
async function assignNfc(row) {
  if (personalBusy) return;
  const uid = row.dataset.uid;
  const nombre = row.querySelector('[data-name]').value.trim();
  const area = row.querySelector('[data-area]').value;
  const feedback = document.getElementById('nfcFeedback');
  if (!nombre || !['Administración','Operación'].includes(area)) { feedback.textContent = 'Escribe el nombre y selecciona el área.'; return; }
  personalBusy = true;
  row.querySelector('[data-save]').disabled = true;
  try {
    feedback.textContent = 'Asociando NFC…';
    await savePersonalChanges('asignar_nfc', {uid,nombre,area}, document.getElementById('nfcAdminKey').value);
    await fetchPersonal();
    if (!personal.some(p => p.uid === uid && p.nombre === nombre && p.area === area)) throw new Error('No se pudo verificar la asociación en Sheets.');
    personalDrafts.delete(uid);
    feedback.textContent = `NFC ${uid} asociado a ${nombre}. Verificado en Sheets.`;
    document.getElementById('nfcAdminKey').value = '';
    renderAll();
  } catch (err) { feedback.textContent = 'No se confirmó la asignación: ' + err.message; }
  finally { personalBusy = false; renderPersonalGate(); renderPendingCards(); }
}
function initPersonal() {
  const dialog = document.getElementById('personalDialog');
  document.getElementById('btnAddPersonal').addEventListener('click', () => { renderPersonalGate(); dialog.showModal(); });
  document.getElementById('closeImport').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', e => { if (personalBusy) e.preventDefault(); });
  dialog.addEventListener('close', () => { document.getElementById('importAdminKey').value = ''; document.getElementById('btnAddPersonal').focus(); });
  document.getElementById('personalPaste').addEventListener('input', invalidateImport);
  document.getElementById('personalFile').addEventListener('change', async e => {
    invalidateImport();
    const file = e.target.files[0];
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name) || file.size > 2*1024*1024) {
      document.getElementById('importFeedback').textContent = 'Usa un CSV/TSV de hasta 2 MB. Para .xlsx, copia y pega las celdas o guarda como CSV UTF-8.';
      return;
    }
    try { document.getElementById('personalPaste').value = await file.text(); previewImport(); }
    catch { document.getElementById('importFeedback').textContent = 'No se pudo leer el archivo.'; }
  });
  document.getElementById('previewImport').addEventListener('click', previewImport);
  document.getElementById('confirmImport').addEventListener('click', confirmImport);
  const body = document.getElementById('pendingNfcBody');
  body.addEventListener('input', e => {
    const row = e.target.closest('[data-uid]');
    if (row) personalDrafts.set(row.dataset.uid, {nombre:row.querySelector('[data-name]').value,area:row.querySelector('[data-area]').value});
  });
  body.addEventListener('click', e => { if (e.target.closest('[data-save]')) assignNfc(e.target.closest('[data-uid]')); });
  renderPersonalGate();
}
