const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const db=Object.fromEntries(['CPC_Asistencias','CPC_Evidencias','CPC_EvidenciaPartes','CPC_Clases','CPC_Cursos','CPC_Usuario','CPC_Inscripciones','CPC_Clientes'].map(c=>[c,new Map()]));
const ref=v=>typeof v==='object'?v?._id:v;
function query(c){let filters=[],max=1000;const q={eq(k,v){filters.push([k,v]);return q},hasSome(k,v){filters.push([k,v]);return q},limit(n){max=n;return q},async find(){const items=[...db[c].values()].filter(x=>filters.every(([k,v])=>Array.isArray(v)?v.includes(ref(x[k])):ref(x[k])===v));function page(start){return {items:items.slice(start,start+max),hasNext:()=>start+max<items.length,next:async()=>page(start+max)}}return page(0)}};return q}
let admin=true;
const context={console,Buffer,createHash:crypto.createHash,clean:v=>String(v??'').trim(),requireCpcAdmin:async()=>{if(!admin)throw Error('Acceso administrativo requerido.');return {_id:'admin'}},webMethod:(p,f)=>f,Permissions:{SiteMember:'member'},elevate:f=>f,wixData:{query,get:async(c,id)=>db[c].get(id),insert:async(c,item)=>{if(db[c].has(item._id))throw Error('duplicate');db[c].set(item._id,structuredClone(item));return item},update:async(c,item)=>{db[c].set(item._id,structuredClone(item));return item},remove:async(c,id)=>db[c].delete(id)}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'academic-core.fixture.js'),'utf8').replace('export const classAcademicAdmin','const classAcademicAdmin'),context);
// Drive simulado (componente normalizado de SYS): sesión de subida y lectura de archivo.
vm.runInContext("ccaDrive.startResumableUpload=async p=>({uploadUrl:'https://upload.test/'+p.name});ccaDrive.getFile=async id=>({id,name:'image.jpg',size:'13',parents:[id==='driveFileOK001'?'evidenceFolder1':'otherFolder']});ccaDrive.checkFolder=async()=>({id:'evidenceFolder1'});",context);
let signedMember='teacherMember';context.currentMember={getMember:async()=>({_id:signedMember})};
const call=(a,p)=>{context.testAction=a;context.testPayload=p;return vm.runInContext('classAcademicAdmin(testAction,testPayload)',context)};
db.CPC_Cursos.set('course1',{_id:'course1',codigoCurso:'C-1234',nombreCurso:'Curso uno',carpetaDrive:'https://drive.google.com/drive/folders/WRONG_FOLDER1',carpetaEvidenciasDrive:'https://drive.google.com/drive/folders/evidenceFolder1'});
db.CPC_Cursos.set('course2',{_id:'course2',codigoCurso:'C-5678',nombreCurso:'Curso dos',carpetaEvidenciasDrive:'https://drive.google.com/drive/folders/evidenceFolder2'});
db.CPC_Clases.set('class1',{_id:'class1',curso:'course1',instructor1:'teacher',sesion:'S-011',numeroClase:1,fechaProgramada:'2026-10-04T01:00:00Z'});
db.CPC_Clases.set('class2',{_id:'class2',curso:'course2',instructor1:'teacher',sesion:'S-011',numeroClase:10,fechaProgramada:'2026-10-04T01:00:00Z'});
for(const id of ['student','teacher','other'])db.CPC_Usuario.set(id,{_id:id,nombreCompleto:id,codigoUsuario:'REG-'+id,cliente:'client1'});
db.CPC_Inscripciones.set('e1',{_id:'e1',curso:'course1',usuario:'student'});db.CPC_Inscripciones.set('e2',{_id:'e2',curso:'course1',usuario:{_id:'student'}});db.CPC_Inscripciones.set('e3',{_id:'e3',curso:'course2',usuario:'other'});
db.CPC_Clientes.set('client1',{_id:'client1',cliente:'Empresa de prueba'});

