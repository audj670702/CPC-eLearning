// CPC Instructor · sección de evidencias v1.1.5. Subida y confirmación por archivo en Drive.
import {S,$,escapeHtml,request,canRegister,setStatus,statusHTML,fileDraft,clockText} from './cpc-instructor-core.js?v=1.1.0';

function fileState(q){
  if(q.completed)return {key:'confirmed',label:'Confirmado en el servidor'};
  if(q.error)return {key:'error',label:q.error};
  if(q.driveFileId)return {key:'uploaded',label:'Subido a Drive · falta confirmar'};
  if(q.uploading)return {key:'uploading',label:`Subiendo ${q.progress||0}%`};
  return {key:'pending',label:'Pendiente'};
}

function queueHTML(){
  return S.queue.map((q,i)=>{
    const st=fileState(q),pct=q.completed?100:(q.progress||0);
    return `<div class="cpi-preview" data-file-state="${st.key}"><span data-preview="${i}"></span>
      <span class="cpi-file-text"><strong>${escapeHtml(q.file.name)}</strong> · ${(q.file.size/1024).toFixed(0)} KiB
      <small class="cpi-file-state">${escapeHtml(st.label)}</small>
      <span class="cpi-bar"><span id="cpiBar${i}" style="width:${pct}%"></span></span></span>
      <button type="button" data-remove="${i}" ${S.busy||q.completed?'disabled':''} aria-label="Quitar archivo">×</button></div>`;
  }).join('');
}

export function evidenceSection(){
  const d=S.data,available=d.evidencePerFile===true,locked=S.busy||!available||!canRegister();
  return `<section class="cpi-section" data-section="evidencias" ${S.tab==='evidencias'?'':'hidden'}>
    <div class="cpi-section-bar"><h3>Evidencias del grupo</h3></div>
    <div>${d.evidence.map(e=>`<p><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.name)}</a></p>`).join('')||'<p class="cpi-muted">Aún no hay evidencias confirmadas.</p>'}</div>
    <label class="cpi-file-label">Seleccionar archivos<input id="cpiFiles" type="file" multiple ${locked?'disabled':''}></label>
    <label class="cpi-file-label">Tomar fotografía<input id="cpiCamera" type="file" accept="image/*" capture="environment" ${locked?'disabled':''}></label>
    <div id="cpiQueue">${queueHTML()}</div>
    <div class="cpi-action">${statusHTML('evidence')}${!available&&canRegister()?'<span class="cpi-muted">La carga de evidencias está temporalmente en actualización.</span>':''}<button class="cpi-button" id="cpiSend" ${locked||!S.queue.length?'disabled':''}>${S.queue.some(q=>q.error)?'Reintentar':'Enviar'}</button></div>
  </section>`;
}

export function bindEvidence(){
  const files=$('cpiFiles'),camera=$('cpiCamera');
  if(files)files.onchange=addFiles;
  if(camera)camera.onchange=addFiles;
  const send=$('cpiSend');if(send)send.onclick=sendEvidence;
  document.querySelectorAll('[data-section="evidencias"] [data-remove]').forEach(b=>b.onclick=async()=>{
    S.queue.splice(Number(b.dataset.remove),1);
    try{await fileDraft(S.queue);}catch(e){setStatus('evidence','error',`No se pudo actualizar la precarga: ${e.message}`);}
    S.rerender();
  });
  S.queue.forEach((q,i)=>{
    if(!q.file.type?.startsWith('image/'))return;
    const holder=document.querySelector(`[data-preview="${i}"]`);if(!holder)return;
    const url=URL.createObjectURL(q.file),img=document.createElement('img');img.src=url;img.onload=img.onerror=()=>URL.revokeObjectURL(url);holder.append(img);
  });
}

async function addFiles(event){
  if(S.busy||!canRegister()||S.data.evidencePerFile!==true)return;
  const picked=[...event.target.files];event.target.value='';
  if(!picked.length)return;
  const limitMB=Math.round(S.data.maxBytes/1048576);
  const accepted=picked.filter(f=>f.size>0&&f.size<=S.data.maxBytes);
  S.queue.push(...accepted.map(file=>({file,operationId:crypto.randomUUID(),completed:false,sha256:'',driveFileId:'',progress:0,uploading:false,error:''})));
  try{
    if(accepted.length)await fileDraft(S.queue);
    const skipped=picked.length-accepted.length;
    setStatus('evidence',skipped?'error':'idle',skipped?`Se omitieron ${skipped} archivo(s) vacíos o mayores a ${limitMB} MB.`:'Pulsa Enviar para subir los archivos.');
  }catch(e){setStatus('evidence','error','No se pudo guardar la selección en el dispositivo. Mantén abierta esta vista.');}
  S.rerender();
}

