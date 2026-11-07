const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div class="identity-copy"></div><section class="modules-section"></section>',{url:'https://cpc.scad.mx/'});
let saved=0,closed=false,failConfirm=true,confirmCalls=0,uploadCalls=0;const evidence=[];
const rows=[{key:'P:a',userId:'a',role:'PARTICIPANTE',name:'Participante uno',code:'2088',client:'Empresa',status:''},{key:'P:b',userId:'b',role:'PARTICIPANTE',name:'Participante dos',code:'2089',client:'Empresa',status:''},{key:'I:i',userId:'i',role:'INSTRUCTOR',name:'Instructor',code:'INSTRUCTOR',client:'',status:''}];
const loaded=(extra={})=>({classId:'class1',courseCode:'C-1234',courseName:'Programa',number:1,topic:'Seguridad y supervisión',open:true,startAt:new Date(Date.now()-60000).toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),rows:structuredClone(rows),evidence:[...evidence],evidencePerFile:true,attendanceLocked:closed,evidenceLocked:false,maxBytes:26214400,...extra});
// Módulos reales (núcleo, asistencia, evidencias, shell) en un mismo contexto, sin import/export.
const sources=['cpc-instructor-core.js','cpc-instructor-asistencia.js','cpc-instructor-evidencias.js','cpc-instructor.js']
  .map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/^import .*;\n?/gm,'').replace(/export /g,'')).join('\n');
