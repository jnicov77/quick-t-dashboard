"""Content contract for the public QUICK-T Lab. Run: python3 tests/lab.test.py."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class LabContent(unittest.TestCase):
    def test_real_ecosystem_replaces_concept_placeholders(self):
        html = (ROOT / 'lab.html').read_text()
        required = ['ZORO', 'deepseek-v4.1-flash', '$0.02', '$0.89', 'Mr. Wong',
                    'gemini-4-argon', '$2', '$10', '#1 DeepSWE 77.9%', 'Sanji',
                    'Modelador 3D oficial', 'La Patrona', 'Prospección', 'Pancho',
                    'Pitch', 'Qwen 3B', 'Mr. Jever', 'Clasificador', 'Jev 1.13',
                    '3+', 'JusTTime', 'Bacu', 'Daniel', '~5', 'quickttech.co',
                    'QUICK-T Lab v0.1 · Tecnología ágil para tu operación, en tiempo real',
                    'America/Bogota', 'ROXS GARDEN', 'ASISTENC-IA', 'QUICK-T FOOD']
        for text in required:
            with self.subTest(text=text):
                self.assertTrue(text in html, f'Missing required content: {text}')
        self.assertEqual(len(re.findall(r'data-agent="', html)), 6)
        for name in ['food-landing', 'amelia-food', 'bacu-food', 'roxs-ble', 'asistenc-ia', 'roxs-ar']:
            self.assertIn(f'href="{name}.html"', html)
            self.assertTrue((ROOT / (name + '.html')).is_file())
        for placeholder in ['23.9°C', '12 activos', '8 pedidos hoy', '2 llamados']:
            self.assertNotIn(placeholder, html)

if __name__ == '__main__':
    unittest.main()
