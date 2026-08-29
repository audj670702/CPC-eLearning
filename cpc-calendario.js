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

let calState = { events: [], viewDate: new Date() };

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

  if (!calClean(data.memberId)) {
    await calFetch(`${CPC_CAL.patchItemUrl}/${encodeURIComponent(calItemId(item))}`, {
      method: 'PATCH',
      body: JSON.stringify({
        dataCollectionId: CPC_CAL.collections.usuarios,
        patch: {
          dataItemId: calItemId(item),
          fieldModifications: [{ fieldPath: 'memberId', action: 'SET_FIELD', setFieldOptions: { value: identity.memberId } }]
        }
      })
    });
    data.memberId = identity.memberId;
  }
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
    return Boolean((cursoId && context.courseIds.has(cursoId)) || context.courseKeys.has(destinatarioId));
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
  const courseIds = new Set(inscripciones.map(i => calRef(calData(i).curso)).filter(Boolean));

  const cursos = await calQuery(CPC_CAL.collections.cursos, { filter: { activo: true } });
  const courseMap = new Map();
  const courseKeys = new Set();
  cursos.forEach(item => {
    const d = calData(item);
    const id = calItemId(item);
    courseMap.set(id, { id, ...d });
    if (courseIds.has(id)) [id, d.codigoCurso, d.registroCurso].filter(Boolean).forEach(v => courseKeys.add(calClean(v)));
  });

  const eventos = await calQuery(CPC_CAL.collections.calendario, { filter: { activo: true } });
  const context = {
    usuarioId,
    codigoUsuario: calClean(usuario.codigoUsuario),
    memberId: identity.memberId,
    courseIds,
    courseKeys
  };

  const visible = eventos
    .map(item => ({ id: calItemId(item), ...calData(item) }))
    .filter(ev => calVisibleForUser(ev, context))
    .map(ev => ({ ...ev, cursoDetalle: courseMap.get(calRef(ev.cursoId || ev.curso)) || null }))
    .sort((a, b) => new Date(a.fechaInicio || 0) - new Date(b.fechaInicio || 0));

  return { state: 'OK', events: visible };
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
    .cpc-cal-eventchip{display:block;width:100%;border:0;text-align:left;background:#ede9fe;color:#4c1d95;border-radius:7px;padding:4px 6px;margin:3px 0;font-size:.68rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
    .cpc-cal-more{font-size:.66rem;color:#64748b;margin-top:3px}.cpc-cal-detail{position:fixed;inset:0;z-index:1310;background:rgba(15,23,42,.38);display:grid;place-items:center;padding:18px}.cpc-cal-detail[hidden]{display:none}.cpc-cal-detail-card{width:min(460px,100%);background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(15,23,42,.28);padding:18px}.cpc-cal-detail-head{display:flex;justify-content:space-between;gap:12px}.cpc-cal-detail-head button{border:0;background:#f1f5f9;border-radius:9px;width:34px;height:34px;font-size:20px;cursor:pointer}.cpc-cal-type{display:inline-block;font-size:.68rem;font-weight:800;color:#5b21b6;background:#ede9fe;padding:4px 8px;border-radius:999px;margin-bottom:7px}.cpc-cal-detail h3{margin:0 0 8px;font-size:1.05rem}.cpc-cal-detail p{margin:6px 0;color:#475569}.cpc-cal-detail small{display:block;margin:5px 0;color:#64748b}.cpc-cal-link{display:inline-block;margin-top:10px;font-weight:800;color:#1d4ed8;text-decoration:none}
    @media(max-width:620px){.cpc-cal-modal{padding:8px}.cpc-cal-panel{border-radius:16px;max-height:94vh}.cpc-cal-body{padding:0 7px 12px;max-height:calc(94vh - 108px)}.cpc-cal-toolbar{padding:10px}.cpc-cal-weekdays,.cpc-cal-grid{gap:3px}.cpc-cal-weekdays div{font-size:.62rem;padding:3px}.cpc-cal-day{min-height:72px;padding:4px;border-radius:8px}.cpc-cal-daynum{font-size:.68rem}.cpc-cal-eventchip{font-size:.59rem;padding:3px 4px}.cpc-cal-more{font-size:.58rem}.cpc-cal-nav button{padding:7px 9px}.cpc-cal-month{font-size:.9rem}}
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
  return calState.events.filter(ev => {
    const d = new Date(ev.fechaInicio || 0);
    return !Number.isNaN(d.getTime()) && calSameDay(d, day);
  });
}

function calRenderMonth() {
  const modal = document.getElementById('cpcCalendarModal');
  if (!modal) return;
  modal.querySelector('[data-cal-month]').textContent = calMonthLabel(calState.viewDate);
  const grid = modal.querySelector('[data-cal-grid]');
  const year = calState.viewDate.getFullYear();
  const month = calState.viewDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayIndex);
  const today = new Date();
  let html = '';

  for (let i = 0; i < 42; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const events = calEventsForDay(day);
    const other = day.getMonth() !== month;
    const isToday = calSameDay(day, today);
    const chips = events.slice(0, 2).map(ev => `<button class="cpc-cal-eventchip" type="button" data-cal-event="${calEscape(ev.id)}" title="${calEscape(ev.titulo || 'Evento CPC')}">${calEscape(ev.titulo || ev.tipoEvento || 'Evento')}</button>`).join('');
    const more = events.length > 2 ? `<div class="cpc-cal-more">+${events.length - 2} más</div>` : '';
    html += `<div class="cpc-cal-day${other ? ' is-other' : ''}${isToday ? ' is-today' : ''}"><div class="cpc-cal-daynum">${day.getDate()}</div>${chips}${more}</div>`;
  }
  grid.innerHTML = html;
}