async function sha256Hex(file){
  const bytes=await file.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Sube el archivo directo a la sesión de Drive y devuelve el recurso creado (con id).
export function uploadToDrive(uploadUrl,file,onProgress){
  return new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();
    x.open('PUT',uploadUrl);
    x.setRequestHeader('Content-Type',file.type||'application/octet-stream');
    x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(Math.round(e.loaded/e.total*100));};
    x.onload=()=>{
      if(x.status>=200&&x.status<300){try{resolve(JSON.parse(x.responseText));}catch(_){reject(new Error('Google Drive respondió algo inesperado.'));}}
      else reject(new Error(`Google Drive rechazó la carga (${x.status}).`));
    };
    x.onerror=()=>reject(new Error('Se interrumpió la carga. Revisa tu conexión e intenta de nuevo.'));
    x.send(file);
  });
}

function setBar(i,pct){const el=$('cpiBar'+i);if(el)el.style.width=pct+'%';}
export async function sendEvidence(){
  if(S.busy||!canRegister()||S.data.evidencePerFile!==true||!S.queue.length)return;
  const g=S.generation,classId=S.data.classId,queue=S.queue;
  const active=()=>g===S.generation&&S.data?.classId===classId;
  const persist=async()=>{if(active())await fileDraft(queue).catch(()=>{});};
  S.busy=true;setStatus('evidence','working','Preparando envío…');S.rerender();
  let confirmed=0;
  try{
    for(let i=0;i<queue.length;i++){
      if(!active())return;
      if(!canRegister())break;
      const q=queue[i];if(q.completed)continue;
      try{
        q.error='';
        if(!q.driveFileId){
          if(!q.sha256)q.sha256=await sha256Hex(q.file);
          if(!active())return;
          const prep=await request('EVIDENCE_PREPARE',{classId,operationId:q.operationId,file:{
            originalName:q.file.name,mimeType:q.file.type||'application/octet-stream',size:q.file.size,sha256:q.sha256
          }});
          if(!active())return;
          if(prep.confirmed)q.completed=true;
          else{
            setStatus('evidence','working',`Subiendo ${i+1} de ${queue.length}…`);
            q.uploading=true;q.progress=0;S.rerender();
            const meta=await uploadToDrive(prep.uploadUrl,q.file,pct=>{q.progress=pct;if(active())setBar(i,pct);});
            if(!active())return;
            q.uploading=false;
            if(!meta.id)throw new Error('Google Drive no devolvió el identificador del archivo.');
            q.driveFileId=meta.id;q.progress=100;
            await persist();
          }
        }
        if(!q.completed){
          setStatus('evidence','working',`Confirmando ${i+1} de ${queue.length}…`);
          const result=await request('EVIDENCE_CONFIRM',{classId,operationId:q.operationId,driveFileId:q.driveFileId});
          if(!active())return;
          S.data.evidence=result.evidence;
          q.completed=true;
        }
        confirmed++;
        await persist();
      }catch(err){
        q.uploading=false;q.error=err.message;await persist();
      }
    }
    if(!active())return;
    const remaining=queue.filter(q=>!q.completed);
    const wasAlreadyConfirmed=queue.some(q=>q.completed&&!S.data.evidence.some(e=>e.operationId===q.operationId));
    if(wasAlreadyConfirmed){
      try{
        const result=await request('LOAD',{classId});
        if(active())S.data.evidence=result.evidence;
      }catch(_){}
    }
    if(!active())return;
    S.queue=remaining;await fileDraft(remaining.length?remaining:null).catch(()=>{});
    if(!active())return;
    if(remaining.length){
      const summary=confirmed?`${confirmed} archivo(s) enviados. `:'';
      setStatus('evidence','error',summary+(canRegister()?`Pendientes: ${remaining.map(q=>q.file.name).join(', ')}. Pulsa Reintentar.`:'El horario de la clase terminó.'));
    }else{
      setStatus('evidence','ok',`Evidencias enviadas · ${clockText()}`);
    }
  }finally{
    if(active()){S.busy=false;S.rerender();}
  }
}
