const CPC_DATA = {
  tokenStorageKey: 'cpc_wix_member_tokens',
  queryUrl: 'https://www.wixapis.com/wix-data/v2/items/query',
  patchItemUrl: 'https://www.wixapis.com/data/v2/items',
  memberUrl: 'https://www.wixapis.com/members/v1/members/my?fieldSet=FULL',
  collections: { usuarios: 'CPC_Usuario', inscripciones: 'CPC_Inscripciones', cursos: 'CPC_Cursos' }
};

function readAccessToken() {
  try { return JSON.parse(localStorage.getItem(CPC_DATA.tokenStorageKey) || 'null')?.accessToken?.value || ''; }
  catch { return ''; }
}

async function wixFetch(url, options = {}) {
  const accessToken = readAccessToken();
  if (!accessToken) { const error = new Error('AUTH_REQUIRED'); error.code = 'AUTH_REQUIRED'; throw error; }
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: accessToken, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (response.status === 401 || response.status === 403) { const error = new Error('AUTH_REQUIRED'); error.code = 'AUTH_REQUIRED'; throw error; }
  if (!response.ok) throw new Error(`Wix API ${response.status}`);
  return response.json();
}

async function queryCollection(dataCollectionId, query = {}) {
  const result = await wixFetch(CPC_DATA.queryUrl, {
    method: 'POST',
    body: JSON.stringify({ dataCollectionId, query: { paging: { limit: 100 }, ...query } })
  });
  return result.dataItems || [];
}

const getData = item => item?.data || {};
const itemId = item => item?.id || item?._id || getData(item)._id || '';
const referenceId = value => typeof value === 'string' ? value : (value?._id || value?.id || value?.value || '');
const normalizeEmail = value => String(value || '').trim().toLowerCase();

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  const raw = typeof value === 'object' && value.$date ? value.$date : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function normalizeCourseUrl(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : (value.url || value.href || '');
}

function normalizeWixImage(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    const direct = value.url || value.src || value.fileUrl || '';
    if (direct) return normalizeWixImage(direct);
    const mediaId = value.id || value.mediaId || '';
    return mediaId ? `https://static.wixstatic.com/media/${encodeURIComponent(mediaId)}` : '';
  }
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('wix:image://v1/')) {
    const mediaPath = raw.slice('wix:image://v1/'.length).split('#')[0];
    const mediaId = mediaPath.split('/')[0];
    return mediaId ? `https://static.wixstatic.com/media/${mediaId}` : '';
  }
  return '';
}

function normalizeStatus(value) {
  return String(value || 'Inscrito').trim() || 'Inscrito';
}

