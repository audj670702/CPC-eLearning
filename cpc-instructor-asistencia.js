// CPC Instructor · sección de asistencia v1.1.0 (solo registro de asistencia).
import {S,$,escapeHtml,request,canRegister,storageWrite,draftKey,setStatus,statusHTML,lockIcon,confirmAction,clockText} from './cpc-instructor-core.js?v=1.1.0';

export function attendanceSection(){
  const d=S.data,locked=S.busy||d.attendanceLocked||!canRegister();
  const rows=d.rows.filter(r=>r.role==='PARTICIPANTE'||S.includeInstructors);
  return `<section class="cpi-section" data-section="asistencia" ${S.tab==='asistencia'?'':'hidden'}>
    <div class="cpi-section-bar"><h3>Registro de asistencia</h3><label class="cpi-include"><input type="checkbox" id="cpiIncludeInstructors" ${S.includeInstructors?'checked':''}> Incluir instructores</label></div>
    <div class="cpi-table-scroll"><table class="cpi-table"><thead><tr><th>No.</th><th>Código</th><th>Nombre</th><th>Cliente</th><th>Asistencia</th><th>Inasistencia</th><th>Justificación</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.client)}</td>${['PRESENTE','AUSENTE'].map(status=>`<td><input type="checkbox" data-cpi-key="${escapeHtml(r.key)}" data-status="${status}" aria-label="${status==='PRESENTE'?'Asistencia':'Inasistencia'}: ${escapeHtml(r.name)}" ${r.status===status?'checked':''} ${locked?'disabled':''}></td>`).join('')}<td><input type="checkbox" class="cpi-justified" data-cpi-key="${escapeHtml(r.key)}" data-justified aria-label="Justificación: ${escapeHtml(r.name)}" ${r.justified?'checked':''} ${locked||r.status!=='AUSENTE'?'disabled':''}></td></tr>`).join('')}</tbody></table></div>
    <div class="cpi-action">${statusHTML('attendance')}${d.attendanceSaved?lockIcon('Asistencia guardada'):d.attendanceLocked&&canRegister()?lockIcon('Asistencia cerrada'):`<button class="cpi-button" id="cpiSave" ${locked||!d.rows.length?'disabled':''}>Guardar</button>`}</div>
  </section>`;
}

export function bindAttendance(){
  const d=S.data,locked=S.busy||d.attendanceLocked||!canRegister();
  document.querySelectorAll('[data-section="asistencia"] [data-cpi-key]').forEach(input=>input.onchange=()=>{
    if(locked)return;
    const row=S.data.rows.find(r=>r.key===input.dataset.cpiKey);
    if(input.dataset.status){row.status=input.checked?input.dataset.status:'';if(row.status!=='AUSENTE')row.justified=false;}
    else row.justified=row.status==='AUSENTE'&&input.checked;
    storageWrite();S.rerender();
  });
  document.querySelectorAll('[data-section="asistencia"] td').forEach(td=>td.onclick=e=>{const box=td.querySelector('input[data-cpi-key]');if(!box||box.disabled||e.target===box)return;box.click();});
  const toggle=$('cpiIncludeInstructors');if(toggle)toggle.onchange=e=>{S.includeInstructors=e.target.checked;S.rerender();};
  const save=$('cpiSave');if(save)save.onclick=e=>confirmAction(e.currentTarget,'attendance',saveAttendance);
}

export async function saveAttendance(){
  if(S.busy||S.data.attendanceLocked||!canRegister())return;
  if(S.data.rows.some(r=>r.role==='PARTICIPANTE'&&!['PRESENTE','AUSENTE'].includes(r.status))){
    setStatus('attendance','error','Faltan participantes: marca Asistencia o Inasistencia en todos.');S.rerender();return;
  }
  S.busy=true;setStatus('attendance','working','Guardando asistencia…');S.rerender();
  try{
    const next=await request('ATTENDANCE_SAVE',{classId:S.data.classId,rows:S.data.rows.map(r=>({key:r.key,status:r.status,justified:r.justified===true}))});
    S.data=next;
    localStorage.removeItem(draftKey(next.classId));
    setStatus('attendance',next.attendanceSaved?'ok':'error',next.attendanceSaved?`Asistencia guardada · ${clockText()}`:'El servidor no confirmó el registro. Recarga la clase y revisa.');
  }catch(e){
    setStatus('attendance','error',`No se guardó la asistencia: ${e.message}`);
  }finally{S.busy=false;S.rerender();}
}
