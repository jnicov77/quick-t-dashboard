"""Browser acceptance tests. Synthetic API fixtures only; never writes production Sheets.
Run with Playwright installed and CHROME pointing to an installed Chromium binary.
"""
import os, json, threading, functools
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/asistenc-ia.html'
today = datetime.now(ZoneInfo('America/Bogota')).date().isoformat()
events = [
 {'uid':'01:02:03:04','employee_name':'Fixture Admin','DEVICE_LOC':'Administración','action':'ENTRADA','timestamp':today+'T08:00:00-05:00'},
 {'uid':'05:06:07:08','employee_name':'Fixture Operación','location':'Operación','action':'SALIDA','timestamp':today+'T09:00:00-05:00'},
 {'uid':'AA:BB:CC:DD','employee_name':'','DEVICE_LOC':'Operación','action':'ENTRADA','timestamp':today+'T10:00:00-05:00'}]
people=[{'uid':e['uid'],'nombre':e['employee_name'],'area':e.get('location',e.get('DEVICE_LOC'))} for e in events if e['employee_name']]
capable=False
writes=[]
fail_write=False

def api(route):
    global people
    request=route.request
    query=parse_qs(urlparse(request.url).query)
    if request.method=='POST':
        payload=request.post_data_json
        if payload['action']=='leer_personal':
            route.fulfill(status=200,content_type='application/json',body=json.dumps({'status':'ok','empleados':people})); return
        writes.append(payload)
        if fail_write:
            route.fulfill(status=200,content_type='application/json',body=json.dumps({'status':'error','msg':'Fixture write rejected'})); return
        if payload['action']=='asignar_nfc':
            people.append({k:payload[k] for k in ['uid','nombre','area']})
        elif payload['action']=='importar_personal':
            people.extend(payload['employees'])
        result={'status':'ok'}
    elif query.get('action')==['empleados']:
        public=[{'id':f'personal-{i}',**{k:v for k,v in employee.items() if k in ['uid','nombre','area']}} for i,employee in enumerate(people)]
        result={'personal_version':1,'empleados':public,'pending':[]} if capable else people
    elif query.get('action')==['today']:
        result=events
    else:
        result=[]
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROME','/opt/hermes/.playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('https://script.google.com/**',api)
    page.goto(URL)
    expect(page.locator('#syncLabel')).to_have_text('Sincronizado')
    expect(page.locator('#countAll')).to_have_text('3')
    expect(page.locator('#countAdmin')).to_have_text('1')
    expect(page.locator('#countOperacion')).to_have_text('2')
    page.locator('#areaFilters [data-area="Administración"]').click()
    expect(page.locator('#tablaSeguimientoBody tr')).to_have_count(1)
    expect(page.locator('#statEmpleados')).to_have_text('1')
    page.locator('#areaFilters [data-area="Operación"]').click()
    expect(page.locator('#tablaSeguimientoBody tr')).to_have_count(2)
    page.locator('#filtroEmpleado').fill('Fixture Operación')
    expect(page.locator('#tablaSeguimientoBody tr')).to_have_count(1)
    page.locator('#filtroEmpleado').fill('')
    page.locator('#btnAddPersonal').click()
    page.locator('#personalPaste').fill('Nombre;Cédula;Cargo;Área;Correo\nFixture Nuevo;0009;Jefa;Administración;test@example.test')
    page.locator('#previewImport').click()
    expect(page.locator('#importFeedback')).to_contain_text('1 empleados válidos')
    expect(page.locator('#confirmImport')).to_be_disabled()
    expect(page.locator('#importBackendStatus')).to_contain_text('requiere actualización')
    page.locator('#closeImport').click()
    print('PASS: area counts, combined filters, legacy backend save gate')
    capable=True
    page.locator('#refreshBtn').click()
    expect(page.locator('#personalStatus')).to_contain_text('Personal conectado')
    expect(page.locator('#pendingNfcBody [data-save]')).to_be_enabled()
    page.locator('#pendingNfcBody [data-name]').fill('Fixture Tarjeta')
    page.locator('#pendingNfcBody [data-area]').select_option('Operación')
    page.locator('#nfcAdminKey').fill('fixture-secret')
    page.locator('#pendingNfcBody [data-save]').click()
    expect(page.locator('#nfcFeedback')).to_contain_text('Verificado en Sheets')
    expect(page.locator('#pendingNfcCount')).to_have_text('0')
    expect(page.locator('#tablaSeguimientoBody')).to_contain_text('Fixture Tarjeta')
    print('PASS: NFC assignment, persisted readback, attendance name reconciliation')
    page.locator('#btnAddPersonal').click()
    page.locator('#importAdminKey').fill('fixture-secret')
    page.locator('#confirmImport').click()
    expect(page.locator('#importFeedback')).to_contain_text('1 empleados guardados y verificados')
    expect(page.locator('#confirmImport')).to_be_disabled()
    assert people[-1]['cedula']=='0009'
    page.locator('#personalPaste').fill('Nombre,Cédula,Cargo,Área\nFixture Error,0010,Jefa,Admin')
    page.locator('#previewImport').click()
    page.locator('#importAdminKey').fill('fixture-secret')
    fail_write=True
    page.locator('#confirmImport').click()
    expect(page.locator('#importFeedback')).to_contain_text('No se confirmó la carga')
    assert not any(p.get('cedula')=='0010' for p in people)
    print('PASS: CSV import, readback verification, error does not claim success')
    page.locator('#closeImport').click()
    page.locator('#areaFilters [data-area=""]').click()
    page.screenshot(path='/tmp/asistenc-desktop.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('scrollTo(0,0)')
    page.locator('#btnAddPersonal').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.locator('#personalDialog').bounding_box()['width']<=390
    page.screenshot(path='/tmp/asistenc-mobile.png',full_page=False)
    page.keyboard.press('Escape')
    expect(page.locator('#personalDialog')).not_to_be_visible()
    assert not errors, errors
    assert len(writes)==3
    print('PASS: desktop/mobile layout, keyboard dialog, zero JS errors; 3 fixture writes only')
    browser.close()
server.shutdown()
