// CONTROL ACADÉMICO · v0.13.5. Colecciones privadas:
// CPC_Asistencias (un objeto por clase), CPC_Evidencias (un registro por carga),
// CPC_EvidenciaPartes (fragmentos temporales; se borran tras completar la carga).
const CCA_OPTIONS = {suppressAuth:true, consistentRead:true};
const CCA_MAX_BYTES = 10 * 1024 * 1024;
const CCA_PART_LENGTH = 180000;
const ccaSecretValue = elevate(secrets.getSecretValue);
function ccaRef(value) { return typeof value === 'string' ? value : clean(value?._id); }
async function ccaAll(query) {
    let page = await query.limit(1000).find(CCA_OPTIONS);
    const rows = [...page.items];
    while (page.hasNext()) { page = await page.next(); rows.push(...page.items); }
    return rows;
}
async function ccaOptional(collection, id) {
    const res = await wixData.query(collection).eq('_id', id).limit(1).find(CCA_OPTIONS);
    return res.items[0] || null;
}
function ccaFolderId(value) {
    const text = clean(value);
    if (!text) return '';
    const match = text.match(/^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})(?:[?#].*)?$/);
    if (!match) throw new Error('Carpeta de evidencias: utiliza el enlace HTTPS de una carpeta de Google Drive.');
    return match[1];
}
function ccaDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new Error('La clase no tiene una fecha válida.');
    const parts = new Intl.DateTimeFormat('en', {timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
async function ccaContext(classId) {
    const clase = await wixData.get('CPC_Clases', clean(classId), CCA_OPTIONS);
    if (!clase) throw new Error('La clase ya no existe.');
    const courseId = ccaRef(clase.curso);
    const course = await wixData.get('CPC_Cursos', courseId, CCA_OPTIONS);
    if (!course) throw new Error('El curso de la clase ya no existe.');
    return {clase, course, courseId};
}
async function ccaRoster(ctx, previous, instructorIds = null) {
    const enrollments = await ccaAll(wixData.query('CPC_Inscripciones').eq('curso', ctx.courseId));
    const eligible = enrollments.filter(e => e.activo !== false && e.considerarReportes !== false);
    const participantIds = new Set(eligible.map(e => ccaRef(e.usuario)).filter(Boolean));
    const instructors = instructorIds || [...new Set([ccaRef(ctx.clase.instructor1),ccaRef(ctx.clase.instructor2)].filter(Boolean))];
    const ids = new Set([...participantIds,...instructors]);
    const users = new Map(), clients = new Map();
    await Promise.all([...ids].map(async id => { const u = await ccaOptional('CPC_Usuario', id); if (u) users.set(id,u); }));
    const clientIds = [...new Set([...users.values()].map(u => ccaRef(u.cliente)).filter(Boolean))];
    await Promise.all(clientIds.map(async id => { const c = await ccaOptional('CPC_Clientes',id); if(c) clients.set(id,c); }));
    const saved = new Map((previous?.rows || []).map(r => [r.key,r]));
    const roster = new Map();
    function add(id, role) {
        const user = users.get(id); if (!user) return;
        if (role === 'PARTICIPANTE' && (clean(user.codigoUsuario).toUpperCase() === 'INSTRUCTOR' || instructors.includes(id))) return;
        const key = (role === 'INSTRUCTOR' ? 'I:' : 'P:') + id, prior = saved.get(key);
        roster.set(key,{key,userId:id,role,name:user.nombreCompleto || [user.apellidoPaterno,user.apellidoMaterno,user.nombre].filter(Boolean).join(' ') || user.email || id,
            code:user.codigoUsuario || '',client:clients.get(ccaRef(user.cliente))?.cliente || '',
            status:prior?.status === 'JUSTIFICADA' ? 'AUSENTE' : prior?.status || '',
            justified:prior?.status === 'JUSTIFICADA' || prior?.justified === true,historical:false});
    }
    participantIds.forEach(id => add(id,'PARTICIPANTE'));
    instructors.forEach(id => add(id,'INSTRUCTOR'));
    return [...roster.values()].sort((a,b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name,'es'));
}
async function ccaLoad(classId) {
    const ctx = await ccaContext(classId);
    const attendance = await ccaOptional('CPC_Asistencias', ctx.clase._id);
    const evidence = await ccaAll(wixData.query('CPC_Evidencias').eq('classId',ctx.clase._id).eq('status','UPLOADED'));
    return {classId:ctx.clase._id, courseId:ctx.courseId,
        courseName:ctx.course.nombreCurso || '',courseCode:ctx.course.codigoCurso || '',
        folderUrl:ctx.course.carpetaEvidenciasDrive || '',
        rows:await ccaRoster(ctx,attendance),revision:attendance?.revision || '',
        evidence:evidence.map(e => ({operationId:e._id,name:e.fileName,url:e.fileUrl,uploadedAt:e.uploadedAt})),
        maxBytes:CCA_MAX_BYTES,partLength:CCA_PART_LENGTH};
}
async function ccaSaveAttendance(input, member) {
    const ctx = await ccaContext(input.classId);
    const previous = await ccaOptional('CPC_Asistencias',ctx.clase._id);
    if (clean(input.revision) !== clean(previous?.revision)) throw new Error('La asistencia fue actualizada. Cierra y abre el registro antes de guardar de nuevo.');
    const roster = await ccaRoster(ctx,previous);
    const submitted = Array.isArray(input.rows) ? input.rows : [];
    if (submitted.length !== roster.length || new Set(submitted.map(r => r.key)).size !== submitted.length) throw new Error('La lista de asistencia cambió. Vuelve a abrir el registro.');
    const allowed = new Map(roster.map(r => [r.key,r]));
    const rows = submitted.map(r => {
        const person = allowed.get(r.key);
        if (!person || !['','PRESENTE','AUSENTE'].includes(r.status)) throw new Error('Registro de asistencia inválido.');
        return {...person,status:r.status,justified:r.status === 'AUSENTE' && r.justified === true};
    });
    const revision = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item = {_id:ctx.clase._id,title:ctx.clase.registroClase || ctx.clase._id,classId:ctx.clase._id,
        courseId:ctx.courseId,rows:[...rows,...(previous?.rows || []).filter(r => !allowed.has(r.key))],revision,updatedBy:member._id,updatedAt:new Date()};
    if (previous) await wixData.update('CPC_Asistencias',{...previous,...item},CCA_OPTIONS);
    else await wixData.insert('CPC_Asistencias',item,CCA_OPTIONS);
    return {classId:ctx.clase._id,rows,revision};
}
async function ccaBridge(payload) {
    const [urlSecret,keySecret] = await Promise.all([ccaSecretValue('CPC_DRIVE_URL'),ccaSecretValue('CPC_DRIVE_SECRET')]);
    const url = clean(urlSecret?.value);
    const secret = clean(keySecret?.value);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || secret.length < 32) throw new Error('Revisa CPC_DRIVE_URL y CPC_DRIVE_SECRET en Secrets Manager.');
    let response;
    try { response = await fetch(url,{method:'post',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,secret})}); }
    catch (_) { throw new Error('No fue posible contactar con Google. Reintenta la misma carga.'); }
    if (!response.ok) throw new Error('El puente de Drive no respondió correctamente. Revisa su implementación.');
    let data;
    try { data = await response.json(); } catch (_) { throw new Error('Google no devolvió JSON. Revisa acceso Cualquier usuario y URL /exec.'); }
    if (!data?.ok) throw new Error(clean(data?.message) || 'Drive rechazó la carga.');
    return data;
}
async function ccaBegin(input,member) {
    const ctx = await ccaContext(input.classId);
    const operationId = clean(input.operationId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) throw new Error('Identificador de carga inválido.');
    const size = Number(input.size), sha256 = clean(input.sha256);
    if (!Number.isInteger(size) || size < 1 || size > CCA_MAX_BYTES || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Archivo inválido o superior a 10 MiB.');
    const originalName = clean(input.originalName), mimeType = clean(input.mimeType) || 'application/octet-stream';
    if (!originalName || originalName.length > 240 || /[\x00-\x1f\/\\]/.test(originalName) || !/\.[A-Za-z0-9]{1,10}$/.test(originalName)) throw new Error('El archivo debe tener un nombre y una extensión válidos.');
    if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(mimeType)) throw new Error('Tipo de archivo inválido.');
    const folderId = ccaFolderId(ctx.course.carpetaEvidenciasDrive);
    if (!folderId) throw new Error('Configura la Carpeta de evidencias en este curso.');
    const courseCode = clean(ctx.course.codigoCurso).toUpperCase(),classNumber = Number(ctx.clase.numeroClase);
    if (!/^C-\d{1,12}$/.test(courseCode)) throw new Error('El código del curso debe tener formato C-1234 para nombrar la evidencia.');
    if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 9999) throw new Error('Guarda un número de clase entero positivo antes de cargar evidencias.');
    const classDate = ccaDate(ctx.clase.fechaProgramada);
    const previous = await ccaOptional('CPC_Evidencias',operationId);
    if (previous) {
        if (previous.uploadedBy !== member._id || previous.classId !== ctx.clase._id || previous.sha256 !== sha256 || previous.size !== size || previous.originalName !== originalName || previous.mimeType !== mimeType) throw new Error('El identificador ya pertenece a otra carga.');
        return {operationId,partLength:CCA_PART_LENGTH,completed:previous.status === 'UPLOADED'};
    }
    const totalLength = Math.ceil(size/3)*4;
    await wixData.insert('CPC_Evidencias',{_id:operationId,title:originalName,classId:ctx.clase._id,courseId:ctx.courseId,
        folderId,courseCode,classNumber,classDate,originalName,mimeType,size,sha256,
        totalParts:Math.ceil(totalLength/CCA_PART_LENGTH),status:'UPLOADING',uploadedBy:member._id},CCA_OPTIONS);
    return {operationId,partLength:CCA_PART_LENGTH,completed:false};
}
async function ccaOwned(input,member) {
    const record = await ccaOptional('CPC_Evidencias',clean(input.operationId));
    if (!record || record.uploadedBy !== member._id) throw new Error('No tienes acceso a esa carga.');
    return record;
}
async function ccaPart(input,member) {
    const record = await ccaOwned(input,member);
    if (record.status === 'UPLOADED') return {completed:true};
    const index = Number(input.index),data = input.data;
    const totalLength = Math.ceil(record.size/3)*4;
    const expected = Math.min(CCA_PART_LENGTH,totalLength-index*CCA_PART_LENGTH);
    if (!Number.isInteger(index) || index < 0 || index >= record.totalParts || typeof data !== 'string' || data.length !== expected || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Fragmento de archivo inválido.');
    const id = `${record._id}-${index}`;
    const previous = await ccaOptional('CPC_EvidenciaPartes',id);
    if (previous) {
        if (previous.data !== data) throw new Error('Un fragmento previo contiene datos diferentes.');
    } else await wixData.insert('CPC_EvidenciaPartes',{_id:id,operationId:record._id,index,data,uploadedBy:member._id},CCA_OPTIONS);
    return {index,completed:false};
}
async function ccaCleanup(operationId) {
    try {
        const parts = await ccaAll(wixData.query('CPC_EvidenciaPartes').eq('operationId',operationId));
        await Promise.all(parts.map(p => wixData.remove('CPC_EvidenciaPartes',p._id,CCA_OPTIONS)));
    } catch (_) { console.warn('CPC v0.13.5: quedaron fragmentos temporales de una carga completada.'); }
}
async function ccaFinish(input,member) {
    const record = await ccaOwned(input,member);
    if (record.status === 'UPLOADED') { await ccaCleanup(record._id); return {classId:record.classId,completed:true}; }
    const ctx = await ccaContext(record.classId);
    if (ctx.courseId !== record.courseId || ccaFolderId(ctx.course.carpetaEvidenciasDrive) !== record.folderId ||
        clean(ctx.course.codigoCurso).toUpperCase() !== record.courseCode || Number(ctx.clase.numeroClase) !== record.classNumber || ccaDate(ctx.clase.fechaProgramada) !== record.classDate) throw new Error('Los datos de la clase o su carpeta cambiaron. Inicia una carga nueva.');
    const parts = (await ccaAll(wixData.query('CPC_EvidenciaPartes').eq('operationId',record._id))).sort((a,b) => a.index-b.index);
    if (parts.length !== record.totalParts || parts.some((p,i) => p.index !== i)) throw new Error('Faltan fragmentos del archivo. Reintenta la carga.');
    const base64 = parts.map(p => p.data).join('');
    if (base64.length !== Math.ceil(record.size/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('El contenido del archivo no es válido.');
    const bytes = Buffer.from(base64,'base64');
    if (bytes.length !== record.size || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('La verificación del archivo falló.');
    const response = await ccaBridge({action:'UPLOAD',operationId:record._id,folderId:record.folderId,classId:record.classId,
        courseCode:record.courseCode,classNumber:record.classNumber,classDate:record.classDate,
        originalName:record.originalName,mimeType:record.mimeType,base64});
    const file = response.file;
    if (!file?.id || file.folderId !== record.folderId || file.sha256 !== record.sha256) throw new Error('Drive devolvió una referencia inesperada. Reintenta la misma carga.');
    await wixData.update('CPC_Evidencias',{...record,status:'UPLOADED',fileId:file.id,fileName:file.name,
        fileUrl:file.url,uploadedAt:new Date()},CCA_OPTIONS);
    await ccaCleanup(record._id);
    return {classId:record.classId,completed:true};
}
async function ccaAttendanceReport(courseId) {
    const id = clean(courseId);
    if (!id) throw new Error('Selecciona un grupo/curso CPC.');
    const course = await wixData.get('CPC_Cursos',id,CCA_OPTIONS);
    if (!course) throw new Error('El curso ya no existe.');
    const classes = (await ccaAll(wixData.query('CPC_Clases').eq('curso',id))).filter(c => c.activo !== false);
    classes.sort((a,b) => Number(a.numeroClase || 0)-Number(b.numeroClase || 0) || new Date(a.fechaProgramada).getTime()-new Date(b.fechaProgramada).getTime() || a._id.localeCompare(b._id));
    const attendance = await ccaAll(wixData.query('CPC_Asistencias').eq('courseId',id));
    const byClass = new Map(attendance.map(a => [a.classId,new Map((a.rows || []).map(r => [r.key,r]))]));
    const instructors = [...new Set(classes.flatMap(c => [ccaRef(c.instructor1),ccaRef(c.instructor2)]).filter(Boolean))];
    const people = await ccaRoster({course,courseId:id,clase:{}},null,instructors);
    const rows = people.map(person => {
        const cells = classes.map(c => {
            const applicable = person.role !== 'INSTRUCTOR' || [ccaRef(c.instructor1),ccaRef(c.instructor2)].includes(person.userId);
            const stored = applicable ? byClass.get(c._id)?.get(person.key) : null;
            const status = stored?.status === 'JUSTIFICADA' ? 'AUSENTE' : stored?.status || '';
            return {status:['PRESENTE','AUSENTE'].includes(status)?status:'',justified:status === 'AUSENTE' && (stored?.justified === true || stored?.status === 'JUSTIFICADA'),applicable};
        });
        const present = cells.filter(c => c.status === 'PRESENTE').length;
        const absent = cells.filter(c => c.status === 'AUSENTE').length;
        const registered = present + absent;
        return {...person,cells,present,absent,justified:cells.filter(c => c.justified).length,registered,percentage:registered?Math.round(present/registered*10000)/100:null};
    });
    return {courseId:id,courseCode:course.codigoCurso || '',courseName:course.nombreCurso || '',generatedAt:new Date().toISOString(),
        classes:classes.map(c => ({id:c._id,number:c.numeroClase || '',date:c.fechaProgramada?ccaDate(c.fechaProgramada):'',status:c.estatusClase || ''})),rows};
}
const classAcademicAdmin = webMethod(Permissions.SiteMember,async (action,input = {}) => {
    const member = await requireCpcAdmin();
    switch (action) {
        case 'LOAD': return ccaLoad(input.classId);
        case 'ATTENDANCE_REPORT': return ccaAttendanceReport(input.courseId);
        case 'ATTENDANCE_SAVE': return ccaSaveAttendance(input,member);
        case 'EVIDENCE_BEGIN': return ccaBegin(input,member);
        case 'EVIDENCE_PART': return ccaPart(input,member);
        case 'EVIDENCE_FINISH': return ccaFinish(input,member);
        case 'TEST': {
            const ctx = await ccaContext(input.classId);
            const folderId = ccaFolderId(ctx.course.carpetaEvidenciasDrive);
            if (!folderId) throw new Error('Configura la Carpeta de evidencias del curso.');
            const result = await ccaBridge({action:'PING',folderId});
            return {version:result.version,folderReadable:result.folderReadable};
        }
        default: throw new Error('Operación académica no reconocida.');
    }
});

// Instructor CPC v1.0.0 · Solo sesión autenticada; recibos inmutables en CPC_Asistencias.
// Los recibos no llevan courseId: el reporte administrativo sigue leyendo solo registros por clase.
function cpiReceiptId(kind,classId) {return createHash('sha256').update(`CPC:INSTRUCTOR:${kind}:${classId}`).digest('hex').slice(0,32);}
function cpiDate(value) {const raw=value?.$date || value;const d=new Date(raw);return value && Number.isFinite(d.getTime())?d:null;}
async function cpiIdentity() {
    const member=await currentMember.getMember();
    if(!member?._id)throw new Error('Inicia sesión para acceder.');
    const users=(await ccaAll(wixData.query('CPC_Usuario').eq('memberId',member._id))).filter(u=>u.activo!==false);
    if(users.length!==1)throw new Error('No existe una identidad CPC activa y única para esta sesión.');
    const user=users[0];
    return {member,user,isInstructor:clean(user.codigoUsuario).toUpperCase()==='INSTRUCTOR'};
}
async function cpiAssigned(identity,classId) {
    if(!identity.isInstructor)throw new Error('Acceso exclusivo para instructores CPC.');
    const ctx=await ccaContext(classId);
    if(ctx.clase.activo===false || ctx.course.activo===false || ![ccaRef(ctx.clase.instructor1),ccaRef(ctx.clase.instructor2)].includes(identity.user._id))throw new Error('La clase no está asignada a este instructor.');
    return ctx;
}
function cpiWindow(ctx) {
    const start=cpiDate(ctx.clase.fechaProgramada),end=cpiDate(ctx.clase.fechaFinProgramada),now=Date.now();
    const valid=!!start && !!end && end.getTime()>start.getTime();
    return {startAt:start?.toISOString() || '',endAt:end?.toISOString() || '',open:valid && now>=start.getTime() && now<end.getTime(),reason:!valid?'La clase requiere inicio y término válidos.':now<start.getTime()?'La clase aún no inicia.':now>=end.getTime()?'El horario de registro terminó.':''};
}
function cpiRequireOpen(ctx) {const w=cpiWindow(ctx);if(!w.open)throw new Error(w.reason);return w;}
async function cpiReceipt(kind,classId) {return ccaOptional('CPC_Asistencias',cpiReceiptId(kind,classId));}
async function cpiInsertReceipt(kind,ctx,member,rows) {
    const item={_id:cpiReceiptId(kind,ctx.clase._id),title:`INSTRUCTOR ${kind}`,classId:ctx.clase._id,rows,revision:'INSTRUCTOR',updatedBy:member._id,updatedAt:new Date()};
    try{return await wixData.insert('CPC_Asistencias',item,CCA_OPTIONS);}
    catch(error){const existing=await cpiReceipt(kind,ctx.clase._id);if(existing)return existing;throw error;}
}
async function cpiList(identity) {
    if(!identity.isInstructor)return {isInstructor:false,classes:[],serverNow:new Date().toISOString()};
    const lists=await Promise.all(['instructor1','instructor2'].map(k=>ccaAll(wixData.query('CPC_Clases').eq(k,identity.user._id))));
    const classes=[...new Map(lists.flat().map(c=>[c._id,c])).values()].filter(c=>c.activo!==false);
    const instructorNames=new Map();
    for(const id of new Set(classes.flatMap(c=>[ccaRef(c.instructor1),ccaRef(c.instructor2)]).filter(Boolean))){const u=await ccaOptional('CPC_Usuario',id);instructorNames.set(id,u?.nombreCompleto || [u?.nombre,u?.apellidoPaterno,u?.apellidoMaterno].filter(Boolean).join(' '));}
    const courses=new Map();
    for(const id of new Set(classes.map(c=>ccaRef(c.curso))))courses.set(id,await ccaOptional('CPC_Cursos',id));
    const receiptIds=classes.flatMap(c=>['ATTENDANCE','EVIDENCE_CLOSED'].map(kind=>cpiReceiptId(kind,c._id))),receipts=new Map();
    for(let i=0;i<receiptIds.length;i+=100){const items=await ccaAll(wixData.query('CPC_Asistencias').hasSome('_id',receiptIds.slice(i,i+100)));items.forEach(r=>receipts.set(r._id,r));}
    const result=[];
    for(const c of classes){
        const courseId=ccaRef(c.curso),course=courses.get(courseId);if(!course || course.activo===false)continue;
        const a=receipts.get(cpiReceiptId('ATTENDANCE',c._id)),e=receipts.get(cpiReceiptId('EVIDENCE_CLOSED',c._id));
        const w=cpiWindow({clase:c,course});
        result.push({id:c._id,courseId,courseCode:course.codigoCurso || '',courseName:course.nombreCurso || '',number:c.numeroClase || '',instructorNames:[...new Set([ccaRef(c.instructor1),ccaRef(c.instructor2)].map(id=>instructorNames.get(id)).filter(Boolean))].join(' / '),session:c.sesion || '',...w,
            attendanceState:a?'CERRADO':w.open?'PENDIENTE':'FUERA_DE_HORARIO',evidenceState:e?'CERRADO':w.open?'PENDIENTE':'FUERA_DE_HORARIO'});
    }
    return {isInstructor:true,userId:identity.user._id,classes:result.sort((a,b)=>new Date(a.startAt).getTime()-new Date(b.startAt).getTime()),serverNow:new Date().toISOString()};
}
async function cpiLoad(identity,input) {
    const ctx=await cpiAssigned(identity,input.classId),w=cpiWindow(ctx);
    const [attendance,batch,closed]=await Promise.all([cpiReceipt('ATTENDANCE',ctx.clase._id),cpiReceipt('EVIDENCE_BATCH',ctx.clase._id),cpiReceipt('EVIDENCE_CLOSED',ctx.clase._id)]);
    const ownAttendance=attendance?.updatedBy===identity.member._id?attendance:null;
    const roster=ownAttendance?ownAttendance.rows:attendance?[]:await ccaRoster(ctx,null);
    const ownBatch=batch?.updatedBy===identity.member._id?batch:null;
    const evidence=[];
    for(const file of ownBatch?.rows || []){const record=await ccaOptional('CPC_Evidencias',file.operationId);if(record?.status==='UPLOADED' && record.uploadedBy===identity.member._id)evidence.push({operationId:record._id,name:record.fileName,url:record.fileUrl});}
    return {classId:ctx.clase._id,courseCode:ctx.course.codigoCurso || '',courseName:ctx.course.nombreCurso || '',number:ctx.clase.numeroClase || '',topic:ctx.clase.tema || '',...w,serverNow:new Date().toISOString(),rows:roster,
        attendanceLocked:!!attendance || !w.open,evidenceLocked:!!closed || (!!batch && !ownBatch) || !w.open,
        attendanceSaved:!!ownAttendance,evidenceSent:closed?.updatedBy===identity.member._id,
        evidence,batch:ownBatch?.rows || [],maxBytes:CCA_MAX_BYTES,partLength:CCA_PART_LENGTH};
}
async function cpiProjectAttendance(ctx,receipt) {
    // Una regularización administrativa existente conserva prioridad y nunca se expone al instructor.
    if(await ccaOptional('CPC_Asistencias',ctx.clase._id))return;
    const item={_id:ctx.clase._id,title:ctx.clase.registroClase || ctx.clase._id,classId:ctx.clase._id,courseId:ctx.courseId,rows:receipt.rows,
        revision:`INSTRUCTOR-${receipt._id}`,updatedBy:receipt.updatedBy,updatedAt:receipt.updatedAt};
    try{await wixData.insert('CPC_Asistencias',item,CCA_OPTIONS);}catch(error){if(!await ccaOptional('CPC_Asistencias',ctx.clase._id))throw error;}
}
async function cpiSaveAttendance(identity,input) {
    const ctx=await cpiAssigned(identity,input.classId),existing=await cpiReceipt('ATTENDANCE',ctx.clase._id);
    if(existing){if(existing.updatedBy!==identity.member._id)throw new Error('El registro de asistencia está cerrado.');await cpiProjectAttendance(ctx,existing);return cpiLoad(identity,input);}
    cpiRequireOpen(ctx);
    const roster=await ccaRoster(ctx,null),submitted=Array.isArray(input.rows)?input.rows:[];
    if(!roster.length || submitted.length!==roster.length || new Set(submitted.map(r=>r.key)).size!==roster.length)throw new Error('La lista de participantes cambió. Vuelve a abrir la clase.');
    const allowed=new Map(roster.map(r=>[r.key,r]));
    const rows=submitted.map(r=>{const p=allowed.get(r.key);if(!p || !(p.role==='INSTRUCTOR'?['','PRESENTE','AUSENTE']:['PRESENTE','AUSENTE']).includes(r.status))throw new Error('Marca Asistencia o Inasistencia para cada participante.');return {...p,status:r.status,justified:r.status==='AUSENTE' && r.justified===true,recordedFrom:'APP_INSTRUCTOR',recordedBy:identity.member._id,recordedAt:new Date().toISOString()};});
    cpiRequireOpen(ctx);
    const receipt=await cpiInsertReceipt('ATTENDANCE',ctx,identity.member,rows);
    if(receipt.updatedBy!==identity.member._id)throw new Error('El registro de asistencia está cerrado.');
    await cpiProjectAttendance(ctx,receipt);return cpiLoad(identity,input);
}
async function cpiBatch(identity,input) {
    const ctx=await cpiAssigned(identity,input.classId);cpiRequireOpen(ctx);
    if(await cpiReceipt('EVIDENCE_CLOSED',ctx.clase._id))throw new Error('La carga de evidencias está cerrada.');
    const files=input.files;
    if(!Array.isArray(files) || !files.length || files.length>20 || new Set(files.map(f=>f.operationId)).size!==files.length)throw new Error('Selecciona de 1 a 20 archivos.');
    const normalized=files.map(f=>({operationId:clean(f.operationId),originalName:clean(f.originalName),mimeType:clean(f.mimeType)||'application/octet-stream',size:Number(f.size),sha256:clean(f.sha256)}));
    // Valida el lote completo antes de reservarlo; ccaBegin aplica la misma validación antes de escribir.
    for(const f of normalized)if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(f.operationId) || !Number.isInteger(f.size) || f.size<1 || f.size>CCA_MAX_BYTES || !/^[0-9a-f]{64}$/.test(f.sha256) || !f.originalName || f.originalName.length>240 || /[\x00-\x1f\/\\]/.test(f.originalName) || !/\.[A-Za-z0-9]{1,10}$/.test(f.originalName) || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(f.mimeType))throw new Error('Hay un archivo inválido en la precarga.');
    if(!ccaFolderId(ctx.course.carpetaEvidenciasDrive) || !/^C-\d{1,12}$/.test(clean(ctx.course.codigoCurso).toUpperCase()) || !Number.isInteger(Number(ctx.clase.numeroClase)) || Number(ctx.clase.numeroClase)<1 || Number(ctx.clase.numeroClase)>9999)throw new Error('La clase requiere carpeta, código de curso y número válidos.');
    const existing=await cpiReceipt('EVIDENCE_BATCH',ctx.clase._id);
    if(existing){if(existing.updatedBy!==identity.member._id || JSON.stringify(existing.rows)!==JSON.stringify(normalized))throw new Error('El lote de evidencias ya está definido. Reintenta los archivos pendientes.');return {files:existing.rows};}
    for(const f of normalized)if(await ccaOptional('CPC_Evidencias',f.operationId))throw new Error('El identificador del archivo ya está utilizado.');
    const receipt=await cpiInsertReceipt('EVIDENCE_BATCH',ctx,identity.member,normalized);
    if(receipt.updatedBy!==identity.member._id || JSON.stringify(receipt.rows)!==JSON.stringify(normalized))throw new Error('El lote de evidencias ya está definido.');
    return {files:receipt.rows};
}
async function cpiEvidence(identity,action,input) {
    let classId=clean(input.classId);
    if(action!=='EVIDENCE_BEGIN'){const owned=await ccaOwned(input,identity.member);classId=owned.classId;}
    const ctx=await cpiAssigned(identity,classId);cpiRequireOpen(ctx);
    if(await cpiReceipt('EVIDENCE_CLOSED',classId))throw new Error('La carga de evidencias está cerrada.');
    const batch=await cpiReceipt('EVIDENCE_BATCH',classId),file=batch?.rows.find(f=>f.operationId===input.operationId);
    if(batch?.updatedBy!==identity.member._id || !file)throw new Error('El archivo no pertenece a tu precarga.');
    if(action==='EVIDENCE_BEGIN')return ccaBegin({...file,classId},identity.member);
    if(action==='EVIDENCE_PART')return ccaPart(input,identity.member);
    if(action==='EVIDENCE_FINISH')return ccaFinish(input,identity.member);
    throw new Error('Operación de evidencia inválida.');
}
async function cpiCloseEvidence(identity,input) {
    const ctx=await cpiAssigned(identity,input.classId),existing=await cpiReceipt('EVIDENCE_CLOSED',ctx.clase._id);
    if(existing){if(existing.updatedBy!==identity.member._id)throw new Error('La carga de evidencias está cerrada.');return cpiLoad(identity,input);}
    cpiRequireOpen(ctx);
    const batch=await cpiReceipt('EVIDENCE_BATCH',ctx.clase._id);
    if(batch?.updatedBy!==identity.member._id || !batch.rows?.length)throw new Error('No existe una precarga propia.');
    for(const f of batch.rows){const r=await ccaOptional('CPC_Evidencias',f.operationId);if(r?.status!=='UPLOADED' || r.classId!==ctx.clase._id || r.uploadedBy!==identity.member._id || r.sha256!==f.sha256)throw new Error('Hay archivos pendientes de confirmar en Drive.');}
    cpiRequireOpen(ctx);const closed=await cpiInsertReceipt('EVIDENCE_CLOSED',ctx,identity.member,batch.rows);
    if(closed.updatedBy!==identity.member._id)throw new Error('La carga de evidencias está cerrada.');return cpiLoad(identity,input);
}
const instructorAcademic = webMethod(Permissions.SiteMember,async (action,input={})=>{
    const identity=await cpiIdentity();
    if(action==='LIST')return cpiList(identity);
    if(!identity.isInstructor)throw new Error('Acceso exclusivo para instructores CPC.');
    if(action==='LOAD')return cpiLoad(identity,input);
    if(action==='ATTENDANCE_SAVE')return cpiSaveAttendance(identity,input);
    if(action==='EVIDENCE_BATCH')return cpiBatch(identity,input);
    if(action==='EVIDENCE_CLOSE')return cpiCloseEvidence(identity,input);
    if(['EVIDENCE_BEGIN','EVIDENCE_PART','EVIDENCE_FINISH'].includes(action))return cpiEvidence(identity,action,input);
    throw new Error('Operación de instructor no reconocida.');
});
