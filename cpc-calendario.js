import { instructorContext, openInstructorClass } from './cpc-instructor.js?v=1.0.5';
const CPC_CAL = {
  tokenStorageKey: 'cpc_wix_member_tokens',
  queryUrl: 'https://www.wixapis.com/wix-data/v2/items/query',
  patchItemUrl: 'https://www.wixapis.com/data/v2/items',
  memberUrl: 'https://www.wixapis.com/members/v1/members/my?fieldSet=FULL',
  collections: {
    usuarios: 'CPC_Usuario',
    inscripciones: 'CPC_Inscripciones',
    cursos: 'CPC_Cursos',
    calendario: 'CPC_Calendario'
  }
};

let calState = { events: [], viewDate: new Date(), view:'calendar',filter:'all',isInstructor:false,selectedEventId:'' };

function calToken() {
  try { return JSON.parse(localStorage.getItem(CPC_CAL.tokenStorageKey) || 'null')?.accessToken?.value || ''; }
  catch { return ''; }
}

async function calFetch(url, options = {}) {
  const token = calToken();
  if (!token) { const e = new Error('AUTH_REQUIRED'); e.code = 'AUTH_REQUIRED'; throw e; }
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: token, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (response.status === 401 || response.status === 403) {
    const e = new Error('AUTH_REQUIRED'); e.code = 'AUTH_REQUIRED'; throw e;
  }
  if (!response.ok) throw new Error(`Wix API ${response.status}`);
  return response.json();
}

async function calQuery(collection, query = {}) {
  const result = await calFetch(CPC_CAL.queryUrl, {
    method: 'POST',
    body: JSON.stringify({ dataCollectionId: collection, query: { paging: { limit: 100 }, ...query } })
  });
  return result.dataItems || [];
}

const calData = item => item?.data || {};
const calItemId = item => item?.id || item?._id || calData(item)._id || '';
const calRef = value => typeof value === 'string' ? value : (value?._id || value?.id || value?.value || '');
const calClean = value => String(value ?? '').trim();
const calEmail = value => calClean(value).toLowerCase();

