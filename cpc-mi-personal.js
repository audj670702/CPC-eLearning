// cpc-mi-personal.js · v0.1.0
// "Mi personal": módulo de solo lectura para el enlace de un cliente.
// Aparece sólo si cpcPwaContext devuelve miPersonal = true.

const CPC_MI_PERSONAL_URL = 'https://www.scad.mx/_functions/cpcMiPersonal';

function miPersonalEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function fetchMiPersonal(getToken) {
  const token = await getToken();
  if (!token) throw new Error('Inicia sesión para continuar.');
  const response = await fetch(CPC_MI_PERSONAL_URL + '?t=' + Date.now(), {
    cache: 'no-store',
    headers: { 'X-CPC-Session': token }
  });
  const data = await response.json().catch(() => ({ ok: false, mensaje: 'HTTP ' + response.status }));
  if (!response.ok || !data?.ok) throw new Error(data?.mensaje || ('Mi personal ' + response.status));
  return data;
}

function miPersonalModal() {
  let modal = document.getElementById('miPersonalModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'miPersonalModal';
  modal.className = 'profile-backdrop';
  modal.hidden = true;
  modal.innerHTML = `<section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="miPersonalTitle">
    <header><strong id="miPersonalTitle">Mi personal</strong><button type="button" class="mi-personal-close" aria-label="Cerrar">×</button></header>
    <div class="mi-personal-body" id="miPersonalBody"></div>
  </section>`;
  document.body.appendChild(modal);
  modal.querySelector('.mi-personal-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
  return modal;
}

function renderMiPersonal(data) {
  const lista = Array.isArray(data.personal) ? data.personal : [];
  if (!lista.length) return '<p>Sin personal vinculado a este cliente.</p>';
  return `<p class="mi-personal-cliente">${miPersonalEscape(data.cliente || '')}</p>
    <table class="mi-personal-table"><thead><tr><th>Código</th><th>Nombre</th><th>Email</th><th>Cursos</th></tr></thead><tbody>
    ${lista.map(p => `<tr><td>${miPersonalEscape(p.codigo)}</td><td>${miPersonalEscape(p.nombre)}</td><td>${miPersonalEscape(p.email)}</td><td>${(p.cursos || []).map(c => miPersonalEscape(c.codigo || c.nombre)).join(', ')}</td></tr>`).join('')}
    </tbody></table>`;
}

// loadContext: () => Promise<contexto cpcPwaContext>; getToken: () => Promise<string>.
export function initMiPersonal({ loadContext, getToken }) {
  loadContext().then(ctx => {
    if (!ctx?.miPersonal) return;
    const section = document.querySelector('.modules-section');
    if (!section || section.querySelector('[data-mi-personal]')) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'module-card accent-navy';
    card.dataset.miPersonal = 'true';
    card.innerHTML = '<span class="module-icon">👥</span><span class="module-copy"><strong>MI PERSONAL</strong><small>Consulta de tu personal</small></span><span class="arrow">›</span>';
    section.prepend(card);
    card.addEventListener('click', async () => {
      const modal = miPersonalModal();
      const body = modal.querySelector('#miPersonalBody');
      body.textContent = 'Consultando…';
      modal.hidden = false;
      try {
        body.innerHTML = renderMiPersonal(await fetchMiPersonal(getToken));
      } catch (error) {
        body.textContent = error.message;
      }
    });
  }).catch(() => {});
}
