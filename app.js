import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';

const app = document.getElementById('app');
if (!app) throw new Error('No se encontró #app');

const URLS = {
  misCursos: 'https://www.scad.mx/mis-cursos',
  catalogoCursos: 'https://www.scad.mx/e-learning',
  gymEntrenamiento: 'https://gym.scad.mx/',
  monitorTv: 'https://qrotv.scad.mx/?monitor=1',
  certificacionInfospe: 'assets/cpc_certificacion.pdf'
};

const CONSTANCIAS = [
  {
    numero: '01',
    titulo: 'Constancia de convenio de capacitación',
    texto: 'Se entrega un convenio de capacitación por empresa participante, incluyendo identificación de la empresa, personal a capacitar, y fechas de inicio y término. Esta constancia permite la gestión de la constancia de capacitación emitida por INFOSPE para proceso de refrendo o permiso.',
    url: 'https://static.wixstatic.com/media/0492f8_4bf2740fb4904a42bb2f0398e35601e5~mv2.png'
  },
  {
    numero: '02',
    titulo: 'Constancia de personal en capacitación',
    texto: 'Se entrega al inicio de cada curso e incluye los nombres de los guardias inscritos, identificación del curso y fechas de inicio y fin. Esta constancia permite al INFOSPE dar seguimiento al compromiso del convenio.',
    url: 'https://static.wixstatic.com/media/0492f8_a6755c92d89e4016bb8965c82f12e2a5~mv2.png'
  },
  {
    numero: '03',
    titulo: 'Constancia de acreditación del curso',
    texto: 'Se entrega al concluir el curso, certificando que el guardia cumplió asistencia y evaluación. Es emitida por INFOSPE con gestión de CPC y entregada a la empresa contratante.',
    url: 'https://static.wixstatic.com/media/0492f8_b4d47f78a89f4aa89aa4a7fcc91db3ca~mv2.png'
  },
  {
    numero: '04',
    titulo: 'Constancia de finalización del programa digital',
    texto: 'El participante accede al programa digital en la plataforma SCaD, con material didáctico y recursos interactivos. Al concluir satisfactoriamente las actividades, se genera automáticamente su constancia de finalización y la recibe en su correo electrónico.',
    url: 'https://static.wixstatic.com/media/0492f8_70e0da893a28473d95c91adfad88a645~mv2.png'
  }
];

const WIX = {
  clientId: '76bd3893-6f4b-4da9-bdc8-9c1d22513ee6',
  redirectUri: 'https://cpc.scad.mx/'
};

const STORAGE = {
  oauth: 'cpc_wix_oauth_data',
  tokens: 'cpc_wix_member_tokens'
};

function readStoredTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.tokens) || 'null');
  } catch {
    localStorage.removeItem(STORAGE.tokens);
    return null;
  }
}

function saveTokens(tokens) {
  localStorage.setItem(STORAGE.tokens, JSON.stringify(tokens));
}

function clearSessionStorage() {
  localStorage.removeItem(STORAGE.oauth);
  localStorage.removeItem(STORAGE.tokens);
}

let tokens = readStoredTokens();
const wixClient = createClient({
  auth: OAuthStrategy({
    clientId: WIX.clientId,
    ...(tokens ? { tokens } : {})
  })
});

function tokenExpired(accessToken) {
  const expiresAt = Number(accessToken?.expiresAt || 0);
  if (!expiresAt) return false;
  const expiresMs = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return Date.now() >= expiresMs - 30000;
}

async function ensureFreshTokens() {
  if (!tokens?.refreshToken?.value) return tokens;
  if (!tokenExpired(tokens.accessToken)) return tokens;

  const renewed = await wixClient.auth.renewToken(tokens.refreshToken);
  wixClient.auth.setTokens(renewed);
  tokens = renewed;
  saveTokens(renewed);
  return renewed;
}

