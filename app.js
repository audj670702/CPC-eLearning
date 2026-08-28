import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';

const app = document.getElementById('app');
if (!app) throw new Error('No se encontró #app');

const URLS = {
  misCursos: 'https://www.scad.mx/members-area/gestor-isp3068/challenges',
  catalogoCursos: 'https://www.scad.mx/e-learning',
  gymEntrenamiento: 'https://gym.scad.mx/',
  monitorTv: 'https://qrotv.scad.mx/?monitor=1'
};

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

  const memberTokens = await wixClient.auth.getMemberTokens(
    returned.code,
    returned.state,
    stored
  );

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

  if (!response.ok) {
    throw new Error(`No fue posible leer el miembro Wix (${response.status}).`);
  }

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

  const avatar =
    profile.photo?.url ||
    profile.photo?.image?.url ||
    profile.image?.url ||
    '';

  return {
    id: member.id,
    name,
    email: member.loginEmail || '',
    avatar
  };
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
            <iframe
              src="${URLS.monitorTv}"
              title="CPC TV"
              loading="eager"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
            ></iframe>
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

          <a class="module-card accent-navy" href="${URLS.misCursos}">
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

          <a class="module-card accent-orange" href="${URLS.gymEntrenamiento}">
            <span class="module-icon">＋</span>
            <span class="module-copy"><strong>GYM ENTRENAMIENTO</strong><small>Acceso a entrenamiento</small></span>
            <span class="arrow">›</span>
          </a>
        </section>
      </main>

      <footer class="app-footer">
        <div class="powered-by"><span>Powered by</span><img src="assets/logo_scad_hub.png" alt="SCaD HUB"></div>
        <span class="version">v0.2.2 | 2026</span>
      </footer>
    </div>

    <div class="tv-modal" id="tvModal" hidden>
      <button class="tv-modal-close" type="button" aria-label="Cerrar">×</button>
      <div class="tv-modal-player">
        <iframe src="${URLS.monitorTv}" title="CPC TV ampliado" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
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

  memberTrigger?.addEventListener('click', () => {
    const open = memberTrigger.getAttribute('aria-expanded') === 'true';
    memberTrigger.setAttribute('aria-expanded', String(!open));
    memberMenu.hidden = open;
  });

  sessionBtn?.addEventListener('click', async () => {
    try {
      sessionBtn.disabled = true;
      sessionBtn.textContent = 'Conectando…';

      const oauthData = wixClient.auth.generateOAuthData(
        WIX.redirectUri,
        window.location.href.split('#')[0]
      );

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
