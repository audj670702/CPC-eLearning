# Instructor CPC · App v0.5.26

La app reconoce INSTRUCTOR desde CPC_Usuario vinculado al miembro OAuth autenticado. El calendario reúne las clases asignadas en instructor1/instructor2 y los eventos del participante, con un solo evento cuando ambos corresponden a la misma clase. Las clases asignadas tienen distintivo INSTRUCTOR y color naranja, filtro y vista Lista.

El módulo permite asistencia por clase y grupo/curso CPC, y precarga de archivos/fotografías antes de ENVIAR. No ofrece exportación. Los participantes provienen de inscripciones activas incluidas en reportes; los instructores se muestran opcionalmente.

El backend valida identidad, asignación y horario en cada petición. El registro abre al iniciar la clase y cierra al llegar fechaFinProgramada. Una clase sin término válido mantiene el registro cerrado.

Guardar asistencia crea un recibo inmutable. Los cambios posteriores desde el panel se conservan en el registro administrativo y no cambian la consulta original del instructor. El panel puede regularizar por separado; esos registros no se exponen como envíos del instructor.

ENVIAR fija el lote. Los reintentos usan los mismos identificadores y solo se aceptan antes del término de la clase. La carga finaliza al comprobar todos los archivos en Drive. La precarga se conserva en IndexedDB y las marcas en localStorage, separadas por miembro y clase. El envío requiere conexión; no hay sincronización después del cierre del horario.

## Backend y estado de integración

- Requiere cpcCursosAdmin.web.js completo v0.13.5, entregado por separado.
- El archivo backend/cpcInstructorHttp.js es completo y delega al mismo control académico.
- backend/http-functions-instructor.integration.txt documenta las dos adiciones al http-functions.js vigente de Wix. No es un reemplazo de ese archivo.
- Los recibos usan CPC_Asistencias y sus campos existentes. No llevan courseId, por lo que no duplican columnas ni valores en el reporte administrativo.
- El panel conserva HTML v0.9.38 y Velo v0.9.28.

El usuario confirmó la publicación del backend Wix y del endpoint el 11 de octubre de 2026. La app se activa desde esta actualización. La comprobación real de sesión de instructor y escritura en Wix/Drive continúa pendiente.

## Validación

Ejecutar `npm ci` y `npm test`.

Las pruebas cubren identidad, asignación, restricciones por horario, cierre inmutable, envíos concurrentes, privacidad del panel, lote fijo, reintento y finalización, calendario/lista y controles de la interfaz. Wix y Drive se simulan; el DOM se prueba con jsdom. La validación visual en navegador y la comprobación en producción están pendientes.
