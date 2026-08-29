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

function calToken() {
  try {
    return JSON.parse(localStorage.getItem(CPC_CAL.tokenStorageKey) || 'null')?.accessToken?.value || '';
  } catch {
    return '';
  }
}

async function calFetch(url, options = {}) {
  const token = calToken();
  if (!token) {
    const e = new Error('AUTH_REQUIRED');
    e.code = 'AUTH_REQUIRED';
    throw e;
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (response.status === 401 || response.status === 403) {
    const e = new Error('AUTH_REQUIRED');
    e.code = 'AUTH_REQUIRED';
    throw e;
  }
  if (!response.ok) throw new Error(`Wix API ${response.status}`);
  return response.json();
}

async function calQuery(collection, query = {}) {
  const result = await calFetch(CPC_CAL.queryUrl, {
    method: 'POST',
    body: JSON.stringify({
      dataCollectionId: collection,
      query: { paging: { limit: 100 }, ...query }
    })
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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function calIdentity() {
  const result = await calFetch(CPC_CAL.memberUrl);
  const member = result.member || {};
  const emailCandidates = [member.loginEmail, member?.contactDetails?.emails?.[0], member?.contact?.emails?.[0]];
  let email = '';
  for (const candidate of emailCandidates) {
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
          fieldModifications: [{
            fieldPath: 'memberId',
            action: 'SET_FIELD',
            setFieldOptions: { value: identity.memberId }
          }]
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

  // Las clases se autorizan exclusivamente por inscripción al curso.
  if (tipo === 'CLASE') return Boolean(cursoId && context.courseIds.has(cursoId));

  if (destinatarioTipo === 'TODOS') return true;
  if (destinatarioTipo === 'CURSO') {
    return Boolean((cursoId && context.courseIds.has(cursoId)) || context.courseKeys.has(destinatarioId));
  }
  if (destinatarioTipo === 'USUARIO') {
    return [context.usuarioId, context.codigoUsuario, context.memberId].filter(Boolean).includes(destinatarioId);
  }

  // GRUPO permanece cerrado hasta que exista una relación de grupos definida.
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
    if (courseIds.has(id)) {
      [id, d.codigoCurso, d.registroCurso].filter(Boolean).forEach(v => courseKeys.add(calClean(v)));
    }
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

function calDate(value, withTime = true) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(d);
}

function calModal() {
  let modal = document.getElementById('cpcCalendarModal');
  if (modal) return modal;

  const style = document.createElement('style');
  style.textContent = `
    .cpc-cal-modal{position:fixed;inset:0;z-index:1300;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:16px}.cpc-cal-modal[hidden]{display:none}.cpc-cal-panel{width:min(760px,100%);max-height:min(82vh,760px);background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.28)}.cpc-cal-top{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e5e7eb}.cpc-cal-top strong{font-size:1.15rem}.cpc-cal-top small{display:block;color:#64748b;margin-top:2px}.cpc-cal-close{border:0;background:#f1f5f9;border-radius:12px;width:38px;height:38px;font-size:24px;cursor:pointer}.cpc-cal-body{padding:14px 18px 20px;overflow:auto;max-height:calc(82vh - 78px)}.cpc-cal-loading,.cpc-cal-empty,.cpc-cal-error{padding:28px 12px;text-align:center;color:#64748b}.cpc-cal-event{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:14px 4px;border-bottom:1px solid #e5e7eb}.cpc-cal-event:last-child{border-bottom:0}.cpc-cal-date{font-size:.82rem;color:#475569;font-weight:700}.cpc-cal-main{min-width:0}.cpc-cal-type{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.04em;color:#5b21b6;background:#ede9fe;padding:4px 8px;border-radius:999px;margin-bottom:5px}.cpc-cal-main strong{display:block;color:#0f172a}.cpc-cal-main p{margin:5px 0 0;color:#475569}.cpc-cal-main small{display:block;margin-top:5px;color:#64748b}.cpc-cal-link{display:inline-block;margin-top:8px;font-weight:700;color:#1d4ed8;text-decoration:none}@media(max-width:620px){.cpc-cal-panel{border-radius:18px}.cpc-cal-event{grid-template-columns:1fr;gap:6px}.cpc-cal-body{padding:10px 14px 18px}}
  `;
  document.head.appendChild(style);

  modal = document.createElement('div');
  modal.id = 'cpcCalendarModal';
  modal.className = 'cpc-cal-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="cpc-cal-panel" role="dialog" aria-modal="true" aria-labelledby="cpcCalTitle">
      <header class="cpc-cal-top"><div><strong id="cpcCalTitle">Calendario</strong><small>Eventos vinculados a tus cursos y a tu usuario</small></div><button class="cpc-cal-close" type="button" aria-label="Cerrar">×</button></header>
      <div class="cpc-cal-body" data-cpc-cal-body></div>
    </section>`;
  document.body.appendChild(modal);

  const close = () => { modal.hidden = true; document.body.classList.remove('modal-open'); };
  modal.querySelector('.cpc-cal-close')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  return modal;
}

function calRender(result) {
  if (result.state === 'USER_NOT_REGISTERED') return '<div class="cpc-cal-empty"><strong>No existe un usuario CPC activo vinculado a esta cuenta.</strong></div>';
  if (!result.events.length) return '<div class="cpc-cal-empty"><strong>No tienes eventos vinculados.</strong><p>Cuando se programe una clase o evento para tus cursos aparecerá aquí.</p></div>';

  return result.events.map(ev => {
    const start = calDate(ev.fechaInicio, !ev.todoElDia);
    const end = calDate(ev.fechaFin, !ev.todoElDia);
    const curso = ev.cursoDetalle;
    const tipo = calClean(ev.tipoEvento) || 'EVENTO';
    const lugar = calClean(ev.lugar);
    const url = typeof ev.urlDestino === 'string' ? ev.urlDestino : (ev.urlDestino?.url || '');
    return `<article class="cpc-cal-event">
      <div class="cpc-cal-date">${calEscape(start)}${end ? `<br>→ ${calEscape(end)}` : ''}</div>
      <div class="cpc-cal-main">
        <span class="cpc-cal-type">${calEscape(tipo)}</span>
        <strong>${calEscape(ev.titulo || ev.tema || 'Evento CPC')}</strong>
        ${curso ? `<small>${calEscape(curso.codigoCurso || '')}${curso.nombreCurso ? ` · ${calEscape(curso.nombreCurso)}` : ''}</small>` : ''}
        ${ev.descripcion ? `<p>${calEscape(ev.descripcion)}</p>` : ''}
        ${lugar ? `<small>📍 ${calEscape(lugar)}</small>` : ''}
        ${url ? `<a class="cpc-cal-link" href="${calEscape(url)}">Abrir</a>` : ''}
      </div>
    </article>`;
  }).join('');
}

async function openCalendar() {
  const modal = calModal();
  const body = modal.querySelector('[data-cpc-cal-body]');
  modal.hidden = false;
  document.body.classList.add('modal-open');
  body.innerHTML = '<div class="cpc-cal-loading">Cargando calendario…</div>';
  try {
    body.innerHTML = calRender(await loadCalendarForCurrentUser());
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

const calVersionObserver = new MutationObserver(() => {
  const version = document.querySelector('.version');
  if (!version) return;
  version.textContent = 'v0.3.2 | 2026';
});
calVersionObserver.observe(document.documentElement, { childList: true, subtree: true });
