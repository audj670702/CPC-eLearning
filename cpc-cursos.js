const CPC_DATA = {
  tokenStorageKey: 'cpc_wix_member_tokens',
  queryUrl: 'https://www.wixapis.com/wix-data/v2/items/query',
  memberUrl: 'https://www.wixapis.com/members/v1/members/my?fieldSet=FULL',
  collections: {
    usuarios: 'CPC_Usuario',
    inscripciones: 'CPC_Inscripciones',
    cursos: 'CPC_Cursos'
  }
};

function readAccessToken() {
  try {
    const stored = JSON.parse(localStorage.getItem(CPC_DATA.tokenStorageKey) || 'null');
    return stored?.accessToken?.value || '';
  } catch {
    return '';
  }
}

async function wixFetch(url, options = {}) {
  const accessToken = readAccessToken();
  if (!accessToken) {
    const error = new Error('AUTH_REQUIRED');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 401 || response.status === 403) {
    const error = new Error('AUTH_REQUIRED');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(`Wix API ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return response.json();
}

async function queryCollection(dataCollectionId, query = {}) {
  const payload = {
    dataCollectionId,
    query: {
      paging: { limit: 100 },
      ...query
    }
  };

  const result = await wixFetch(CPC_DATA.queryUrl, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return result.dataItems || [];
}

async function getCurrentMemberId() {
  const result = await wixFetch(CPC_DATA.memberUrl);
  return result.member?.id || '';
}

function getData(item) {
  return item?.data || {};
}

function referenceId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || value.id || value.value || '';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeCourseUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.url || value.href || '';
}

async function loadMyCourses() {
  const memberId = await getCurrentMemberId();
  if (!memberId) throw new Error('No fue posible identificar al miembro Wix.');

  const usuarios = await queryCollection(CPC_DATA.collections.usuarios, {
    filter: { memberId, activo: true }
  });

  const usuarioItem = usuarios[0];
  if (!usuarioItem) {
    return {
      memberId,
      usuario: null,
      inscripciones: [],
      cursos: [],
      state: 'USER_NOT_REGISTERED'
    };
  }

  const usuarioData = getData(usuarioItem);
  const usuarioId = usuarioItem.id || usuarioItem._id || usuarioData._id || '';

  const inscripciones = await queryCollection(CPC_DATA.collections.inscripciones, {
    filter: { usuario: usuarioId, activo: true }
  });

  if (!inscripciones.length) {
    return {
      memberId,
      usuario: usuarioData,
      inscripciones: [],
      cursos: [],
      state: 'NO_ENROLLMENTS'
    };
  }

  const cursos = await queryCollection(CPC_DATA.collections.cursos, {
    filter: { activo: true }
  });

  const courseMap = new Map(
    cursos.map((item) => {
      const data = getData(item);
      const id = item.id || item._id || data._id || '';
      return [id, { id, ...data }];
    })
  );

  const enriched = inscripciones.map((item) => {
    const data = getData(item);
    const courseId = referenceId(data.curso);
    return {
      id: item.id || item._id || data._id || '',
      ...data,
      courseId,
      cursoDetalle: courseMap.get(courseId) || null
    };
  });

  return {
    memberId,
    usuario: usuarioData,
    inscripciones: enriched,
    cursos: enriched.map((item) => item.cursoDetalle).filter(Boolean),
    state: 'OK'
  };
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
        <div>
          <strong id="cpcCoursesTitle">Mis cursos</strong>
          <small>Inscripciones CPC</small>
        </div>
        <button class="cpc-courses-close" type="button" aria-label="Cerrar">×</button>
      </header>
      <div class="cpc-courses-body" data-cpc-courses-body></div>
    </section>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  };

  modal.querySelector('.cpc-courses-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  return modal;
}

function renderCourseRows(result) {
  if (result.state === 'USER_NOT_REGISTERED') {
    return `
      <div class="cpc-courses-empty">
        <strong>Tu cuenta Wix está conectada.</strong>
        <p>Aún no existe un registro vinculado a este miembro en CPC.</p>
      </div>`;
  }

  if (result.state === 'NO_ENROLLMENTS') {
    return `
      <div class="cpc-courses-empty">
        <strong>No tienes cursos asignados.</strong>
        <p>Cuando exista una inscripción activa aparecerá aquí automáticamente.</p>
      </div>`;
  }

  const rows = result.inscripciones.map((inscripcion) => {
    const curso = inscripcion.cursoDetalle;
    if (!curso) return '';

    const start = formatDate(curso.fechaInicio);
    const end = formatDate(curso.fechaFin);
    const dateText = start && end ? `${start} — ${end}` : start || end || '';
    const url = normalizeCourseUrl(curso.urlCurso);
    const status = inscripcion.estatus || curso.estatus || 'Inscrito';

    return `
      <article class="cpc-course-row">
        <div class="cpc-course-main">
          <span class="cpc-course-status">${escapeHtml(status)}</span>
          <strong>${escapeHtml(curso.nombreCurso || curso.title || curso.codigoCurso || 'Curso CPC')}</strong>
          ${curso.descripcionCorta ? `<p>${escapeHtml(curso.descripcionCorta)}</p>` : ''}
          ${dateText ? `<small>${escapeHtml(dateText)}</small>` : ''}
        </div>
        ${url ? `<a class="cpc-course-open" href="${escapeHtml(url)}">Abrir curso</a>` : '<span class="cpc-course-no-link">Sin enlace disponible</span>'}
      </article>`;
  }).filter(Boolean).join('');

  if (rows) return rows;

  return `
    <div class="cpc-courses-empty">
      <strong>Tienes inscripciones activas, pero no fue posible vincular sus cursos.</strong>
      <p>Revisa las referencias de CPC_Inscripciones.curso.</p>
    </div>`;
}

async function openMyCourses() {
  const modal = ensureCoursesModal();
  const body = modal.querySelector('[data-cpc-courses-body]');

  modal.hidden = false;
  document.body.classList.add('modal-open');
  body.innerHTML = '<div class="cpc-courses-loading">Cargando cursos…</div>';

  try {
    const result = await loadMyCourses();
    body.innerHTML = renderCourseRows(result);
  } catch (error) {
    console.error('CPC cursos:', error);

    if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') {
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      const loginButton = document.querySelector('.session-btn');
      if (loginButton) {
        loginButton.click();
      } else {
        alert('Inicia sesión para consultar tus cursos.');
      }
      return;
    }

    body.innerHTML = `
      <div class="cpc-courses-error">
        <strong>No fue posible cargar tus cursos.</strong>
        <p>${escapeHtml(error?.message || 'Error de conexión con CPC.')}</p>
      </div>`;
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a.module-card[href*="/mis-cursos"]');
  if (!link) return;
  event.preventDefault();
  openMyCourses();
});

const versionObserver = new MutationObserver(() => {
  const version = document.querySelector('.version');
  if (!version) return;
  version.textContent = 'v0.3.0 | 2026';
  versionObserver.disconnect();
});

versionObserver.observe(document.documentElement, { childList: true, subtree: true });
