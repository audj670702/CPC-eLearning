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
    <main class="home-cpc">
      <h1>CPC e-Learning</h1>

      <section class="tv-monitor" aria-label="Monitor TV Digital Internet">
        <div class="tv-monitor-frame">
          <iframe
            src="${URLS.monitorTv}"
            title="TV Digital Internet"
            loading="eager"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>
      </section>

      <nav class="cpc-modules" aria-label="Módulos CPC e-Learning">
        <a href="${URLS.misCursos}">Mis Cursos</a>
        <a href="${URLS.catalogoCursos}">Catálogo de cursos</a>
        <a href="${URLS.gymEntrenamiento}">GYM Entrenamiento</a>
      </nav>
    </main>
  `;
})();
