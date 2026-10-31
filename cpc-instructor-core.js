// CPC Instructor · núcleo compartido v1.1.0 · estado, API, borradores y estados anclados a cada acción.
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $=id=>document.getElementById(id);
export const S={api:null,memberId:'',generation:0,context:{isInstructor:false,classes:[]},data:null,busy:false,token:0,clockOffset:0,
  includeInstructors:false,tab:'asistencia',status:{attendance:null,evidence:null},queue:[],rerender:()=>{}};
export const now=()=>Date.now()+S.clockOffset;
export const canRegister=()=>!!S.data?.open && now()<new Date(S.data.endAt).getTime();
export const dateFormat=iso=>iso?new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'Sin horario';
export const clockText=()=>new Date(now()).toLocaleTimeString('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'});
export const draftKey=id=>`cpc-instructor:${S.memberId}:${id}`;
export function notify(message){const el=$('cpiNotice');if(el)el.textContent=message;}

export async function request(action,input={}){
  if(!S.api)throw Error('Inicia sesión.');
  const g=S.generation,call=S.api;
  const result=await call(action,input);
  if(g!==S.generation)throw Error('La sesión cambió. Abre nuevamente tu clase.');
  if(result.serverNow)S.clockOffset=new Date(result.serverNow).getTime()-Date.now();
  return result;
}

// Estado anclado: cada sección muestra su propio estado junto al botón de su acción.
export function setStatus(kind,state,text){S.status[kind]={state,text};const el=$(kind==='attendance'?'cpiStatusAttendance':'cpiStatusEvidence');if(el){el.dataset.state=state;el.textContent=text;}}
export function statusHTML(kind){
  const st=S.status[kind]||{state:'idle',text:''};
  const id=kind==='attendance'?'cpiStatusAttendance':'cpiStatusEvidence';
  return `<span class="cpi-status" id="${id}" data-state="${st.state}" role="status" aria-live="polite">${escapeHtml(st.text)}</span>`;
}

export function storageRead(id){try{return JSON.parse(localStorage.getItem(draftKey(id))||'null');}catch{return null;}}
export function storageWrite(){
  try{if(S.data && !S.data.attendanceLocked)localStorage.setItem(draftKey(S.data.classId),JSON.stringify(S.data.rows.map(r=>({key:r.key,status:r.status,justified:r.justified}))));}
  catch(e){setStatus('attendance','error','No se pudo conservar el borrador local. Mantén abierta esta vista.');}
}

// Precarga de archivos en IndexedDB (sobrevive a recargas). Clave por miembro y clase.
export function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('cpcInstructorDrafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function fileDraft(value){
  const draftId=draftKey(S.data.classId),database=await db();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('drafts',value===undefined?'readonly':'readwrite'),store=tx.objectStore('drafts'),key=draftId;let r;
    if(value===undefined)r=store.get(key);else if(value===null)r=store.delete(key);else r=store.put(value,key);
    tx.oncomplete=()=>{resolve(r.result);database.close();};
    tx.onerror=()=>{reject(tx.error);database.close();};
  });
}

export const lockIcon=label=>`<span class="cpi-lock" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></svg></span>`;

// Confirmación anclada al botón que la originó.
export function confirmAction(button,kind,action){
  document.querySelector('.cpi-confirm')?.remove();
  const classId=S.data?.classId,box=document.createElement('div');
  box.className='cpi-confirm';box.setAttribute('role','dialog');
  box.setAttribute('aria-label',kind==='attendance'?'Confirmar asistencia':'Confirmar evidencias');
  box.innerHTML=`<p>${kind==='attendance'?'¿Guardar asistencia?':'¿Enviar evidencias?'}<small>Después podrás consultar, sin editar.</small></p><div><button type="button" data-cancel>Cancelar</button><button type="button" data-confirm>Confirmar</button></div>`;
  button.parentElement.append(box);
  box.querySelector('[data-cancel]').onclick=()=>{box.remove();button.focus();};
  box.querySelector('[data-confirm]').onclick=()=>{box.remove();if(S.data?.classId===classId)action();};
  box.addEventListener('keydown',e=>{if(e.key==='Escape'){box.remove();button.focus();}});
  box.querySelector('[data-confirm]').focus();
}
