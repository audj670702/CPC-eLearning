# Instructor CPC · App v0.5.36 · módulo v1.1.0

La app reconoce INSTRUCTOR desde CPC_Usuario vinculado al miembro OAuth autenticado. El calendario reúne las clases asignadas en instructor1/instructor2 y los eventos del participante, con un solo evento cuando ambos corresponden a la misma clase. Las clases asignadas tienen distintivo INSTRUCTOR y color naranja, filtro y vista Lista.

El módulo tiene dos flujos independientes, cada uno con su propia pestaña y su propio estado:

- **Asistencia** (`cpc-instructor-asistencia.js`): asistencia por clase y grupo/curso CPC. Los participantes provienen de inscripciones activas incluidas en reportes; los instructores se muestran opcionalmente.
- **Evidencias** (`cpc-instructor-evidencias.js`): precarga de archivos/fotografías antes de ENVIAR y carga directa a Drive.

`cpc-instructor.js` es el shell (lista de clases, modal y carga de la clase). `cpc-instructor-core.js` comparte estado, llamadas a la API, borradores y los estados que se muestran junto a cada botón.

El backend valida identidad, asignación y horario en cada petición. El registro abre al iniciar la clase y cierra al llegar fechaFinProgramada. Una clase sin término válido mantiene el registro cerrado.

## Asistencia

Guardar asistencia crea un recibo inmutable. Los cambios posteriores desde el panel se conservan en el registro administrativo y no cambian la consulta original del instructor. El panel puede regularizar por separado; esos registros no se exponen como envíos del instructor.

## Evidencias (modelo normalizado SYS/GESTIÓN)

El navegador sube el archivo directo a Drive; Wix no recibe el contenido. Pasos:

1. `EVIDENCE_BATCH`: reserva el lote de archivos (fijo; los reintentos usan los mismos identificadores).
2. `EVIDENCE_PREPARE` (por archivo): el backend crea la sesión de carga reanudable en la carpeta de evidencias del curso y devuelve `uploadUrl`.
3. Subida directa con `PUT` a `uploadUrl`, con progreso por archivo. Si ya hay `driveFileId` local, no se vuelve a subir.
4. `EVIDENCE_CONFIRM` (por archivo): el backend verifica en Drive que el archivo esté en la carpeta del curso y que el tamaño coincida, y registra la evidencia.
5. `EVIDENCE_CLOSE`: cierra la carga cuando todos los archivos del lote están confirmados.

Si un archivo falla, los demás continúan y el reintento solo repite lo pendiente: la subida ya hecha o la confirmación.

Límite por archivo: 25 MiB (el mismo tope de GESTIÓN). Máximo 20 archivos por lote.

La precarga se conserva en IndexedDB y las marcas de asistencia en localStorage, separadas por miembro y clase. El envío requiere conexión; no hay sincronización después del cierre del horario.

## Backend y estado de integración

- `tests/academic-core.fixture.js` contiene la lógica del control académico (v0.14.0). Retiró el puente de Apps Script y los fragmentos en Wix (`CPC_EvidenciaPartes`).
- `ccaDrive` (en ese archivo) es la conexión con Drive de la EO. **Pendiente:** enlazarla al componente Drive normalizado de SYS (OAuth de la EO por el admin principal, alcance `drive.file`). Mientras no esté enlazada, las operaciones de evidencias fallan con un mensaje claro y la asistencia sigue funcionando.
- **Pendiente:** con `drive.file`, la app solo ve archivos que creó o que el usuario eligió. Las carpetas de evidencia de cada curso deben crearse desde la app; las carpetas preexistentes no quedan accesibles sin eso.
- **Pendiente:** el nombre del archivo en Drive (`C-1234_S01__26-10-04.jpg`) sigue el patrón del puente anterior; confirmar con el administrador antes de publicar.
- `backend/cpcInstructorHttp.js` delega al mismo control académico. `backend/http-functions-instructor.integration.txt` muestra la conexión pendiente en el `http-functions.js` vigente de Wix; no lo reemplaza.
- Los recibos usan CPC_Asistencias y sus campos existentes.

La validación en producción está pendiente: OAuth real, escritura en Wix y Drive, y revisión visual en teléfono.

## Validación

Ejecutar `npm ci` y `npm test`.

Las pruebas cubren identidad, asignación, horario, cierre inmutable, privacidad del panel, lote fijo, subida a Drive simulada, reintento tras fallo de confirmación, calendario/lista y controles de la interfaz (pestañas, estado anclado por sección). Wix y Drive se simulan; el DOM se prueba con jsdom. No valida geometría ni comportamiento en navegador real.