const ctx={console,document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage,URL:dom.window.URL,crypto:require('crypto').webcrypto,setInterval:()=>0,setTimeout,Date,Intl,Map,Set,indexedDB:{},XMLHttpRequest:class{},TextEncoder};
vm.createContext(ctx);vm.runInContext(sources,ctx);
vm.runInContext('fileDraft=async()=>[]',ctx);
// Drive simulado: subida que devuelve id; el archivo "malo.pdf" obtiene un id que el servidor rechaza al confirmar.
vm.runInContext("uploadToDrive=async(u,file)=>recordUpload(file)",ctx);
ctx.recordUpload=file=>{uploadCalls++;return {id:file.name==='malo.pdf'?'DRIVE_BAD_0001':'driveFileOK001'};};
ctx.member={id:'member1'};
ctx.apiMock=async(action,input)=>{
  if(action==='LIST')return {isInstructor:true,classes:[{id:'class1',number:1,courseCode:'C-1234',courseName:'Programa',attendanceState:'PENDIENTE',evidenceState:'PENDIENTE'}]};
  if(action==='LOAD')return loaded();
  if(action==='ATTENDANCE_SAVE'){saved++;assert.equal(input.rows.length,3);assert(input.rows.filter(r=>r.key.startsWith('P:')).every(r=>r.status==='PRESENTE'));closed=true;return {...loaded(),rows:input.rows.map(r=>({...rows.find(x=>x.key===r.key),...r})),attendanceSaved:true};}
  if(action==='EVIDENCE_PREPARE'){assert(input.file.sha256);return {operationId:input.operationId,uploadUrl:'https://upload.test/'+input.operationId,confirmed:false};}
  if(action==='EVIDENCE_CONFIRM'){
    confirmCalls++;
    if(failConfirm&&input.driveFileId==='DRIVE_BAD_0001')throw Error('Drive no confirma el archivo subido.');
    evidence.push({operationId:input.operationId,name:'Evidencia '+confirmCalls,url:'https://drive.google.com/file/d/'+input.driveFileId+'/view'});
    return loaded();
  }
  throw Error(action);
};
const $=id=>dom.window.document.getElementById(id);
const St=()=>vm.runInContext('S',ctx);
const until=async fn=>{for(let i=0;i<400&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert(fn(),'condición no cumplida');};
(async()=>{
 await vm.runInContext('initInstructor(member,apiMock)',ctx);assert(dom.window.document.querySelector('.cpi-module'));assert.equal(dom.window.document.querySelector('.cpi-profile').textContent,'INSTRUCTOR');
 await vm.runInContext("openInstructorClass('class1')",ctx);
 assert.equal(dom.window.document.querySelectorAll('.cpi-table tbody tr').length,2);assert(!dom.window.document.body.textContent.includes('Exportar'));
 assert(dom.window.document.querySelector('[data-cpi-tab="evidencias"]'));
 const toggle=$('cpiIncludeInstructors');toggle.checked=true;toggle.onchange({target:toggle});assert.equal(dom.window.document.querySelectorAll('.cpi-table tbody tr').length,3);
 for(const key of ['P:a','P:b']){const el=dom.window.document.querySelector(`[data-cpi-key="${key}"][data-status="PRESENTE"]`);el.checked=true;el.onchange();}
 assert(dom.window.document.querySelector('[data-cpi-close] svg'));assert(dom.window.document.querySelector('.cpi-topic').textContent.includes('Seguridad y supervisión'));assert(dom.window.document.querySelector('.cpi-section-bar #cpiIncludeInstructors'));
 // Estado anclado dentro de la misma sección y junto al botón de Guardar.
 assert(dom.window.document.querySelector('[data-section="asistencia"] .cpi-action #cpiStatusAttendance'));
 $('cpiSave').click();assert.equal(saved,0);assert(dom.window.document.querySelector('.cpi-confirm'));dom.window.document.querySelector('[data-cancel]').click();assert.equal(saved,0);
 $('cpiSave').click();dom.window.document.querySelector('[data-confirm]').click();await until(()=>saved===1&&!!$('cpiStatusAttendance')?.textContent.includes('guardada'));
 assert(!$('cpiSave'));assert(dom.window.document.querySelector('[aria-label="Asistencia guardada"]'));assert([...dom.window.document.querySelectorAll('[data-section="asistencia"] [data-cpi-key]')].every(el=>el.disabled));
 // Pestaña Evidencias: solo una sección visible a la vez.
 dom.window.document.querySelector('[data-cpi-tab="evidencias"]').click();
 assert(dom.window.document.querySelector('[data-section="asistencia"]').hasAttribute('hidden'));
 assert(!dom.window.document.querySelector('[data-section="evidencias"]').hasAttribute('hidden'));
 // Selección de archivos: se agregan a la cola y el estado queda junto a Enviar.
 const pdf=(name)=>({name,size:2048,type:'application/pdf',arrayBuffer:async()=>new TextEncoder().encode('contenido '+name).buffer});
 vm.runInContext("S.queue=[{file:{name:'ok.pdf',size:2048,type:'application/pdf',arrayBuffer:async()=>new TextEncoder().encode('ok').buffer},operationId:crypto.randomUUID(),completed:false,sha256:'',driveFileId:'',progress:0,uploading:false,error:''},{file:{name:'malo.pdf',size:2048,type:'application/pdf',arrayBuffer:async()=>new TextEncoder().encode('malo').buffer},operationId:crypto.randomUUID(),completed:false,sha256:'',driveFileId:'',progress:0,uploading:false,error:''}];S.rerender()",ctx);
 assert.equal(dom.window.document.querySelectorAll('#cpiQueue .cpi-preview').length,2);
 assert(dom.window.document.querySelector('[data-section="evidencias"] .cpi-action #cpiStatusEvidence'));
 $('cpiSend').click();assert(!dom.window.document.querySelector('.cpi-confirm'));
 await until(()=>$('cpiStatusEvidence')?.dataset.state==='error'&&!St().busy);
 assert.equal(St().queue.length,1);assert.equal(St().queue[0].file.name,'malo.pdf');
 assert.equal(dom.window.document.querySelectorAll('[data-section="evidencias"] a').length,1);
 assert(dom.window.document.querySelector('#cpiStatusEvidence').textContent.includes('malo.pdf'));
 assert(dom.window.document.querySelector('[data-file-state="error"]'));
 assert.equal(uploadCalls,2);
 // Reintentar solo la confirmación del archivo pendiente.
 failConfirm=false;assert($('cpiSend').textContent.includes('Reintentar'));$('cpiSend').click();
 await until(()=>$('cpiStatusEvidence')?.dataset.state==='ok'&&!St().busy);
 assert.equal(confirmCalls,3);assert.equal(uploadCalls,2);assert.equal(St().queue.length,0);
 assert(!$('cpiFiles').disabled);assert(!dom.window.document.querySelector('[aria-label="Evidencias enviadas"]'));
 const files=$('cpiFiles');
 await files.onchange({target:{files:Array.from({length:21},(_,i)=>pdf('archivo-'+i+'.pdf')),value:''}});
 assert.equal(St().queue.length,21);
 $('cpiSend').click();
 await until(()=>$('cpiStatusEvidence')?.dataset.state==='ok'&&!St().busy);
 assert.equal(evidence.length,23);assert.equal(uploadCalls,23);
 assert(!$('cpiFiles').disabled);
 // Sección de asistencia sigue bloqueada tras guardar; el cierre de sesión limpia la vista.
 await vm.runInContext('initInstructor(null,null)',ctx);assert(!dom.window.document.querySelector('.cpi-module'));assert(dom.window.document.getElementById('cpiModal').hidden);
 console.log('PASS UI v1.1.5: pestañas, estado anclado por sección, asistencia guardada, evidencias con Drive simulado, reintento solo de la confirmación y cierre de sesión. DOM simulado; no valida geometría.');
})().catch(e=>{console.error(e);process.exitCode=1});
