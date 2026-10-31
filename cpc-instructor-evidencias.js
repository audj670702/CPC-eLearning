// CPC Instructor · sección de evidencias v1.1.0. Subida directa a Drive (modelo normalizado SYS/GESTIÓN):
// EVIDENCE_BATCH reserva el lote → EVIDENCE_PREPARE da la sesión → el navegador sube a Drive → EVIDENCE_CONFIRM → EVIDENCE_CLOSE.
import {S,$,escapeHtml,request,canRegister,setStatus,statusHTML,lockIcon,confirmAction,fileDraft,clockText} from './cpc-instructor-core.js?v=1.1.0';

const MAX_FILES=20;

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
  const d=S.data,locked=S.busy||d.evidenceLocked||!canRegister(),reserved=d.batch.length>0;
  return `<section class="cpi-section" data-section="evidencias" ${S.tab==='evidencias'?'':'hidden'}>
    <div class="cpi-section-bar"><h3>Evidencias del grupo</h3></div>
    <div>${d.evidence.map(e=>`<p><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.name)}</a></p>`).join('')||'<p class="cpi-muted">Aún no hay evidencias confirmadas.</p>'}</div>
    <label class="cpi-file-label">Seleccionar archivos<input id="cpiFiles" type="file" multiple ${locked?'disabled':''}></label>
    <label class="cpi-file-label">Tomar fotografía<input id="cpiCamera" type="file" accept="image/*" capture="environment" ${locked?'disabled':''}></label>
    <div id="cpiQueue">${queueHTML()}</div>
    <div class="cpi-action">${statusHTML('evidence')}${d.evidenceSent?lockIcon('Evidencias enviadas'):d.evidenceLocked&&canRegister()?lockIcon('Evidencias cerradas'):`<button class="cpi-button" id="cpiSend" ${locked||!S.queue.length?'disabled':''}>${reserved?'Reintentar':'Enviar'}</button>`}</div>
  </section>`;
}

export function bindEvidence(){
  const files=$('cpiFiles'),camera=$('cpiCamera');
  if(files)files.onchange=addFiles;
  if(camera)camera.onchange=addFiles;
  const send=$('cpiSend');if(send)send.onclick=e=>confirmAction(e.currentTarget,'evidence',sendEvidence);
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
  if(!canRegister()||S.data.evidenceLocked){setStatus('evidence','error','La carga ya no está disponible: el horario terminó o el lote ya fue reservado.');S.rerender();return;}
  const picked=[...event.target.files];event.target.value='';
  const limitMB=Math.round(S.data.maxBytes/1048576);
  if(S.queue.length+picked.length>MAX_FILES || picked.some(f=>!f.size||f.size>S.data.maxBytes)){
    setStatus('evidence','error',`Máximo ${MAX_FILES} archivos de hasta ${limitMB} MB cada uno.`);S.rerender();return;
  }
  S.queue.push(...picked.map(file=>({file,operationId:crypto.randomUUID(),completed:false,sha256:'',driveFileId:'',progress:0,uploading:false,error:''})));
  try{await fileDraft(S.queue);setStatus('evidence','idle',`${picked.length} archivo(s) listos. Pulsa Enviar para subirlos a Drive.`);}
  catch(e){setStatus('evidence','error','La precarga no se pudo conservar en el dispositivo. Mantén abierta esta vista.');}
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
async function persistQueue(){try{await fileDraft(S.queue);}catch(_){}}

export async function sendEvidence(){
  if(S.busy||S.data.evidenceLocked||!canRegister()||!S.queue.length)return;
  const g=S.generation,classId=S.data.classId;
  S.busy=true;setStatus('evidence','working','Preparando envío…');S.rerender();
  try{
    for(const q of S.queue)if(!q.sha256)q.sha256=await sha256Hex(q.file);
    await persistQueue();
    const files=S.queue.map(q=>({operationId:q.operationId,originalName:q.file.name,mimeType:q.file.type||'application/octet-stream',size:q.file.size,sha256:q.sha256}));
    const batchIds=(S.data.batch||[]).map(f=>f.operationId).join('|'),queueIds=files.map(f=>f.operationId).join('|');
    if(batchIds!==queueIds){await request('EVIDENCE_BATCH',{classId,files});S.data.batch=files;}
    const failed=[];
    for(let i=0;i<S.queue.length;i++){
      const q=S.queue[i];if(q.completed)continue;
      try{
        if(!q.driveFileId){
          const prep=await request('EVIDENCE_PREPARE',{classId,operationId:q.operationId});
          if(prep.confirmed){q.completed=true;}
          else{
            setStatus('evidence','working',`Subiendo ${i+1} de ${S.queue.length} a Drive…`);
            q.uploading=true;q.progress=0;S.rerender();
            const meta=await uploadToDrive(prep.uploadUrl,q.file,pct=>{q.progress=pct;setBar(i,pct);});
            q.uploading=false;q.driveFileId=meta.id;q.progress=100;q.error='';
            await persistQueue();
          }
        }
        if(!q.completed){
          setStatus('evidence','working',`Confirmando ${i+1} de ${S.queue.length}…`);
          await request('EVIDENCE_CONFIRM',{classId,operationId:q.operationId,driveFileId:q.driveFileId});
          q.completed=true;q.error='';await persistQueue();
        }
      }catch(err){
        q.uploading=false;q.error=err.message;failed.push(q.file.name);await persistQueue();
      }
    }
    if(g!==S.generation)return;
    if(failed.length){
      setStatus('evidence','error',`No se confirmaron ${failed.length} archivo(s): ${failed.join(', ')}. Los demás ya están en el servidor. Pulsa Reintentar.`);
      return;
    }
    S.data=await request('EVIDENCE_CLOSE',{classId});
    S.queue=[];await fileDraft(null).catch(()=>{});
    setStatus('evidence','ok',`Evidencias enviadas · ${clockText()}`);
  }catch(e){
    if(g===S.generation)setStatus('evidence','error',`No se envió la carga: ${e.message}`);
  }finally{
    if(g===S.generation){S.busy=false;S.rerender();}
  }
}