function calDateValue(value) {
  if (!value) return null;
  const raw = typeof value === 'object' && value.$date ? value.$date : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function calIdentity() {
  const result = await calFetch(CPC_CAL.memberUrl);
  const member = result.member || {};
  const candidates = [member.loginEmail, member?.contactDetails?.emails?.[0], member?.contact?.emails?.[0]];
  let email = '';
  for (const candidate of candidates) {
    if (!candidate) continue;
    email = calEmail(typeof candidate === 'string' ? candidate : (candidate.email || candidate.value || candidate.address || ''));
    if (email) break;
  }
  return { memberId: member.id || '', email };
}

async function calResolveUser(identity) {
  const byMember = await calQuery(CPC_CAL.collections.usuarios, { filter: { memberId: identity.memberId, activo: true } });
  if (byMember.length === 1) return byMember[0];
  if (byMember.length > 1) throw new Error('Existe más de un usuario CPC vinculado a esta identidad Wix.');
  if (!identity.email) return null;

  const byEmail = await calQuery(CPC_CAL.collections.usuarios, { filter: { email: identity.email, activo: true } });
  if (byEmail.length !== 1) return null;
  const item = byEmail[0];
  const data = calData(item);

  if (calClean(data.memberId) && calClean(data.memberId) !== identity.memberId) {
    throw new Error('El usuario CPC está vinculado a otra identidad Wix.');
  }

  // La vinculación memberId ↔ CPC_Usuario la hace el backend (cpcPwaContext,
  // primera entrada SYS). Aquí sólo se consulta.
  return item;
}

function calVisibleForUser(eventData, context) {
  const tipo = calClean(eventData.tipoEvento).toUpperCase();
  const destinatarioTipo = calClean(eventData.destinatarioTipo).toUpperCase();
  const destinatarioId = calClean(eventData.destinatarioId);
  const cursoId = calRef(eventData.cursoId || eventData.curso);

  if (tipo === 'CLASE') return Boolean(cursoId && context.courseIds.has(cursoId));
  if (destinatarioTipo === 'TODOS') return true;
  if (destinatarioTipo === 'CURSO') {
    return Boolean(
      (cursoId && context.courseIds.has(cursoId)) ||
      context.courseCodes.has(destinatarioId)
    );
  }
  if (destinatarioTipo === 'USUARIO') {
    return [context.usuarioId, context.codigoUsuario, context.memberId].filter(Boolean).includes(destinatarioId);
  }
  return false;
}

async function loadCalendarForCurrentUser() {
  const identity = await calIdentity();
  const userItem = await calResolveUser(identity);
  if (!userItem) return { state: 'USER_NOT_REGISTERED', events: [] };

  const usuarioId = calItemId(userItem);
  const usuario = calData(userItem);
  const inscripciones = await calQuery(CPC_CAL.collections.inscripciones, { filter: { usuario: usuarioId, activo: true } });
  const enrolledCourseIds = new Set(inscripciones.map(i => calRef(calData(i).curso)).filter(Boolean));

  const cursos = await calQuery(CPC_CAL.collections.cursos, { filter: { activo: true } });
  const courseMap = new Map();
  const courseCodes = new Set();

  cursos.forEach(item => {
    const d = calData(item);
    const id = calItemId(item);
    const course = { id, ...d };
    courseMap.set(id, course);
    if (enrolledCourseIds.has(id) && d.codigoCurso) courseCodes.add(calClean(d.codigoCurso));
  });

  const eventos = await calQuery(CPC_CAL.collections.calendario, { filter: { activo: true } });
  const context = {
    usuarioId,
    codigoUsuario: calClean(usuario.codigoUsuario),
    memberId: identity.memberId,
    courseIds: enrolledCourseIds,
    courseCodes
  };

  const visible = eventos
    .map(item => ({ id: calItemId(item), ...calData(item) }))
    .filter(ev => calVisibleForUser(ev, context))
    .map(ev => ({
      ...ev,
      cursoDetalle: courseMap.get(calRef(ev.cursoId || ev.curso)) || null,
      _fechaInicio: calDateValue(ev.fechaInicio),
      _fechaFin: calDateValue(ev.fechaFin)
    }))
    .filter(ev => ev._fechaInicio)
    .sort((a, b) => a._fechaInicio - b._fechaInicio);

  const instructor=await instructorContext();
  const byClass=new Map(visible.filter(ev=>ev.origen==='CLASE' && ev.origenId).map(ev=>[ev.origenId,ev]));
  for(const c of instructor.classes){
    const existing=byClass.get(c.id);
    if(existing){existing.instructorClassId=c.id;existing.instructorClass=c;existing.isParticipant=true;}
    else visible.push({id:'instructor:'+c.id,instructorClassId:c.id,instructorClass:c,tipoEvento:'CLASE',titulo:'Clase '+c.number,cursoDetalle:{codigoCurso:c.courseCode,nombreCurso:c.courseName},_fechaInicio:calDateValue(c.startAt),_fechaFin:calDateValue(c.endAt)});
  }
  return { state: 'OK',isInstructor:instructor.isInstructor,events:visible.filter(ev=>ev._fechaInicio).sort((a,b)=>a._fechaInicio.getTime()-b._fechaInicio.getTime()) };
}

function calEnsureStyles() {
  if (document.getElementById('cpcCalendarStyles')) return;
  const style = document.createElement('style');
  style.id = 'cpcCalendarStyles';
  style.textContent = `
    .cpc-cal-modal{position:fixed;inset:0;z-index:1300;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:14px}.cpc-cal-modal[hidden]{display:none}
    .cpc-cal-panel{width:min(920px,100%);max-height:90vh;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.28)}
    .cpc-cal-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e5e7eb}.cpc-cal-top strong{font-size:1.05rem}.cpc-cal-close,.cpc-cal-nav button{border:0;background:#f1f5f9;border-radius:10px;cursor:pointer}.cpc-cal-close{width:36px;height:36px;font-size:22px}
    .cpc-cal-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px}.cpc-cal-month{font-weight:800;text-transform:capitalize}.cpc-cal-nav{display:flex;gap:6px}.cpc-cal-nav button{padding:8px 11px;font-weight:700}
    .cpc-cal-body{padding:0 14px 16px;overflow:auto;max-height:calc(90vh - 112px)}.cpc-cal-loading,.cpc-cal-empty,.cpc-cal-error{padding:34px 12px;text-align:center;color:#64748b}
    .cpc-cal-weekdays,.cpc-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.cpc-cal-weekdays div{padding:5px;text-align:center;font-size:.72rem;font-weight:800;color:#64748b}
    .cpc-cal-day{min-height:96px;border:1px solid #e5e7eb;border-radius:12px;padding:7px;background:#fff;overflow:hidden}.cpc-cal-day.is-other{background:#f8fafc;color:#94a3b8}.cpc-cal-day.is-today{border-color:#7c3aed;box-shadow:inset 0 0 0 1px #7c3aed}.cpc-cal-daynum{font-size:.78rem;font-weight:800;margin-bottom:5px}
    .cpc-cal-eventchip{display:block;width:100%;border:0;text-align:left;background:#ede9fe;color:#4c1d95;border-radius:7px;padding:4px 6px;margin:3px 0;font-size:.68rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.cpc-cal-code{font-weight:900}
    .cpc-cal-more{font-size:.66rem;color:#64748b;margin-top:3px}.cpc-cal-detail{position:fixed;inset:0;z-index:1310;background:rgba(15,23,42,.38);display:grid;place-items:center;padding:18px}.cpc-cal-detail[hidden]{display:none}.cpc-cal-detail-card{width:min(460px,100%);background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(15,23,42,.28);padding:18px}.cpc-cal-detail-head{display:flex;justify-content:space-between;gap:12px}.cpc-cal-detail-head button{border:0;background:#f1f5f9;border-radius:9px;width:34px;height:34px;font-size:20px;cursor:pointer}.cpc-cal-type{display:inline-block;font-size:.68rem;font-weight:800;color:#5b21b6;background:#ede9fe;padding:4px 8px;border-radius:999px;margin-bottom:7px}.cpc-cal-coursecode{display:block;font-size:.78rem;font-weight:900;color:#5b21b6;margin:3px 0 8px}.cpc-cal-detail h3{margin:0 0 8px;font-size:1.05rem}.cpc-cal-detail p{margin:6px 0;color:#475569}.cpc-cal-detail small{display:block;margin:5px 0;color:#64748b}.cpc-cal-link{display:inline-block;margin-top:10px;font-weight:800;color:#1d4ed8;text-decoration:none}
    @media(max-width:620px){.cpc-cal-modal{padding:8px}.cpc-cal-panel{border-radius:16px;max-height:94vh}.cpc-cal-body{padding:0 7px 12px;max-height:calc(94vh - 108px)}.cpc-cal-toolbar{padding:10px}.cpc-cal-weekdays,.cpc-cal-grid{gap:3px}.cpc-cal-weekdays div{font-size:.62rem;padding:3px}.cpc-cal-day{min-height:72px;padding:4px;border-radius:8px}.cpc-cal-daynum{font-size:.68rem}.cpc-cal-eventchip{font-size:.59rem;padding:3px 4px}.cpc-cal-more{font-size:.58rem}.cpc-cal-nav button{padding:7px 9px}.cpc-cal-month{font-size:.9rem}}

    .cpc-cal-top{background:#245d8c;color:#fff;padding:14px 18px;border:0}.cpc-cal-title{display:flex;align-items:center;gap:10px}.cpc-cal-title>span{font-size:28px;line-height:1;font-family:Arial,sans-serif}.cpc-cal-top strong{font-weight:500;font-size:17px;letter-spacing:.2px}.cpc-cal-top .cpc-cal-close{background:#ffffff1f;color:#fff;border:1px solid #ffffff40;border-radius:6px;width:32px;height:32px;padding:0;line-height:1}
    .cpc-cal-toolbar{padding:14px 18px 8px}.cpc-cal-month{font-weight:500;font-size:18px;color:#245d8c}.cpc-cal-nav button{background:#f0f5f9;color:#245d8c;border-radius:5px;font-weight:400}.cpc-cal-nav button:first-child,.cpc-cal-nav button:last-child{font-size:22px;padding:3px 10px}.cpi-cal-controls{display:flex;align-items:flex-start;gap:24px;padding:6px 18px 14px;border-bottom:1px solid #e2e8f0;margin-bottom:12px;flex-wrap:wrap}.cpc-cal-control-group{display:flex;align-items:center;gap:8px}.cpc-cal-label{font-size:10px;color:#64748b}.cpc-cal-options{display:flex;gap:3px}.cpc-cal-options button{display:flex;align-items:center;gap:5px;padding:7px 8px;background:transparent;color:#64748b;border:0;border-bottom:2px solid transparent;border-radius:0;font-weight:400;cursor:pointer}.cpc-cal-options button>span{font-size:21px;line-height:1;font-family:Arial,sans-serif}.cpc-cal-options small{font-size:11px;white-space:nowrap}.cpc-cal-options button[aria-pressed=true]{color:#245d8c;border-bottom-color:#245d8c;background:#f0f6fb}.cpc-cal-options button[data-cal-filter=assigned][aria-pressed=true]{color:#9a4b0a;border-bottom-color:#e99029;background:#fff6e9}.cpc-cal-options button[hidden]{display:none}.cpc-cal-options button:focus-visible{outline:2px solid #245d8c;outline-offset:2px}.cpc-cal-body{max-height:calc(90vh - 205px)}
    @media(max-width:620px){.cpi-cal-controls{gap:10px;padding:4px 10px 10px}.cpc-cal-control-group{gap:5px}.cpc-cal-options button{flex-direction:column;gap:3px;padding:6px}.cpc-cal-options small{font-size:9px}.cpc-cal-month{font-size:16px}.cpc-cal-toolbar{padding:12px 10px 8px}.cpc-cal-body{max-height:calc(94vh - 220px)}}

    .cpc-cal-toolbar{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.cpc-cal-year{font-size:15px;color:#64748b;font-weight:400}.cpc-cal-month-nav{display:flex;align-items:center;gap:10px;justify-content:center}.cpc-cal-month{min-width:100px;text-align:center;font-size:18px;font-weight:500}.cpc-cal-today{justify-self:end;border:1px solid #d2dfe9;background:white;color:#245d8c;padding:7px 12px;border-radius:5px;font-size:12px;cursor:pointer}
    .cpc-cal-day.is-today{background:#e5f1fb;border:2px solid #245d8c;box-shadow:inset 0 0 0 1px #fff}.cpc-cal-day.is-today .cpc-cal-daynum{display:inline-grid;place-items:center;background:#245d8c;color:white;min-width:25px;height:25px;border-radius:50%;padding:0 3px;margin-bottom:6px}
    .cpc-cal-event-nav{display:flex;align-items:center;gap:8px;padding:0 18px 12px;color:#245d8c}.cpc-cal-event-nav>span{font-size:12px}.cpc-cal-event-nav button{width:28px;height:28px;background:#f0f5f9;color:#245d8c;border:0;border-radius:5px;font-size:22px;cursor:pointer}.cpc-cal-event-nav button:disabled{opacity:.3;cursor:default}.cpc-cal-event-nav small{font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.is-current-event{outline:2px solid #245d8c;outline-offset:-2px}
    .cpi-cal-controls{gap:20px}.cpc-cal-control-group{flex-direction:column;align-items:flex-start;gap:5px}.cpc-cal-control-group+.cpc-cal-control-group{border-left:1px solid #dce3eb;padding-left:20px}.cpc-cal-label{font-size:10px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:#526577}.cpc-cal-options small{font-weight:400;font-size:11px}.cpc-cal-body{max-height:calc(90vh - 250px)}
    @media(max-width:620px){.cpc-cal-toolbar{gap:5px}.cpc-cal-year{font-size:13px}.cpc-cal-month{min-width:82px;font-size:16px}.cpc-cal-month-nav{gap:4px}.cpc-cal-today{padding:6px 9px}.cpi-cal-controls{gap:12px}.cpc-cal-control-group+.cpc-cal-control-group{padding-left:12px}.cpc-cal-options small{font-size:9px}.cpc-cal-event-nav{padding:0 10px 10px}.cpc-cal-body{max-height:calc(94vh - 270px)}}

    .cpi-cal-controls{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;background:#245d8c;color:#fff;padding:7px 12px;margin:4px 14px 10px;border:0;border-radius:6px;flex-wrap:nowrap}.cpi-cal-controls .cpc-cal-control-group{display:block;padding:0;border:0}.cpi-cal-controls .cpc-cal-control-group:last-child .cpc-cal-options{justify-content:flex-end}.cpi-cal-controls .cpc-cal-options{gap:4px}.cpi-cal-controls .cpc-cal-options button{flex-direction:column;gap:3px;padding:6px 9px;color:#fff;border:0;border-radius:4px;background:transparent;min-width:48px}.cpi-cal-controls .cpc-cal-options button>span{font-size:22px}.cpi-cal-controls .cpc-cal-options small{font-size:10px;font-weight:400}.cpi-cal-controls .cpc-cal-options button[aria-pressed=true]{background:#fff;color:#245d8c;border:0}.cpi-cal-controls .cpc-cal-options button[data-cal-filter=assigned][aria-pressed=true]{background:#fff0df;color:#9a4b0a}.cpi-cal-controls .cpc-cal-options button:focus-visible{outline:2px solid #fff;outline-offset:2px}
    .cpi-cal-controls .cpc-cal-event-nav{display:flex;gap:5px;padding:0 12px;color:#fff;border-left:1px solid #ffffff40;border-right:1px solid #ffffff40}.cpi-cal-controls .cpc-cal-event-nav>span{display:flex;flex-direction:column;align-items:center;gap:3px}.cpi-cal-controls .cpc-cal-event-nav i{font-style:normal;font-size:22px;line-height:1}.cpi-cal-controls .cpc-cal-event-nav small{font-size:10px;color:#fff}.cpi-cal-controls .cpc-cal-event-nav button{background:transparent;color:#fff;width:24px;height:32px;font-size:24px}.cpc-cal-event-reference{display:block;margin:0 16px 10px;font-size:11px;color:#64748b}.cpc-cal-event-reference:empty{display:none}
    @media(max-width:620px){.cpi-cal-controls{gap:4px;margin:4px 7px 10px;padding:6px 4px}.cpi-cal-controls .cpc-cal-options{gap:2px}.cpi-cal-controls .cpc-cal-options button{padding:5px 4px;min-width:40px}.cpi-cal-controls .cpc-cal-options small{font-size:9px}.cpi-cal-controls .cpc-cal-event-nav{gap:2px;padding:0 5px}.cpi-cal-controls .cpc-cal-event-nav small{font-size:9px}.cpi-cal-controls .cpc-cal-event-nav button{width:20px}.cpc-cal-event-reference{margin:0 10px 8px}}

    /* Contenedor estable para Calendario, Lista y filtros */
    .cpc-cal-modal{place-items:start center;padding-top:20px}.cpc-cal-panel{height:calc(100dvh - 40px);max-height:900px;display:flex;flex-direction:column}.cpc-cal-panel>header,.cpc-cal-panel>.cpc-cal-toolbar,.cpc-cal-panel>.cpi-cal-controls,.cpc-cal-panel>.cpc-cal-event-reference{flex-shrink:0}.cpc-cal-panel>.cpc-cal-body{flex:1;min-height:0;max-height:none;overflow:auto}.cpc-cal-panel .cpc-cal-grid{min-height:100%}.cpc-cal-panel .cpc-cal-day{min-height:82px}.cpc-cal-panel .cpi-cal-list-wrap{min-height:100%}
    @media(max-width:620px){.cpc-cal-modal{padding:8px;place-items:start center}.cpc-cal-panel{height:calc(100dvh - 16px);max-height:none}.cpc-cal-panel>.cpc-cal-body{max-height:none}.cpc-cal-panel .cpc-cal-day{min-height:72px}}
  `;
  document.head.appendChild(style);
}

function calMonthLabel(date) {
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
}

function calSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function calEventsForDay(day) {
  return calFilteredEvents().filter(ev=>ev._fechaInicio && calMexicoDay(ev._fechaInicio)===`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`);
}

function calMexicoDay(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function calFilteredEvents(){return calState.events.filter(ev=>calState.filter!=='assigned'||ev.instructorClassId);}
function calToday(){const [y,m,d]=calMexicoDay(new Date()).split('-').map(Number);return new Date(y,m-1,d,12);}
function calEventTargets(){
 const events=calFilteredEvents().filter(e=>e._fechaInicio).slice().sort((a,b)=>a._fechaInicio.getTime()-b._fechaInicio.getTime()||String(a.id).localeCompare(String(b.id)));
 const index=events.findIndex(e=>e.id===calState.selectedEventId);
 if(index>=0)return {previous:events[index-1],next:events[index+1]};
 const now=Date.now();return {previous:events.filter(e=>e._fechaInicio.getTime()<now).at(-1),next:events.find(e=>e._fechaInicio.getTime()>=now)};
}
function calGoEvent(direction){
 const event=calEventTargets()[direction];if(!event)return;
 calState.selectedEventId=event.id;const [y,m,d]=calMexicoDay(event._fechaInicio).split('-').map(Number);calState.viewDate=new Date(y,m-1,d,12);calRenderMonth();
 const main=document.getElementById('cpcCalendarModal');const selected=main?.querySelector('.is-current-event');selected?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
}
function calRenderMonth() {
  const main=document.getElementById('cpcCalendarModal');if(!main)return;
  main.querySelector('[data-cal-year]').textContent=calState.viewDate.getFullYear();
  main.querySelector('[data-cal-month]').textContent=new Intl.DateTimeFormat('es-MX',{month:'long'}).format(calState.viewDate);
  const targets=calEventTargets();main.querySelector('[data-cal-event-prev]').disabled=!targets.previous;main.querySelector('[data-cal-event-next]').disabled=!targets.next;
  const selectedEvent=calFilteredEvents().find(e=>e.id===calState.selectedEventId);main.querySelector('[data-cal-event-reference]').textContent=selectedEvent?`${calMexicoDay(selectedEvent._fechaInicio).split('-').reverse().join('/')} · ${selectedEvent.titulo||'Evento'}`:'';
  main.querySelectorAll('[data-cal-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.calView===calState.view)));
  main.querySelectorAll('[data-cal-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.calFilter===calState.filter)));
  const list=main.querySelector('[data-cal-list]'),gridEl=main.querySelector('[data-cal-grid]'),weekdays=main.querySelector('.cpc-cal-weekdays');
  if(!list||!gridEl)return;
  list.hidden=calState.view!=='list';gridEl.hidden=calState.view==='list';weekdays.hidden=calState.view==='list';
  if(calState.view==='list'){
    const prefix=`${calState.viewDate.getFullYear()}-${String(calState.viewDate.getMonth()+1).padStart(2,'0')}`;
    const events=calFilteredEvents().filter(ev=>calMexicoDay(ev._fechaInicio).startsWith(prefix));
    list.innerHTML=events.length?`<table class="cpi-cal-list"><thead><tr><th>Fecha / horario</th><th>Clase / grupo</th><th>Referencia</th><th>Registro</th></tr></thead><tbody>${events.map(ev=>`<tr class="${ev.instructorClassId?'cpi-cal-assigned':''}${ev.id===calState.selectedEventId?' is-current-event':''}"><td>${calEscape(calFormatRange(ev))}</td><td><button data-cal-event="${calEscape(ev.id)}">${calEscape(ev.cursoDetalle?.codigoCurso||'')} · ${calEscape(ev.titulo)}</button><div>${calEscape(ev.cursoDetalle?.nombreCurso||'')}</div></td><td>${ev.instructorClassId?'INSTRUCTOR'+(ev.isParticipant?' · PARTICIPANTE':''):'PARTICIPANTE / EVENTO'}</td><td>${ev.instructorClass?calEscape('Asistencia: '+ev.instructorClass.attendanceState+' · Evidencias: '+ev.instructorClass.evidenceState):'—'}</td></tr>`).join('')}</tbody></table>`:'<p>No hay eventos para este mes y filtro.</p>';return;
  }
  const modal = document.getElementById('cpcCalendarModal');
  if (!modal) return;
  const grid = modal.querySelector('[data-cal-grid]');
  const year = calState.viewDate.getFullYear();
  const month = calState.viewDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayIndex);
  const today = calToday();
  let html = '';

  for (let i = 0; i < 42; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const events = calEventsForDay(day);
    const other = day.getMonth() !== month;
    const isToday = calSameDay(day, today);
    const shown=events.slice(0,2),picked=events.find(ev=>ev.id===calState.selectedEventId);if(picked&&!shown.includes(picked))shown[shown.length-1]=picked;
    const chips = shown.map(ev => {
      const code = calClean(ev.cursoDetalle?.codigoCurso);
      const label = `${ev.instructorClassId?'INSTRUCTOR · ':''}${code ? `${code} · ` : ''}${ev.titulo || ev.tipoEvento || 'Evento'}`;
      return `<button class="cpc-cal-eventchip${ev.instructorClassId?' cpi-cal-assigned':''}${ev.id===calState.selectedEventId?' is-current-event':''}" type="button" data-cal-event="${calEscape(ev.id)}" title="${calEscape(label)}">${calEscape(label)}</button>`;
    }).join('');
    const more = events.length > 2 ? `<div class="cpc-cal-more">+${events.length - 2} más</div>` : '';
    html += `<div class="cpc-cal-day${other ? ' is-other' : ''}${isToday ? ' is-today' : ''}"><div class="cpc-cal-daynum">${day.getDate()}</div>${chips}${more}</div>`;
  }
  grid.innerHTML = html;
}

function calFormatRange(ev) {
  const fmt = d => d ? new Intl.DateTimeFormat('es-MX', { timeZone:'America/Mexico_City', weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(d) : '';
  const a = fmt(ev._fechaInicio), b = fmt(ev._fechaFin);
  return a && b ? `${a} — ${b}` : a || b;
}

function calOpenDetail(eventId) {
  const ev = calState.events.find(item => item.id === eventId);
  if (!ev) return;
  if(ev.instructorClassId){openInstructorClass(ev.instructorClassId);return;}
  const detail = document.getElementById('cpcCalendarDetail');
  const body = detail.querySelector('[data-cal-detail-body]');
  const curso = ev.cursoDetalle;
  const code = calClean(curso?.codigoCurso);
  const lugar = calClean(ev.lugar || curso?.lugar);
  const url = typeof ev.urlDestino === 'string' ? ev.urlDestino : (ev.urlDestino?.url || '');
  body.innerHTML = `
    <span class="cpc-cal-type">${calEscape(ev.tipoEvento || 'EVENTO')}</span>
    ${code ? `<span class="cpc-cal-coursecode">${calEscape(code)}</span>` : ''}
    <h3>${calEscape(ev.titulo || 'Evento CPC')}</h3>
    <small>${calEscape(calFormatRange(ev))}</small>
    ${curso?.nombreCurso ? `<small>${calEscape(curso.nombreCurso)}</small>` : ''}
    ${lugar ? `<small>📍 ${calEscape(lugar)}</small>` : ''}
    ${ev.descripcion ? `<p>${calEscape(ev.descripcion)}</p>` : ''}
    ${url ? `<a class="cpc-cal-link" href="${calEscape(url)}">Abrir</a>` : ''}`;
  detail.hidden = false;
}

function calEnsureModal() {
  calEnsureStyles();
  let modal = document.getElementById('cpcCalendarModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'cpcCalendarModal';
  modal.className = 'cpc-cal-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="cpc-cal-panel" role="dialog" aria-modal="true" aria-labelledby="cpcCalTitle">
      <header class="cpc-cal-top"><div class="cpc-cal-title"><span aria-hidden="true">🗓</span><strong id="cpcCalTitle">Calendario</strong></div><button class="cpc-cal-close" type="button" aria-label="Cerrar">×</button></header>
      <div class="cpc-cal-toolbar"><span class="cpc-cal-year" data-cal-year></span><div class="cpc-cal-nav cpc-cal-month-nav"><button type="button" data-cal-prev aria-label="Mes anterior">‹</button><div class="cpc-cal-month" data-cal-month></div><button type="button" data-cal-next aria-label="Mes siguiente">›</button></div><button class="cpc-cal-today" type="button" data-cal-today>Hoy</button></div>
      <div class="cpi-cal-controls"><div class="cpc-cal-control-group" role="group" aria-label="Vista"><div class="cpc-cal-options"><button type="button" data-cal-view="calendar" aria-label="Calendario" title="Calendario" aria-pressed="true"><span aria-hidden="true">🗓</span><small>Calendario</small></button><button type="button" data-cal-view="list" aria-label="Lista" title="Lista" aria-pressed="false"><span aria-hidden="true">☷</span><small>Lista</small></button></div></div><div class="cpc-cal-event-nav" role="group" aria-label="Navegación de eventos"><button type="button" data-cal-event-prev aria-label="Evento anterior" title="Evento anterior">‹</button><span><i aria-hidden="true">⌖</i><small>Evento</small></span><button type="button" data-cal-event-next aria-label="Próximo evento" title="Próximo evento">›</button></div><div class="cpc-cal-control-group" role="group" aria-label="Eventos"><div class="cpc-cal-options"><button type="button" data-cal-filter="all" aria-label="Todos los eventos" title="Todos los eventos" aria-pressed="true"><span aria-hidden="true">◉</span><small>Todos</small></button><button type="button" data-cal-filter="assigned" aria-label="Clases asignadas" title="Clases asignadas" aria-pressed="false" hidden><span aria-hidden="true">⚑</span><small>Asignadas</small></button></div></div></div>
      <small class="cpc-cal-event-reference" data-cal-event-reference role="status" aria-live="polite"></small><div class="cpc-cal-body" data-cpc-cal-body><div class="cpc-cal-weekdays"><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div></div><div class="cpc-cal-grid" data-cal-grid></div></div>
    </section>`;
  document.body.appendChild(modal);

  const detail = document.createElement('div');
  detail.id = 'cpcCalendarDetail';
  detail.className = 'cpc-cal-detail';
  detail.hidden = true;
  detail.innerHTML = `<div class="cpc-cal-detail-card"><div class="cpc-cal-detail-head"><div data-cal-detail-body></div><button type="button" aria-label="Cerrar">×</button></div></div>`;
  document.body.appendChild(detail);

  modal.querySelectorAll('[data-cal-filter]').forEach(button=>button.onclick=()=>{calState.filter=button.dataset.calFilter;calState.selectedEventId='';calRenderMonth();});
  modal.querySelectorAll('[data-cal-view]').forEach(button=>button.onclick=()=>{calState.view=button.dataset.calView;calRenderMonth();});
  modal.querySelector('[data-cal-event-prev]').onclick=()=>calGoEvent('previous');
  modal.querySelector('[data-cal-event-next]').onclick=()=>calGoEvent('next');
  const closeMain = () => { modal.hidden = true; detail.hidden = true; document.body.classList.remove('modal-open'); };
  modal.querySelector('.cpc-cal-close').addEventListener('click', closeMain);
  modal.addEventListener('click', e => { if (e.target === modal) closeMain(); });
  detail.querySelector('button').addEventListener('click', () => { detail.hidden = true; });
  detail.addEventListener('click', e => { if (e.target === detail) detail.hidden = true; });
  modal.querySelector('[data-cal-prev]').addEventListener('click', () => { calState.viewDate = new Date(calState.viewDate.getFullYear(), calState.viewDate.getMonth() - 1, 1); calRenderMonth(); });
  modal.querySelector('[data-cal-next]').addEventListener('click', () => { calState.viewDate = new Date(calState.viewDate.getFullYear(), calState.viewDate.getMonth() + 1, 1); calRenderMonth(); });
  modal.querySelector('[data-cal-today]').addEventListener('click', () => { calState.viewDate = calToday();calState.selectedEventId=''; calRenderMonth(); });
  modal.addEventListener('click', e => {
    const chip = e.target.closest('[data-cal-event]');
    if (chip) calOpenDetail(chip.dataset.calEvent);
  });
  return modal;
}

async function openCalendar() {
  const modal = calEnsureModal();
  const body = modal.querySelector('[data-cpc-cal-body]');
  modal.hidden = false;
  document.body.classList.add('modal-open');
  body.innerHTML = '<div class="cpc-cal-loading">Cargando calendario…</div>';
  try {
    const result = await loadCalendarForCurrentUser();
    if (result.state === 'USER_NOT_REGISTERED') {
      body.innerHTML = '<div class="cpc-cal-empty"><strong>No existe un usuario CPC activo vinculado a esta cuenta.</strong></div>';
      return;
    }
    calState.events = result.events;calState.isInstructor=result.isInstructor;
    modal.querySelector('[data-cal-filter=assigned]').hidden=!result.isInstructor;
    if(!result.isInstructor)calState.filter='all';
    calState.viewDate = calToday();calState.selectedEventId='';
    body.innerHTML = '<div class="cpc-cal-weekdays"><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div></div><div class="cpc-cal-grid" data-cal-grid></div><div class="cpi-cal-list-wrap" data-cal-list hidden></div>';
    calRenderMonth();
  } catch (error) {
    console.error('CPC calendario:', error);
    if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') {
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      const login = document.querySelector('.session-btn');
      if (login) login.click(); else alert('Inicia sesión para consultar tu calendario.');
      return;
    }
    body.innerHTML = `<div class="cpc-cal-error"><strong>No fue posible cargar tu calendario.</strong><p>${calEscape(error?.message || 'Error de conexión con CPC.')}</p></div>`;
  }
}

document.addEventListener('click', event => {
  const card = event.target.closest('.module-card');
  if (!card) return;
  const title = card.querySelector('.module-copy strong')?.textContent?.trim().toUpperCase();
  if (title !== 'CALENDARIO') return;
  event.preventDefault();
  openCalendar();
});