function calFormatRange(ev) {
  const start = ev.fechaInicio ? new Date(ev.fechaInicio) : null;
  const end = ev.fechaFin ? new Date(ev.fechaFin) : null;
  const fmt = d => d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('es-MX', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(d) : '';
  const a = fmt(start), b = fmt(end);
  return a && b ? `${a} — ${b}` : a || b;
}

function calOpenDetail(eventId) {
  const ev = calState.events.find(item => item.id === eventId);
  if (!ev) return;
  const detail = document.getElementById('cpcCalendarDetail');
  const body = detail.querySelector('[data-cal-detail-body]');
  const curso = ev.cursoDetalle;
  const lugar = calClean(ev.lugar);
  const url = typeof ev.urlDestino === 'string' ? ev.urlDestino : (ev.urlDestino?.url || '');
  body.innerHTML = `
    <span class="cpc-cal-type">${calEscape(ev.tipoEvento || 'EVENTO')}</span>
    <h3>${calEscape(ev.titulo || 'Evento CPC')}</h3>
    <small>${calEscape(calFormatRange(ev))}</small>
    ${curso ? `<small>${calEscape(curso.codigoCurso || '')}${curso.nombreCurso ? ` · ${calEscape(curso.nombreCurso)}` : ''}</small>` : ''}
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
      <header class="cpc-cal-top"><strong id="cpcCalTitle">Calendario</strong><button class="cpc-cal-close" type="button" aria-label="Cerrar">×</button></header>
      <div class="cpc-cal-toolbar"><div class="cpc-cal-month" data-cal-month></div><div class="cpc-cal-nav"><button type="button" data-cal-prev>‹</button><button type="button" data-cal-today>Hoy</button><button type="button" data-cal-next>›</button></div></div>
      <div class="cpc-cal-body" data-cpc-cal-body>
        <div class="cpc-cal-weekdays"><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div></div>
        <div class="cpc-cal-grid" data-cal-grid></div>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const detail = document.createElement('div');
  detail.id = 'cpcCalendarDetail';
  detail.className = 'cpc-cal-detail';
  detail.hidden = true;
  detail.innerHTML = `<div class="cpc-cal-detail-card"><div class="cpc-cal-detail-head"><div data-cal-detail-body></div><button type="button" aria-label="Cerrar">×</button></div></div>`;
  document.body.appendChild(detail);

  const closeMain = () => { modal.hidden = true; detail.hidden = true; document.body.classList.remove('modal-open'); };
  modal.querySelector('.cpc-cal-close').addEventListener('click', closeMain);
  modal.addEventListener('click', e => { if (e.target === modal) closeMain(); });
  detail.querySelector('button').addEventListener('click', () => { detail.hidden = true; });
  detail.addEventListener('click', e => { if (e.target === detail) detail.hidden = true; });
  modal.querySelector('[data-cal-prev]').addEventListener('click', () => { calState.viewDate = new Date(calState.viewDate.getFullYear(), calState.viewDate.getMonth() - 1, 1); calRenderMonth(); });
  modal.querySelector('[data-cal-next]').addEventListener('click', () => { calState.viewDate = new Date(calState.viewDate.getFullYear(), calState.viewDate.getMonth() + 1, 1); calRenderMonth(); });
  modal.querySelector('[data-cal-today]').addEventListener('click', () => { calState.viewDate = new Date(); calRenderMonth(); });
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
    calState.events = result.events;
    calState.viewDate = new Date();
    body.innerHTML = '<div class="cpc-cal-weekdays"><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div></div><div class="cpc-cal-grid" data-cal-grid></div>';
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
