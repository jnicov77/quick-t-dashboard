"""Browser smoke/regression tests. Requires playwright and a Chromium executable.
Run: LAB_CHROME=/path/to/chrome python tests/lab.browser.py [production-url]
"""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = os.environ.get('LAB_CHROME', '/opt/data/.agent-browser/browsers/chrome-151.0.7922.34/chrome')
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = sys.argv[1] if len(sys.argv) > 1 else f'http://127.0.0.1:{server.server_port}/lab.html'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'])
    for width, height in [(1440, 1000), (768, 1024), (390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function("document.body.dataset.scene === 'ready'", timeout=30000)
        assert not errors, errors
        assert page.locator('#scene canvas').count() == 1
        assert page.locator('.agent-label').count() == 6
        assert page.locator('.scene-label').count() == 3
        assert page.locator('.project-links a').count() == 6
        assert page.locator('#dashboard-count').inner_text() == '6'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'
        before = page.locator('#live-clock').inner_text()
        page.wait_for_timeout(1200)
        assert page.locator('#live-clock').inner_text() != before, 'Clock did not tick'
        assert page.locator('#toggle-motion').get_attribute('aria-pressed') == 'true'
        page.locator('#toggle-motion').click()
        assert page.locator('#toggle-motion').get_attribute('aria-pressed') == 'false'
        page.locator('#toggle-motion').click()
        page.locator('#reset-view').click()
        original = page.locator('.agent-label').first.bounding_box()
        canvas = page.locator('#scene canvas').bounding_box()
        page.mouse.move(canvas['x'] + canvas['width']*.5, canvas['y'] + canvas['height']*.82)
        page.mouse.down()
        page.mouse.move(canvas['x'] + canvas['width']*.65, canvas['y'] + canvas['height']*.82, steps=10)
        page.mouse.up()
        page.wait_for_timeout(300)
        rotated = page.locator('.agent-label').first.bounding_box()
        assert abs(original['x'] - rotated['x']) > 1, 'Orbit drag did not change camera'
        page.locator('#reset-view').click()
        page.wait_for_timeout(300)
        reset = page.locator('.agent-label').first.bounding_box()
        assert abs(original['x'] - reset['x']) < 2, 'Camera reset failed'
        # All projected labels must be inside the scene on its default camera.
        bounds = page.locator('#scene').bounding_box()
        page.screenshot(path=f'/tmp/quickt-lab-{width}.png', full_page=True)
        for label in page.locator('.agent-label,.scene-label').all():
            box = label.bounding_box()
            assert box and bounds['x'] <= box['x'] and box['x'] + box['width'] <= bounds['x'] + bounds['width'], label.inner_text()
            assert bounds['y'] <= box['y'] and box['y'] + box['height'] <= bounds['y'] + bounds['height'], label.inner_text()
        panel_boxes = [label.bounding_box() for label in page.locator('.scene-label').all()]
        for i, a in enumerate(panel_boxes):
            for b in panel_boxes[i+1:]:
                assert a['x'] + a['width'] <= b['x'] or b['x'] + b['width'] <= a['x'] or a['y'] + a['height'] <= b['y'] or b['y'] + b['height'] <= a['y'], f'Overlapping project panels at {width}px'
        screenshot = f'/tmp/quickt-lab-{width}.png'
        page.screenshot(path=screenshot, full_page=True)
        page.get_by_role('button', name='Ver ficha de Mr. Wong', exact=True).click()
        assert page.locator('#agent-wong').evaluate('(el)=>el===document.activeElement && el.classList.contains("selected")')
        results.append({'viewport': width, 'scene': 'ready', 'agents': 6, 'panels': 3, 'links': 6, 'clock': 'ticks', 'screenshot': screenshot, 'errors': errors})
        page.close()
    # A blocked CDN must not hide the ecosystem or break the independent clock.
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.route('**/unpkg.com/**', lambda route: route.abort())
    page.goto(url, wait_until='networkidle')
    page.wait_for_function("document.body.dataset.scene === 'fallback'")
    assert page.locator('.agent').count() == 6
    assert page.locator('.project-links a').count() == 6
    assert page.locator('#scene-status').is_visible()
    assert page.locator('#live-clock').inner_text() != '--:--:--'
    results.append({'blocked_cdn': 'fallback retains all data and clock'})
    page.close()
    page = browser.new_page(java_script_enabled=False, viewport={'width':390,'height':844})
    page.goto(url)
    assert page.locator('.agent').count() == 6 and page.locator('.project-links a').count() == 6
    results.append({'javascript_disabled': 'all data and links available'})
    browser.close()
server.shutdown()
print(json.dumps(results, ensure_ascii=False, indent=2))
