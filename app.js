(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;

  const URLS = {
    misCursos: 'https://www.scad.mx/members-area/gestor-isp3068/challenges',
    catalogoCursos: 'https://www.scad.mx/e-learning',
    gymEntrenamiento: 'https://gym.scad.mx/',
    monitorTv: 'https://qrotv.scad.mx/?monitor=1'
  };

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img src="assets/icon-192.png" alt="CPC">
          <strong>CPC e-Learning</strong>
        </div>
        <div class="top-actions">
          <button class="install-btn" type="button" disabled>Instalar app</button>
          <button class="session-btn" type="button">Iniciar sesión</button>
        </div>
      </header>

      <main class="home-cpc">
        <section class="identity-card" aria-label="Identidad de usuario">
          <div class="avatar-placeholder" aria-hidden="true">●</div>
          <div class="identity-copy">
            <strong>Invitado</strong>
            <span>Inicia sesión para acceder a tu cuenta</span>
          </div>
          <button class="identity-login" type="button" aria-label="Iniciar sesión">›</button>
        </section>

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
        <span class="version">v0.2 | 2026</span>
      </footer>
    </div>

    <div class="tv-modal" id="tvModal" hidden>
      <button class="tv-modal-close" type="button" aria-label="Cerrar">×</button>
      <div class="tv-modal-player">
        <iframe src="${URLS.monitorTv}" title="CPC TV ampliado" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
      </div>
    </div>
  `;

  const tvModal = document.getElementById('tvModal');
  const expandTv = app.querySelector('.expand-tv');
  const closeTv = app.querySelector('.tv-modal-close');

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
})();
