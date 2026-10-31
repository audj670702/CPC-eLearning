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
2. `EVIDENCE_PREPARE` (por archivo): el backend crea la sesión de carga reanudable en la carpeta vinculada del curso y devuelve `uploadUrl`.
3. Subida directa con `PUT` a `uploadUrl`, con progreso por archivo. Si ya hay `driveFileId` local, no se vuelve a subir.
4. `EVIDENCE_CONFIRM` (por archivo): el backend verifica en Drive que el archivo esté en la carpeta del curso y que el tamaño coincida, y registra la evidencia.
5. `EVIDENCE_CLOSE`: cierra la carga cuando todos los archivos del lote están confirmados.

Si un archivo falla, los demás continúan y el reintento solo repite lo pendiente: la subida ya hecha o la confirmación.

Límite por archivo: 25 MiB (el mismo tope de GESTIÓN). Máximo 20 archivos por lote.

La precarga se conserva en IndexedDB y las marcas de asistencia en localStorage, separadas por miembro y clase. El envío requiere conexión; no hay sincronización después del cierre del horario.

## Backend y estado de integración

- `tests/academic-core.fixture.js` contiene la lógica del control académico (v0.14.0; incluye `LINK_FOLDER`). Retiró el puente de Apps Script y los fragmentos en Wix (`CPC_EvidenciaPartes`).
- `ccaDrive` (en ese archivo) es la conexión con Drive de la EO. **Pendiente:** enlazarla al componente Drive normalizado de SYS (OAuth de la EO por el admin principal, alcance `drive.file`). Mientras no esté enlazada, las operaciones de evidencias fallan con un mensaje claro y la asistencia sigue funcionando.
- **Carpeta por curso:** se vincula una vez, al crear el curso, como parte de su configuración. El admin principal de la EO crea "<curso> EVIDENCIAS" en su Drive y la elige con el selector de Google (`cpc-drive-picker.js`). `LINK_FOLDER` valida que quien lo hace sea el admin principal de la EO del curso, verifica que la app pueda escribir en la carpeta y guarda `carpetaEvidenciasDriveId`. Con `drive.file` no se puede pegar un ID a mano.
- **Nombre del archivo:** `<curso>_C<clase>_<aaaammdd>_<consecutivo>.<ext>`, p. ej. `C-2605_C01_20261031_01.jpg`. El consecutivo se asigna al reservar el lote y se conserva en los reintentos.
- **Pendiente para el selector:** credenciales del proyecto OAuth (identificador de cliente, clave de API y número de proyecto) y el token de acceso del navegador. El módulo no guarda ninguno de esos valores.
- **Drive:** `ccaDrive` es un adaptador a `backend/sysGoogleDrive` (SYS), el mismo que usa GESTIÓN: `sysDriveCrearSesionCarga` (sesión de subida, origen `https://cpc.scad.mx`), `sysDriveInfoArchivo` (confirmación y verificación de la carpeta). El archivo real importa esas funciones desde ese módulo.
- **Origen:** `origenSeguro` acepta cualquier subdominio de `scad.mx`, así que `https://cpc.scad.mx` ya está permitido. No requiere cambios.
- **Redirect URI:** el regreso de Google es único para todas las apps (`https://www.scad.mx/_functions/sysGoogleCallback`) y el `state` identifica la app. CPC no necesita registrar otra URI.
- **Pendiente (SYS):** `sysDriveInfoArchivo` pide solo `id,name,mimeType,size,parents,createdTime`; no devuelve `capabilities.canAddChildren`. Sin ese dato la vinculación de carpeta se rechaza. Se corrige agregando `capabilities` a los campos pedidos o con una función `sysDriveVerificarCarpeta` que devuelva `canAddChildren`.
- **Pendiente:** el `eoId` del curso. `sysDriveResolverAdmin` identifica la EO por `app` y `codigoEO`, así que CPC debe conocer su `codigoEO` (o el del curso) y resolverlo a `SCaD_EO._id`.
- **Pendiente (selector):** el token para el Picker en el navegador. SYS nunca entrega autorización al navegador. Propuesta: obtener un token de corta duración con Google Identity Services usando el identificador de cliente (público), no el secreto. El permiso del selector aplica al mismo cliente y cuenta; por eso el selector debe usar la cuenta que conectó Drive (`cuentaEmail` de `sysDriveEstado`).
- **Histórico:** los cursos con carpeta anterior (URL manual) no se migran por ahora.
- `backend/cpcInstructorHttp.js` delega al mismo control académico. `backend/http-functions-instructor.integration.txt` muestra la conexión pendiente en el `http-functions.js` vigente de Wix; no lo reemplaza.
- Los recibos usan CPC_Asistencias y sus campos existentes.

La validación en producción está pendiente: OAuth real, escritura en Wix y Drive, y revisión visual en teléfono.

## Validación

Ejecutar `npm ci` y `npm test`.

Las pruebas cubren identidad, asignación, horario, cierre inmutable, privacidad del panel, lote fijo, subida a Drive simulada, reintento tras fallo de confirmación, calendario/lista y controles de la interfaz (pestañas, estado anclado por sección). Wix y Drive se simulan; el DOM se prueba con jsdom. No valida geometría ni comportamiento en navegador real.
