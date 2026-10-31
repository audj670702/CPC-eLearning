// CPC Instructor v1.1.0 · App v0.5.36 · shell: lista de clases, modal con pestañas y carga de clase.
// Asistencia y evidencias viven en módulos propios; comparten estado y API en cpc-instructor-core.js.
import {S,$,escapeHtml,request,dateFormat,canRegister,storageRead,fileDraft,notify,setStatus} from './cpc-instructor-core.js?v=1.1.0';
import {attendanceSection,bindAttendance} from './cpc-instructor-asistencia.js?v=1.1.0';
import {evidenceSection,bindEvidence} from './cpc-instructor-evidencias.js?v=1.1.0';

S.rerender=()=>render();

function ensureModal(){
  if($('cpiModal'))return;
  const modal=document.createElement('div');modal.id='cpiModal';modal.hidden=true;modal.className='cpi-overlay';
  modal.innerHTML=`<section class="cpi-panel" role="dialog" aria-modal="true" aria-labelledby="cpiTitle"><header class="cpi-top"><strong id="cpiTitle">Asistencias y Evidencias</strong><button type="button" data-cpi-close aria-label="Cerrar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header><div class="cpi-body"><div id="cpiReference"></div><div id="cpiNotice" role="status" aria-live="polite"></div><div id="cpiContent"></div><small class="cpi-version">Instructor v1.1.0</small></div></section>`;
  document.body.append(modal);
  modal.querySelector('[data-cpi-close]').onclick=()=>{if(S.busy)return;S.token++;modal.hidden=true;};
  modal.addEventListener('click',e=>{const c=e.target.closest('[data-cpi-class]');if(c)openInstructorClass(c.dataset.cpiClass);});
}

export async function initInstructor(member,callApi){
  const g=++S.generation;
  S.memberId=member?.id||'';S.api=S.memberId?callApi:null;S.context={isInstructor:false,classes:[]};S.data=null;S.queue=[];S.busy=false;S.token++;
  $('cpiModal')?.setAttribute('hidden','');document.querySelectorAll('.cpi-module,.cpi-profile').forEach(el=>el.remove());
  if(!S.api)return;
  try{
    const result=await request('LIST');if(g!==S.generation)return;S.context=result;if(!result.isInstructor)return;
    const copy=document.querySelector('.identity-copy');if(copy)copy.insertAdjacentHTML('beforeend','<span class="cpi-profile">INSTRUCTOR</span>');
    const section=document.querySelector('.modules-section');
    if(section){section.insertAdjacentHTML('beforeend','<button class="module-card accent-blue cpi-module" type="button"><span class="module-icon">☑</span><span class="module-copy"><strong>ASISTENCIAS Y EVIDENCIAS</strong><small>Mis clases asignadas</small></span><span class="arrow">›</span></button>');section.querySelector('.cpi-module').onclick=openInstructorList;}
  }catch(error){if(g===S.generation)console.warn('CPC Instructor v1.1.0:',error.message);}
}

export async function instructorContext(){
  if(!S.api)return {isInstructor:false,classes:[]};
  const g=S.generation;const result=await request('LIST');
  if(g!==S.generation)return {isInstructor:false,classes:[]};
  S.context=result;return result;
}

export async function openInstructorList(){
  ensureModal();$('cpiModal').hidden=false;$('cpiReference').textContent='Clases asignadas como instructor';$('cpiContent').innerHTML='';notify('Consultando…');
  const t=++S.token;
  try{
    const result=await instructorContext();if(t!==S.token)return;
    $('cpiContent').innerHTML=result.classes.length?result.classes.map(c=>`<button class="cpi-class" data-cpi-class="${escapeHtml(c.id)}"><strong>${escapeHtml(c.courseCode)} · Clase ${escapeHtml(c.number)}</strong><span>${escapeHtml(c.courseName)}</span><small>${escapeHtml(dateFormat(c.startAt))} — ${escapeHtml(dateFormat(c.endAt))}</small><small>Asistencia: ${escapeHtml(c.attendanceState)} · Evidencias: ${escapeHtml(c.evidenceState)}</small></button>`).join(''):'No tienes clases asignadas.';
    notify('');
  }catch(e){notify(e.message);}
}

export async function openInstructorClass(classId){
  ensureModal();if(S.busy)return;
  const t=++S.token;$('cpiModal').hidden=false;$('cpiContent').innerHTML='';notify('Cargando clase…');
  try{
    const result=await request('LOAD',{classId});if(t!==S.token)return;
    S.data=result;S.queue=[];S.includeInstructors=false;S.tab='asistencia';S.status={attendance:null,evidence:null};
    const draft=storageRead(classId);
    if(!S.data.attendanceLocked && draft){const byKey=new Map(draft.map(r=>[r.key,r]));S.data.rows=S.data.rows.map(r=>({...r,...(byKey.get(r.key)||{})}));}
    try{S.queue=await fileDraft()||[];}catch(e){console.warn('CPC: no se recuperó la precarga local.',e.message);}
    if(t!==S.token)return;
    render();notify('');
  }catch(e){if(t===S.token)notify(e.message);}
}

function render(){
  if(!S.data)return;
  const d=S.data;
  $('cpiReference').innerHTML=`<div>${escapeHtml(d.courseCode)} · ${escapeHtml(d.courseName)}</div><div class="cpi-reference"><strong>Clase ${escapeHtml(d.number)}</strong><span>${escapeHtml(dateFormat(d.startAt))} — ${escapeHtml(dateFormat(d.endAt))}</span></div>${d.topic?`<div class="cpi-topic"><span>Temas</span>${escapeHtml(d.topic)}</div>`:''}${!canRegister()?`<div class="cpi-schedule" role="status">${escapeHtml(d.reason||(Date.now()<new Date(d.startAt).getTime()?'La clase aún no inicia.':'La clase ha concluido.'))}</div>`:''}`;
  const tab=(id,label)=>`<button type="button" role="tab" data-cpi-tab="${id}" aria-selected="${S.tab===id}" class="cpi-tab${S.tab===id?' is-active':''}">${label}</button>`;
  $('cpiContent').innerHTML=`<nav class="cpi-tabs" role="tablist">${tab('asistencia','Asistencia')}${tab('evidencias','Evidencias')}</nav>${attendanceSection()}${evidenceSection()}`;
  $('cpiContent').querySelectorAll('[data-cpi-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.cpiTab;render();});
  bindAttendance();bindEvidence();
}

setInterval(()=>{
  if(S.data && !$('cpiModal')?.hidden && !canRegister() && !S.busy && S.data.open){S.data.open=false;S.data.reason='La clase ha concluido.';render();notify('');}
},1000);
window.addEventListener('online',()=>{if(S.data && !$('cpiModal')?.hidden)notify(canRegister()?'Conexión recuperada. Reintenta la acción pendiente.':'El horario de registro terminó.');});
window.addEventListener('offline',()=>{if(S.data && !$('cpiModal')?.hidden)notify('Sin conexión. Las marcas y la precarga quedan en este dispositivo; el envío requiere conexión antes del término de la clase.');});
console.info('CPC Instructor | v1.1.0 | App v0.5.36');
