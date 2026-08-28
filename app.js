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
          <div>
            <strong>CPC e-Learning</strong>
            <span>Centro Privado de Capacitación</span>
          </div>
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
        </section>

        <section class="tv-section" aria-label="CPC TV">
          <div class="section-heading">
            <div>
              <span class="eyebrow">EN VIVO</span>
              <h2>CPC TV</h2>
            </div>
            <span class="signal-status">TV Digital Internet</span>
          </div>
          <div class="tv-monitor-frame">
            <iframe
              src="${URLS.monitorTv}"
              title="CPC TV"
              loading="eager"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        </section>

        <section class="modules-section" aria-label="Accesos CPC e-Learning">
          <h2>Accesos</h2>
          <div class="module-grid">
            <button class="module-card pending" type="button">
              <span class="module-icon">✉</span>
              <span><strong>Mensajería</strong><small>Comunicación CPC</small></span>
            </button>

            <a class="module-card" href="${URLS.misCursos}">
              <span class="module-icon">▶</span>
              <span><strong>Mis Cursos</strong><small>Programas en curso</small></span>
            </a>

            <a class="module-card" href="${URLS.catalogoCursos}">
              <span class="module-icon">▦</span>
              <span><strong>Catálogo de cursos</strong><small>Explorar capacitación</small></span>
            </a>

            <button class="module-card pending" type="button">
              <span class="module-icon">▣</span>
              <span><strong>Calendario</strong><small>Fechas de clases</small></span>
            </button>

            <a class="module-card gym-card" href="${URLS.gymEntrenamiento}">
              <span class="module-icon">＋</span>
              <span><strong>GYM Entrenamiento</strong><small>Acceso a entrenamiento</small></span>
            </a>
          </div>
        </section>
      </main>

      <footer class="app-footer">
        <div class="powered-by">
          <span>Powered by</span>
          <img src="assets/logo_scad_hub.png" alt="SCaD HUB">
        </div>
        <span class="version">v0.1 | 2026</span>
      </footer>
    </div>
  `;
})();