const instructor=(a,p={})=>{context.testAction=a;context.testPayload=p;return vm.runInContext('instructorAcademic(testAction,testPayload)',context)};
const receipt=(kind,id)=>vm.runInContext(`cpiReceiptId('${kind}','${id}')`,context);
(async()=>{
 const start=new Date(Date.now()-60000).toISOString(),end=new Date(Date.now()+600000).toISOString();
 for(const c of db.CPC_Clases.values()){c.fechaProgramada=start;c.fechaFinProgramada=end;}
 Object.assign(db.CPC_Usuario.get('teacher'),{codigoUsuario:'INSTRUCTOR',memberId:'teacherMember'});
 Object.assign(db.CPC_Usuario.get('other'),{codigoUsuario:'INSTRUCTOR',memberId:'otherMember'});
 db.CPC_Clases.get('class1').instructor2='other';
 db.CPC_Usuario.set('excluded',{_id:'excluded',codigoUsuario:'200',memberId:'studentMember'});db.CPC_Inscripciones.set('excluded',{_id:'excluded',usuario:'excluded',curso:'course1',considerarReportes:false});
 const list=await instructor('LIST');assert(list.isInstructor);assert.equal(list.classes.length,2);
 signedMember='studentMember';assert.equal((await instructor('LIST')).isInstructor,false);await assert.rejects(()=>instructor('LOAD',{classId:'class1'}));
 signedMember='teacherMember';db.CPC_Clases.set('unassigned',{_id:'unassigned',curso:'course1',instructor1:'nobody',fechaProgramada:start,fechaFinProgramada:end});await assert.rejects(()=>instructor('LOAD',{classId:'unassigned'}));
 let loaded=await instructor('LOAD',{classId:'class1'});assert.equal(loaded.rows.filter(r=>r.role==='PARTICIPANTE').length,1);assert.equal(loaded.attendanceLocked,false);
 await assert.rejects(()=>instructor('ATTENDANCE_SAVE',{classId:'class1',rows:loaded.rows}));
 const first=await instructor('ATTENDANCE_SAVE',{classId:'class1',rows:loaded.rows.map(r=>({...r,status:'PRESENTE'}))});assert(first.attendanceLocked);assert(first.attendanceSaved);assert.equal(first.rows.find(r=>r.role==='PARTICIPANTE').status,'PRESENTE');
 const reedit=await instructor('ATTENDANCE_SAVE',{classId:'class1',rows:loaded.rows.map(r=>({...r,status:'AUSENTE'}))});assert.equal(reedit.rows.find(r=>r.role==='PARTICIPANTE').status,'PRESENTE');
 // Panel corrections do not change the immutable consultation seen by instructor.
 db.CPC_Asistencias.get('class1').rows.find(r=>r.role==='PARTICIPANTE').status='AUSENTE';assert.equal((await instructor('LOAD',{classId:'class1'})).rows.find(r=>r.role==='PARTICIPANTE').status,'PRESENTE');
 const report=await call('ATTENDANCE_REPORT',{courseId:'course1'});assert.equal(report.rows.find(r=>r.key==='P:student').absent,1);
 signedMember='otherMember';const hidden=await instructor('LOAD',{classId:'class1'});assert(hidden.attendanceLocked);assert.equal(hidden.rows.length,0);await assert.rejects(()=>instructor('ATTENDANCE_SAVE',{classId:'class1',rows:[]}));
 signedMember='teacherMember';
 // Administrative-only records stay invisible and retain priority in the group report.
 db.CPC_Asistencias.set('class2',{_id:'class2',classId:'class2',courseId:'course2',rows:[{key:'P:other',status:'AUSENTE',name:'ADMIN RECORD'}]});
 const adminHidden=await instructor('LOAD',{classId:'class2'});assert(!JSON.stringify(adminHidden).includes('ADMIN RECORD'));
 const bytes=Buffer.from('test evidence'),sha=crypto.createHash('sha256').update(bytes).digest('hex'),op=crypto.randomUUID();
 const files=[{operationId:op,originalName:'image.jpg',mimeType:'image/jpeg',size:bytes.length,sha256:sha}];
 await instructor('EVIDENCE_BATCH',{classId:'class1',files});await assert.rejects(()=>instructor('EVIDENCE_BATCH',{classId:'class1',files:[{...files[0],operationId:crypto.randomUUID()}]}));
 await assert.rejects(()=>instructor('EVIDENCE_PREPARE',{classId:'class1',operationId:crypto.randomUUID()}));
 await assert.rejects(()=>instructor('EVIDENCE_CLOSE',{classId:'class1'}));
 const prepared=await instructor('EVIDENCE_PREPARE',{classId:'class1',operationId:op});assert(prepared.uploadUrl.startsWith('https://upload.test/'));assert.equal(prepared.confirmed,false);
 await assert.rejects(()=>instructor('EVIDENCE_CONFIRM',{classId:'class1',operationId:op,driveFileId:'DRIVE_WRONG_FOLDER_1'}));
 await assert.rejects(()=>instructor('EVIDENCE_CLOSE',{classId:'class1'}));
 await instructor('EVIDENCE_CONFIRM',{classId:'class1',operationId:op,driveFileId:'driveFileOK001'});
 await instructor('EVIDENCE_CONFIRM',{classId:'class1',operationId:op,driveFileId:'driveFileOK001'});
 const again=await instructor('EVIDENCE_PREPARE',{classId:'class1',operationId:op});assert.equal(again.confirmed,true);
 const complete=await instructor('EVIDENCE_CLOSE',{classId:'class1'});assert(complete.evidenceLocked);assert(complete.evidenceSent);assert.equal(complete.evidence.length,1);await assert.rejects(()=>instructor('EVIDENCE_PREPARE',{classId:'class1',operationId:op}));
 // Simultaneous submissions cannot replace the first immutable receipt.
 db.CPC_Clases.set('parallel',{_id:'parallel',curso:'course1',instructor1:'teacher',fechaProgramada:start,fechaFinProgramada:end,numeroClase:3});
 const parallel=await instructor('LOAD',{classId:'parallel'});
 const results=await Promise.all([instructor('ATTENDANCE_SAVE',{classId:'parallel',rows:parallel.rows.map(r=>({...r,status:'PRESENTE'}))}),instructor('ATTENDANCE_SAVE',{classId:'parallel',rows:parallel.rows.map(r=>({...r,status:'AUSENTE'}))})]);
 assert.equal(results[0].rows.find(r=>r.role==='PARTICIPANTE').status,results[1].rows.find(r=>r.role==='PARTICIPANTE').status);
 assert.equal(db.CPC_Asistencias.get('parallel').rows.find(r=>r.role==='PARTICIPANTE').status,results[0].rows.find(r=>r.role==='PARTICIPANTE').status);
 // Expired/missing end dates are rejected on the server, regardless of UI state.
 db.CPC_Clases.get('class2').fechaFinProgramada=new Date(Date.now()-1).toISOString();await assert.rejects(()=>instructor('ATTENDANCE_SAVE',{classId:'class2',rows:[]}));await assert.rejects(()=>instructor('EVIDENCE_BATCH',{classId:'class2',files}));assert((await instructor('LOAD',{classId:'class2'})).attendanceLocked);
 db.CPC_Clases.get('class2').fechaFinProgramada='';assert((await instructor('LOAD',{classId:'class2'})).evidenceLocked);
 assert(!db.CPC_Asistencias.get(receipt('ATTENDANCE','class1')).courseId);
 // Anonymous and ambiguous memberships cannot supply a memberId to impersonate another user.
 signedMember='';await assert.rejects(()=>instructor('LIST',{memberId:'teacherMember'}));
 signedMember='teacherMember';db.CPC_Usuario.set('duplicate',{_id:'duplicate',memberId:'teacherMember',codigoUsuario:'INSTRUCTOR'});await assert.rejects(()=>instructor('LIST'));
 console.log('PASS instructor: identidad OAuth, asignación, exclusión, cierre inmutable, privacidad de panel, reporte correcto, lote fijo, Drive simulado, vencimiento e idempotencia.');
})().catch(e=>{console.error(e);process.exitCode=1});
