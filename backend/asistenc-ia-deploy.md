# Asistenc-IA — integración de personal y NFC

## Estado comprobado antes del cambio

La URL de Apps Script que contiene `asistenc-ia.html` devolvió:

- `action=today`: registros con `nombre, identificacion, entrada, salida`; los registros observados no traían ubicación y su identificación estaba vacía.
- `action=empleados`: array con `uid, nombre, fecha_registro`.

**Un push a GitHub Pages NO actualiza Apps Script ni firmware.** El frontend funciona con ese backend anterior para seguimiento, pero bloquea las nuevas escrituras y explica la actualización necesaria. No se hicieron escrituras de prueba sobre Sheets de producción.

## Activación de backend (propietario del proyecto Apps Script)

1. Respaldar el código Apps Script y el Sheet. Usar primero una copia de pruebas.
2. El complemento `asistenc-ia-personal.gs` se integra con el código existente `APPS-SCRIPT-COMPLETO.gs`, que define `_getSpreadsheet()`.
3. Renombrar **solo las declaraciones** originales `function doGet(e)` → `function legacyDoGet(e)` y `function doPost(e)` → `function legacyDoPost(e)`. Debe quedar exactamente un `doGet` y un `doPost`: los del complemento. No borrar las funciones auxiliares originales.
4. Crear un archivo de script `Personal.gs` y pegar el complemento. Runtime V8.
5. En Configuración del proyecto → Propiedades de secuencia de comandos, crear `PERSONAL_ADMIN_TOKEN` con una clave aleatoria privada de al menos 16 caracteres. No ponerla en HTML, repositorios, parámetros GET ni mensajes públicos. Compartirla con administración por un canal seguro. La interfaz la usa solo en cuerpos POST y no la guarda en localStorage.
6. **Implementar → Administrar implementaciones → Editar → Nueva versión → Implementar** conservando la misma URL `/exec`. Conservar la configuración de acceso requerida por los dispositivos. Si cambia la URL, actualizar frontend **y ambos dispositivos** antes de sustituir el despliegue anterior.
7. Comprobar `GET /exec?action=empleados&capabilities=1`: debe devolver `personal_version: 1`, `empleados` y `pending`. El frontend habilita guardados automáticamente al actualizar.
8. Probar en el Sheet de pruebas: cargar CSV, comprobar todas sus columnas en `empleados`, pasar un NFC nuevo, asignar nombre/área y verificar nueva marcación. Repetir con una sola tarjeta autorizada en producción después de desplegar. No borrar datos reales para probar.

### Cambios de almacenamiento

- `empleados` conserva las primeras columnas antiguas e incorpora `cedula, cargo, area, extras`. Las cédulas se escriben como texto; no convertirlas a números. Las columnas desconocidas existentes se conservan.
- Las marcaciones con UID válido van a **`eventos_nfc`**, una hoja adicional en el mismo Spreadsheet: `uid, nombre, timestamp, action, device_id, location`.
- `eventos` histórico **no se reescribe**. `action=today` combina ambos orígenes; ubicación histórica ausente permanece ausente.
- `action=empleados` sin capabilities conserva la lista UID/nombre compatible con firmware y no incluye empleados aún sin tarjeta.
- Importación y asignación usan bloqueo de script. Duplicados se rechazan antes de escribir; no se renombra ni reasigna una tarjeta ajena silenciosamente.
- `leer_personal` es una lectura POST autenticada usada para verificar la carga. Cédulas y columnas adicionales **no se incluyen en las nuevas lecturas públicas**. El modelo heredado continúa exponiendo nombres, UIDs y asistencia: no equivale a un portal privado con login. Para datos de RR. HH. sensibles, implementar autenticación real del dashboard y restringir el Sheet. Las rutas antiguas de registro de dispositivos conservan su seguridad previa.

## Requisitos del ESP32 (ambos dispositivos)

- Enviar el **UID real**, incluso si no existe nombre: `uid=AA:BB:CC:DD`.
- Enviar `action=ENTRADA` o `SALIDA` y timestamp con fecha y hora.
- Enviar `location` o `DEVICE_LOC` con **Administración** u **Operación**, más `device_id` distinto por dispositivo.
- La primera lectura de tarjeta desconocida debe enviarse sin nombre; no exigir teclear el nombre en el dispositivo ni mandar un nombre ficticio.
- El backend resuelve el nombre por UID para eventos futuros, aunque el lector no haya actualizado su caché. Para mostrar también el nombre en la pantalla ESP32, el firmware debe consumir la lista `action=empleados` o el `employee_name` devuelto por la marcación. Esta entrega no modifica ni flashea firmware.
- El complemento no puede recuperar UIDs ni ubicaciones que nunca llegaron a Sheets.

## Flujo de oficina

- **Agregar Personal**: CSV UTF-8, separado por coma/punto y coma, o pegar tabla tabulada de Excel. Encabezados `Nombre, Cédula, Cargo, Área`; columna `UID` opcional. `.xlsx` se usa mediante copiar/pegar o Guardar como CSV, no carga binaria directa. Máximo 500 filas / 2 MB. Vista previa muestra hasta 20 filas, pero informa y procesa el total.
- Las áreas aceptadas son Administración y Operación (también Admin/Operacion sin tilde).
- Sin UID: el servidor asigna tarjetas **reales detectadas y libres de la misma área**, ordenadas por UID. Si faltan, el empleado se guarda pendiente; no se inventan UIDs. Consultar la asociación en Seguimiento antes de entregar las tarjetas. Para una relación exacta ya conocida, incluir UID en el CSV.
- **Asignar NFC**: escribir nombre y área junto al UID pendiente. Si coincide exactamente con un empleado importado sin tarjeta y de la misma área, lo vincula sin duplicarlo. Homónimos ambiguos se rechazan: resolver por cédula en Sheets.
- Importación confirma éxito solo después de releer todos los campos; asignación confirma UID/nombre/área. Si falla la conexión, revisar Sheets antes de repetir. Una carga duplicada es rechazada, no añadida de nuevo.
- Los contadores por área representan personas con marcación **hoy en Colombia**, no cantidad de lectores conectados ni ocupación inferida. Una persona puede aparecer en ambas áreas. Todos deduplica personas. Las tablas de área reconstruyen sus movimientos independientemente.

## Pruebas reproducibles (sin producción)

```sh
node --test tests/asistenc-ia.test.cjs tests/asistenc-backend.test.cjs
# Instalar Playwright en un venv y disponer de Chromium; CHROME puede sobrescribir su ruta:
python tests/asistenc-browser.py
```

Las pruebas de backend simulan las primitivas Sheets/Lock/Properties de Apps Script. Las de navegador interceptan el endpoint con fixtures identificados como `Fixture`; nunca envían escrituras reales. No sustituyen la verificación del despliegue Apps Script ni de dos dispositivos físicos.