function statusKey(value) {
  return normalizeStatus(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function statusClass(value) {
  const key = statusKey(value);
  if (key.includes('pendiente') || key.includes('programado')) return 'is-pending';
  if (key.includes('proceso')) return 'is-progress';
  if (key.includes('concluido') || key.includes('aprobado')) return 'is-done';
  if (key.includes('cancelado') || key.includes('no-aprobado')) return 'is-cancelled';
  if (key.includes('no-aplica')) return 'is-neutral';
  return '';
}

function extractMemberEmail(member) {
  const candidates = [member?.loginEmail, member?.contactDetails?.emails?.[0], member?.contact?.emails?.[0]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string') return normalizeEmail(candidate);
    const value = candidate.email || candidate.value || candidate.address || '';
    if (value) return normalizeEmail(value);
  }
  return '';
}

async function getCurrentMemberIdentity() {
  const result = await wixFetch(CPC_DATA.memberUrl);
  const member = result.member || {};
  return { memberId: member.id || '', email: extractMemberEmail(member) };
}

async function bindMemberIdToUser(itemIdValue, memberId) {
  return wixFetch(`${CPC_DATA.patchItemUrl}/${encodeURIComponent(itemIdValue)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      dataCollectionId: CPC_DATA.collections.usuarios,
      patch: {
        dataItemId: itemIdValue,
        fieldModifications: [{ fieldPath: 'memberId', action: 'SET_FIELD', setFieldOptions: { value: memberId } }]
      }
    })
  });
}

async function resolveCpcUser(identity) {
  const byMemberId = await queryCollection(CPC_DATA.collections.usuarios, { filter: { memberId: identity.memberId, activo: true } });
  if (byMemberId.length > 1) return { state: 'IDENTITY_CONFLICT', usuarioItem: null };
  if (byMemberId.length === 1) return { state: 'OK', usuarioItem: byMemberId[0] };
  if (!identity.email) return { state: 'MEMBER_EMAIL_MISSING', usuarioItem: null };

  const byEmail = await queryCollection(CPC_DATA.collections.usuarios, { filter: { email: identity.email, activo: true } });
  if (byEmail.length > 1) return { state: 'DUPLICATE_EMAIL', usuarioItem: null };
  if (!byEmail.length) return { state: 'USER_NOT_REGISTERED', usuarioItem: null };

  const usuarioItem = byEmail[0];
  const usuarioData = getData(usuarioItem);
  const linkedMemberId = String(usuarioData.memberId || '').trim();
  if (linkedMemberId && linkedMemberId !== identity.memberId) return { state: 'IDENTITY_CONFLICT', usuarioItem: null };
  if (!linkedMemberId) {
    await bindMemberIdToUser(itemId(usuarioItem), identity.memberId);
    usuarioData.memberId = identity.memberId;
  }
  return { state: 'OK', usuarioItem };
}

async function loadMyCourses() {
  const identity = await getCurrentMemberIdentity();
  if (!identity.memberId) throw new Error('No fue posible identificar al miembro Wix.');
  const resolution = await resolveCpcUser(identity);
  if (!resolution.usuarioItem) return { ...identity, usuario: null, inscripciones: [], state: resolution.state };

  const usuario = getData(resolution.usuarioItem);
  const usuarioId = itemId(resolution.usuarioItem);
  const inscripciones = await queryCollection(CPC_DATA.collections.inscripciones, { filter: { usuario: usuarioId, activo: true } });
  if (!inscripciones.length) return { ...identity, usuario, inscripciones: [], state: 'NO_ENROLLMENTS' };

  const cursos = await queryCollection(CPC_DATA.collections.cursos, { filter: { activo: true } });
  const courseMap = new Map(cursos.map(item => {
    const data = getData(item);
    const id = itemId(item);
    return [id, { id, ...data }];
  }));

  const enriched = inscripciones.map(item => {
    const data = getData(item);
    const courseId = referenceId(data.curso);
    const cursoDetalle = courseMap.get(courseId) || null;
    return {
      id: itemId(item),
      ...data,
      courseId,
      codigoCurso: cursoDetalle?.codigoCurso || '',
      cursoDetalle
    };
  });

  return { ...identity, usuario, inscripciones: enriched, state: 'OK' };
}

function ensureCoursesModal() {
  let modal = document.getElementById('cpcCoursesModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'cpcCoursesModal';
  modal.className = 'cpc-courses-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="cpc-courses-panel" role="dialog" aria-modal="true" aria-labelledby="cpcCoursesTitle">
      <header class="cpc-courses-topbar">
        <div class="cpc-courses-heading">
          <strong id="cpcCoursesTitle">Mis cursos</strong>
          <small data-cpc-courses-summary>Consultando cursos…</small>
        </div>
        <button class="cpc-courses-close" type="button" aria-label="Cerrar">×</button>
      </header>
      <div class="cpc-courses-filters" data-cpc-courses-filters hidden></div>
      <div class="cpc-courses-body" data-cpc-courses-body></div>
    </section>`;
  document.body.appendChild(modal);
  const close = () => { modal.hidden = true; document.body.classList.remove('modal-open'); };
  modal.querySelector('.cpc-courses-close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  return modal;
}

function getRenderableCourses(result) {
  if (!Array.isArray(result?.inscripciones)) return [];
  return result.inscripciones.map(inscripcion => {
    const curso = inscripcion.cursoDetalle;
    if (!curso) return null;
    const status = normalizeStatus(inscripcion.estatus || curso.estatus || 'Inscrito');
    return { inscripcion, curso, status, filterKey: statusKey(status) };
  }).filter(Boolean);
}

function renderCourseCard(entry) {
  const { curso, status, filterKey } = entry;
  const code = curso.codigoCurso || 'Sin código';
  const start = formatDate(curso.fechaInicio);
  const end = formatDate(curso.fechaFin);
  const dateText = start && end ? `${start} — ${end}` : start || end || '';
  const url = normalizeCourseUrl(curso.urlCurso);
  const image = normalizeWixImage(curso.imagenUrl);
  const imageMarkup = image
    ? `<div class="cpc-course-thumb"><img src="${escapeHtml(image)}" alt="" loading="lazy"></div>`
    : '';
  const openMarkup = url
    ? `<a class="cpc-course-open" href="${escapeHtml(url)}" aria-label="Abrir ${escapeHtml(curso.nombreCurso || code)}" title="Abrir curso">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>
       </a>`
    : `<span class="cpc-course-no-link" aria-label="Sin enlace disponible">—</span>`;

  return `
    <article class="cpc-course-row${image ? ' has-image' : ''}" data-course-status="${escapeHtml(filterKey)}">
      ${imageMarkup}
      <div class="cpc-course-main">
        <span class="cpc-course-status ${statusClass(status)}">${escapeHtml(status)}</span>
        <strong class="cpc-course-code">${escapeHtml(code)}</strong>
        <p class="cpc-course-title">${escapeHtml(curso.nombreCurso || 'Curso CPC')}</p>
        ${dateText ? `<small class="cpc-course-date"><span aria-hidden="true">▣</span>${escapeHtml(dateText)}</small>` : ''}
      </div>
      ${openMarkup}
    </article>`;
}

function renderFilters(entries) {
  const counts = new Map();
  const labels = new Map();
  entries.forEach(entry => {
    counts.set(entry.filterKey, (counts.get(entry.filterKey) || 0) + 1);
    if (!labels.has(entry.filterKey)) labels.set(entry.filterKey, entry.status);
  });

  return [
    `<button class="cpc-course-filter is-active" type="button" data-filter="all">Todos <span>(${entries.length})</span></button>`,
    ...Array.from(counts.entries()).map(([key, count]) =>
      `<button class="cpc-course-filter" type="button" data-filter="${escapeHtml(key)}">${escapeHtml(labels.get(key))} <span>(${count})</span></button>`
    )
  ].join('');
}

function bindCourseFilters(modal) {
  const filters = modal.querySelector('[data-cpc-courses-filters]');
  if (!filters || filters.dataset.bound === '1') return;
  filters.dataset.bound = '1';
  filters.addEventListener('click', event => {
    const button = event.target.closest('.cpc-course-filter');
    if (!button) return;
    const selected = button.dataset.filter || 'all';
    filters.querySelectorAll('.cpc-course-filter').forEach(item => item.classList.toggle('is-active', item === button));
    modal.querySelectorAll('.cpc-course-row').forEach(row => {
      row.hidden = selected !== 'all' && row.dataset.courseStatus !== selected;
    });
  });
}

function renderCourseRows(result, modal) {
  const summary = modal.querySelector('[data-cpc-courses-summary]');
  const filters = modal.querySelector('[data-cpc-courses-filters]');
  filters.hidden = true;
  filters.innerHTML = '';

  if (result.state === 'USER_NOT_REGISTERED') {
    summary.textContent = 'Sin cursos disponibles';
    return `<div class="cpc-courses-empty"><strong>Tu cuenta Wix está conectada.</strong><p>No existe un usuario CPC activo registrado con el correo ${escapeHtml(result.email || '')}.</p></div>`;
  }
  if (result.state === 'MEMBER_EMAIL_MISSING') {
    summary.textContent = 'No fue posible identificar tus cursos';
    return '<div class="cpc-courses-empty"><strong>No fue posible vincular tu identidad CPC.</strong></div>';
  }
  if (result.state === 'DUPLICATE_EMAIL' || result.state === 'IDENTITY_CONFLICT') {
    summary.textContent = 'Revisión administrativa requerida';
    return '<div class="cpc-courses-error"><strong>Existe una inconsistencia en tu registro CPC.</strong><p>Requiere revisión administrativa.</p></div>';
  }
  if (result.state === 'NO_ENROLLMENTS') {
    summary.textContent = '0 cursos';
    return '<div class="cpc-courses-empty"><strong>No tienes cursos asignados.</strong><p>Cuando exista una inscripción activa aparecerá aquí automáticamente.</p></div>';
  }

  const entries = getRenderableCourses(result);
  const count = entries.length;
  summary.textContent = `${count} ${count === 1 ? 'curso' : 'cursos'} en total`;

  if (!entries.length) {
    return '<div class="cpc-courses-empty"><strong>Tienes inscripciones activas, pero no fue posible vincular sus cursos.</strong></div>';
  }

  filters.innerHTML = renderFilters(entries);
  filters.hidden = false;
  bindCourseFilters(modal);
  return entries.map(renderCourseCard).join('');
}

async function openMyCourses() {
  const modal = ensureCoursesModal();
  const body = modal.querySelector('[data-cpc-courses-body]');
  const summary = modal.querySelector('[data-cpc-courses-summary]');
  const filters = modal.querySelector('[data-cpc-courses-filters]');
  modal.hidden = false;
  document.body.classList.add('modal-open');
  summary.textContent = 'Consultando cursos…';
  filters.hidden = true;
  body.innerHTML = '<div class="cpc-courses-loading">Cargando cursos…</div>';
  try {
    const result = await loadMyCourses();
    body.innerHTML = renderCourseRows(result, modal);
  } catch (error) {
    console.error('CPC cursos:', error);
    if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') {
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      const loginButton = document.querySelector('.session-btn');
      if (loginButton) loginButton.click(); else alert('Inicia sesión para consultar tus cursos.');
      return;
    }
    summary.textContent = 'Error al cargar cursos';
    body.innerHTML = `<div class="cpc-courses-error"><strong>No fue posible cargar tus cursos.</strong><p>${escapeHtml(error?.message || 'Error de conexión con CPC.')}</p></div>`;
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a.module-card[href*="/mis-cursos"]');
  if (!link) return;
  event.preventDefault();
  openMyCourses();
});

const versionObserver = new MutationObserver(() => {
  const version = document.querySelector('.version');
  if (!version) return;
  version.textContent = 'v0.4.1 | 2026';
  versionObserver.disconnect();
});
versionObserver.observe(document.documentElement, { childList: true, subtree: true });