async function finishOAuthCallbackIfNeeded() {
  if (!window.location.hash || (!window.location.hash.includes('code=') && !window.location.hash.includes('error='))) {
    return;
  }

  const stored = JSON.parse(localStorage.getItem(STORAGE.oauth) || 'null');
  const returned = wixClient.auth.parseFromUrl();

  if (returned.error) {
    clearSessionStorage();
    history.replaceState({}, document.title, window.location.pathname + window.location.search);
    throw new Error(returned.errorDescription || returned.error);
  }

  if (!stored) {
    history.replaceState({}, document.title, window.location.pathname + window.location.search);
    throw new Error('No se encontró el estado OAuth guardado.');
  }

  const memberTokens = await wixClient.auth.getMemberTokens(returned.code, returned.state, stored);
  wixClient.auth.setTokens(memberTokens);
  tokens = memberTokens;
  saveTokens(memberTokens);
  localStorage.removeItem(STORAGE.oauth);
  history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

async function getCurrentMember() {
  if (!tokens?.accessToken?.value) return null;

  try {
    await ensureFreshTokens();
  } catch {
    clearSessionStorage();
    tokens = null;
    return null;
  }

  const response = await fetch('https://www.wixapis.com/members/v1/members/my?fieldSet=FULL', {
    headers: {
      Authorization: tokens.accessToken.value,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401 || response.status === 403) {
    clearSessionStorage();
    tokens = null;
    return null;
  }

  if (!response.ok) throw new Error(`No fue posible leer el miembro Wix (${response.status}).`);
  const data = await response.json();
  return data.member || null;
}

function normalizeMember(member) {
  if (!member) return null;
  const contact = member.contact || {};
  const profile = member.profile || {};
  const firstName = contact.firstName || profile.firstName || '';
  const lastName = contact.lastName || profile.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const name = fullName || profile.nickname || member.loginEmail || 'Usuario';
  const avatar = profile.photo?.url || profile.photo?.image?.url || profile.image?.url || '';

  return { id: member.id, name, email: member.loginEmail || '', avatar };
}

function constanciasHtml() {
  return CONSTANCIAS.map((item) => `
    <article class="infospe-cert-card">
      <button class="infospe-cert-header" type="button" aria-expanded="false">
        <span class="infospe-cert-number">${item.numero}</span>
        <span class="infospe-cert-title">${item.titulo}</span>
        <span class="infospe-cert-toggle">＋</span>
      </button>
      <div class="infospe-cert-body" hidden>
        <p>${item.texto}</p>
        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="infospe-view-btn">Ver constancia</a>
      </div>
    </article>
  `).join('');
}

function render(member) {
  const sessionControl = member
    ? `
      <div class="member-control">
        <button class="member-trigger" type="button" aria-expanded="false">
          ${member.avatar ? `<img src="${member.avatar}" alt="">` : '<span class="member-avatar">●</span>'}
          <span class="member-name">${member.name}</span>
          <span class="member-chevron">⌄</span>
        </button>
        <div class="member-menu" hidden>
          <span class="member-email">${member.email}</span>
          <button class="logout-btn" type="button">Cerrar sesión</button>
        </div>
      </div>`
    : '<button class="session-btn" type="button">Iniciar sesión</button>';

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img src="assets/icon-192.png" alt="CPC">
          <strong>CPC e-Learning</strong>
        </div>
        <div class="top-actions">
          <button class="install-btn" type="button" disabled>Instalar app</button>
          ${sessionControl}
        </div>
      </header>

      <main class="home-cpc">
        <section class="tv-card" aria-label="CPC TV">
          <div class="tv-preview">
            <iframe src="${URLS.monitorTv}" title="CPC TV" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
          </div>
          <div class="tv-copy">
            <span class="live-label">EN VIVO</span>
            <strong>CPC TV</strong>
            <small>TV Digital Internet</small>
          </div>
          <button class="expand-tv" type="button" aria-label="Ampliar CPC TV">⛶</button>
        </section>

        <section class="modules-section" aria-label="Accesos CPC e-Learning">
          <button class="module-card accent-blue" type="button">
            <span class="module-icon">✉</span>
            <span class="module-copy"><strong>MENSAJERÍA</strong><small>Comunicación CPC</small></span>
            <span class="arrow">›</span>
          </button>

          <a class="module-card accent-navy" href="${URLS.misCursos}?target=mis-cursos">
            <span class="module-icon">▶</span>
            <span class="module-copy"><strong>MIS CURSOS</strong><small>Programas en curso</small></span>
            <span class="arrow">›</span>
          </a>

          <a class="module-card accent-green" href="${URLS.catalogoCursos}">
            <span class="module-icon">▦</span>
            <span class="module-copy"><strong>CATÁLOGO DE CURSOS</strong><small>Explora la oferta de capacitación</small></span>
            <span class="arrow">›</span>
          </a>

          <button class="module-card accent-purple" type="button">
            <span class="module-icon">▣</span>
            <span class="module-copy"><strong>CALENDARIO</strong><small>Fechas de clases</small></span>
            <span class="arrow">›</span>
          </button>

          <button class="module-card accent-infospe infospe-module" type="button">
            <span class="module-icon module-logo"><img src="assets/logo_infospe.png" alt="INFOSPE"></span>
            <span class="module-copy"><strong>INFOSPE - SEGURIDAD PRIVADA</strong><small>Acreditación y constancias</small></span>
            <span class="arrow">›</span>
          </button>

          <a class="module-card accent-orange" href="${URLS.gymEntrenamiento}">
            <span class="module-icon">＋</span>
            <span class="module-copy"><strong>GYM ENTRENAMIENTO</strong><small>Acceso a entrenamiento</small></span>
            <span class="arrow">›</span>
          </a>
        </section>
      </main>

      <footer class="app-footer">
        <div class="powered-by"><span>Powered by</span><img src="assets/logo_scad_hub.png" alt="SCaD HUB"></div>
        <span class="version">v0.2.4 | 2026</span>
      </footer>
    </div>

    <div class="tv-modal" id="tvModal" hidden>
      <button class="tv-modal-close" type="button" aria-label="Cerrar">×</button>
      <div class="tv-modal-player">
        <iframe src="${URLS.monitorTv}" title="CPC TV ampliado" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
      </div>
    </div>

    <div class="infospe-modal" id="infospeModal" hidden>
      <div class="infospe-panel">
        <div class="infospe-panel-top">
          <div class="infospe-heading">
            <img src="assets/logo_infospe.png" alt="INFOSPE">
            <div>
              <strong>INFOSPE - Seguridad Privada</strong>
              <span>Curso Básico de Profesionalización</span>
            </div>
          </div>
          <button class="infospe-close" type="button" aria-label="Cerrar">×</button>
        </div>

        <div class="infospe-content">
          <section class="infospe-info-block">
            <p>La normatividad en el Estado de Guanajuato establece la obligación a la empresas de seguridad privada que cumplan un programa de capacitación basado en la currícula que el INFOSPE establece.</p>
            <p>Este requisito se cumple acreditando la aprobación del Curso Básico de Profesionalización en Materia de Seguridad Privada.</p>
            <p>El curso es presencial con apoyo en plataformas digitales y sesiones virtuales.</p>
            <p>El período de impartición del curso base se realiza en 12 sesiones, una por semana.</p>
            <p>De acuerdo a los requerimientos de la empresa, se puede impartir el curso en períodos convenientes para el cliente.</p>
          </section>

          <section class="infospe-accreditation">
            <div class="infospe-section-head">
              <strong>Acreditación</strong>
              <a href="${URLS.certificacionInfospe}" target="_blank" rel="noopener noreferrer">Ver documento</a>
            </div>
            <iframe src="${URLS.certificacionInfospe}#toolbar=0&navpanes=0" title="Acreditación CPC INFOSPE"></iframe>
          </section>

          <section class="infospe-constancias">
            <h3>Constancias que emitimos</h3>
            <p class="infospe-intro">Documentamos formalmente cada etapa del proceso de capacitación, brindando certeza a las empresas de seguridad privada y a su personal.</p>
            <div class="infospe-cert-list">${constanciasHtml()}</div>
          </section>
        </div>
      </div>
    </div>
  `;

  bindUI();
}

function bindUI() {
  const tvModal = document.getElementById('tvModal');
  const expandTv = app.querySelector('.expand-tv');
  const closeTv = app.querySelector('.tv-modal-close');
  const memberTrigger = app.querySelector('.member-trigger');
  const memberMenu = app.querySelector('.member-menu');
  const sessionBtn = app.querySelector('.session-btn');
  const logoutBtn = app.querySelector('.logout-btn');
  const infospeModule = app.querySelector('.infospe-module');
  const infospeModal = document.getElementById('infospeModal');
  const infospeClose = app.querySelector('.infospe-close');

  expandTv?.addEventListener('click', () => {
    tvModal.hidden = false;
    document.body.classList.add('modal-open');
  });

  closeTv?.addEventListener('click', () => {
    tvModal.hidden = true;
    document.body.classList.remove('modal-open');
  });

  tvModal?.addEventListener('click', (event) => {
    if (event.target === tvModal) {
      tvModal.hidden = true;
      document.body.classList.remove('modal-open');
    }
  });

  infospeModule?.addEventListener('click', () => {
    infospeModal.hidden = false;
    document.body.classList.add('modal-open');
  });

  infospeClose?.addEventListener('click', () => {
    infospeModal.hidden = true;
    document.body.classList.remove('modal-open');
  });

  infospeModal?.addEventListener('click', (event) => {
    if (event.target === infospeModal) {
      infospeModal.hidden = true;
      document.body.classList.remove('modal-open');
    }
  });

  app.querySelectorAll('.infospe-cert-header').forEach((header) => {
    header.addEventListener('click', () => {
      const card = header.closest('.infospe-cert-card');
      const body = card?.querySelector('.infospe-cert-body');
      const toggle = card?.querySelector('.infospe-cert-toggle');
      if (!card || !body) return;

      const open = header.getAttribute('aria-expanded') === 'true';
      app.querySelectorAll('.infospe-cert-header').forEach((otherHeader) => {
        otherHeader.setAttribute('aria-expanded', 'false');
        const otherCard = otherHeader.closest('.infospe-cert-card');
        const otherBody = otherCard?.querySelector('.infospe-cert-body');
        const otherToggle = otherCard?.querySelector('.infospe-cert-toggle');
        if (otherBody) otherBody.hidden = true;
        if (otherToggle) otherToggle.textContent = '＋';
      });

      if (!open) {
        header.setAttribute('aria-expanded', 'true');
        body.hidden = false;
        if (toggle) toggle.textContent = '−';
      }
    });
  });

  memberTrigger?.addEventListener('click', () => {
    const open = memberTrigger.getAttribute('aria-expanded') === 'true';
    memberTrigger.setAttribute('aria-expanded', String(!open));
    memberMenu.hidden = open;
  });

  sessionBtn?.addEventListener('click', async () => {
    try {
      sessionBtn.disabled = true;
      sessionBtn.textContent = 'Conectando…';
      const oauthData = wixClient.auth.generateOAuthData(WIX.redirectUri, window.location.href.split('#')[0]);
      localStorage.setItem(STORAGE.oauth, JSON.stringify(oauthData));
      const { authUrl } = await wixClient.auth.getAuthUrl(oauthData);
      window.location.href = authUrl;
    } catch (error) {
      console.error(error);
      sessionBtn.disabled = false;
      sessionBtn.textContent = 'Iniciar sesión';
      alert('No fue posible abrir el inicio de sesión de Wix.');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Cerrando…';
      const { logoutUrl } = await wixClient.auth.logout(WIX.redirectUri);
      clearSessionStorage();
      window.location.href = logoutUrl;
    } catch (error) {
      console.error(error);
      clearSessionStorage();
      window.location.href = WIX.redirectUri;
    }
  });
}

async function boot() {
  try {
    await finishOAuthCallbackIfNeeded();
    const rawMember = await getCurrentMember();
    render(normalizeMember(rawMember));
  } catch (error) {
    console.error('CPC auth:', error);
    render(null);
  }
}

boot();
