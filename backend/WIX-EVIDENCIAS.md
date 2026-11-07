# Wix · Carga de evidencias por archivo

En **Backend → `cpcCursosAdmin.web.js`**, aplica los cambios en el archivo que está publicado. La referencia es la implementación de subida directa a Drive que contiene `cpiPrepareEvidence` y `cpiConfirmEvidence`. Si estas referencias no coinciden, compara con el código publicado antes de pegar. Conserva las importaciones, la configuración de Drive y los demás módulos.

1. Sustituye `async function cpiPrepareEvidence(identity,input)` por las tres funciones de este bloque. El siguiente bloque existente, `async function cpiConfirmEvidence(identity,input)`, se conserva:

```js
// Registra cada archivo por separado y conserva su identificador para reintentos.
function cpiEvidenceFile(input) {
    const raw=input.file || {};
    const f={operationId:clean(input.operationId),originalName:clean(raw.originalName),mimeType:clean(raw.mimeType)||'application/octet-stream',size:Number(raw.size),sha256:clean(raw.sha256)};
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(f.operationId) || !Number.isInteger(f.size) || f.size<1 || f.size>CCA_MAX_BYTES || !/^[0-9a-f]{64}$/.test(f.sha256) || !f.originalName || f.originalName.length>240 || /[\x00-\x1f\/\\]/.test(f.originalName) || !/\.[A-Za-z0-9]{1,10}$/.test(f.originalName) || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(f.mimeType))throw new Error('El archivo no es válido.');
    return f;
}
function cpiCheckEvidenceOwner(record,ctx,identity,file) {
    if(record.uploadedBy!==identity.member._id || record.classId!==ctx.clase._id || record.sha256!==file.sha256 || record.size!==file.size || record.originalName!==file.originalName || record.mimeType!==file.mimeType)throw new Error('El identificador ya pertenece a otra carga.');
}
async function cpiPrepareEvidence(identity,input) {
    const ctx=await cpiAssigned(identity,input.classId);
    cpiRequireOpen(ctx);
    const file=cpiEvidenceFile(input),operationId=file.operationId;
    let record=await ccaOptional('CPC_Evidencias',operationId);
    if(!record){
        const folderId=clean(ctx.course.carpetaEvidenciasDriveId);
        if(!/^[A-Za-z0-9_-]{10,200}$/.test(folderId))throw new Error('Vincula la carpeta de evidencias del curso desde el panel ADM.');
        const courseCode=clean(ctx.course.codigoCurso).toUpperCase(),classNumber=Number(ctx.clase.numeroClase);
        if(!/^C-\d{1,12}$/.test(courseCode))throw new Error('El código del curso debe tener formato C-1234 para nombrar la evidencia.');
        if(!Number.isInteger(classNumber) || classNumber<1 || classNumber>9999)throw new Error('Guarda un número de clase entero positivo antes de cargar evidencias.');
        const existing=await ccaAll(wixData.query('CPC_Evidencias').eq('classId',ctx.clase._id));
        const sequence=existing.reduce((max,row)=>Math.max(max,Number(row.sequence)||0),0)+1;
        record={_id:operationId,title:file.originalName,classId:ctx.clase._id,courseId:ctx.courseId,folderId,courseCode,classNumber,
            classDate:ccaDate(ctx.clase.fechaProgramada),sequence,originalName:file.originalName,mimeType:file.mimeType,size:file.size,sha256:file.sha256,
            status:'PENDING_DRIVE',uploadedBy:identity.member._id};
        cpiRequireOpen(ctx);
        try{await wixData.insert('CPC_Evidencias',record,CCA_OPTIONS);}
        catch(error){record=await ccaOptional('CPC_Evidencias',operationId);if(!record)throw error;}
    }
    cpiCheckEvidenceOwner(record,ctx,identity,file);
    if(record.status==='UPLOADED')return {operationId,uploadUrl:null,confirmed:true};
    cpiRequireOpen(ctx);
    const session=await ccaDrive.startResumableUpload({eoId:ccaEoId(ctx.course),folderId:record.folderId,name:ccaEvidenceName(record),mimeType:record.mimeType,size:record.size});
    return {operationId,uploadUrl:session.uploadUrl,confirmed:false};
}
```

2. En `async function cpiList(identity)`, busca estas tres referencias y reemplázalas:

| Buscar | Reemplazar por |
| --- | --- |
| `classes.flatMap(c=>['ATTENDANCE','EVIDENCE_CLOSED'].map(kind=>cpiReceiptId(kind,c._id)))` | `classes.map(c=>cpiReceiptId('ATTENDANCE',c._id))` |
| `,e=receipts.get(cpiReceiptId('EVIDENCE_CLOSED',c._id))` | Elimina ese fragmento, sin eliminar el punto y coma final. |
| `evidenceState:e?'CERRADO':w.open?'PENDIENTE':'FUERA_DE_HORARIO'` | `evidenceState:w.open?'DISPONIBLE':'FUERA_DE_HORARIO'` |

3. Sustituye `async function cpiLoad(identity,input)` por este bloque. Conserva la función siguiente, `cpiProjectAttendance`:

```js
async function cpiLoad(identity,input) {
    const ctx=await cpiAssigned(identity,input.classId),w=cpiWindow(ctx);
    const [attendance,records]=await Promise.all([
        cpiReceipt('ATTENDANCE',ctx.clase._id),
        ccaAll(wixData.query('CPC_Evidencias').eq('classId',ctx.clase._id).eq('status','UPLOADED').eq('uploadedBy',identity.member._id))
    ]);
    const ownAttendance=attendance?.updatedBy===identity.member._id?attendance:null;
    const roster=ownAttendance?ownAttendance.rows:attendance?[]:await ccaRoster(ctx,null);
    const evidence=records.sort((a,b)=>(a.sequence||0)-(b.sequence||0))
        .map(record=>({operationId:record._id,name:record.fileName,url:record.fileUrl}));
    return {classId:ctx.clase._id,courseCode:ctx.course.codigoCurso || '',courseName:ctx.course.nombreCurso || '',number:ctx.clase.numeroClase || '',topic:ctx.clase.tema || '',...w,serverNow:new Date().toISOString(),rows:roster,
        attendanceLocked:!!attendance || !w.open,evidenceLocked:!w.open,
        attendanceSaved:!!ownAttendance,evidenceSent:evidence.length>0,
        evidence,evidencePerFile:true,maxBytes:CCA_MAX_BYTES};
}
```

4. Elimina la constante `cpiBatchKey` (si existe) y las funciones completas `cpiBatch` y `cpiCloseEvidence`. En el método exportado `instructorAcademic`, elimina solo estas dos líneas. Conserva las acciones `LIST`, `LOAD`, `ATTENDANCE_SAVE`, `EVIDENCE_PREPARE` y `EVIDENCE_CONFIRM`:

```js
    if(action==='EVIDENCE_BATCH')return cpiBatch(identity,input);
    if(action==='EVIDENCE_CLOSE')return cpiCloseEvidence(identity,input);
```

5. Publica Wix y a continuación la app con Instructor v1.1.5. Verifica en una clase abierta que se pueda enviar una foto, agregar otra y enviarla; ambas deben quedar visibles. Fuera del horario se conservan para consulta. No es necesario eliminar recibos anteriores ni modificar las colecciones.
