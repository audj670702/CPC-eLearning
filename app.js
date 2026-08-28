(() => {
  'use strict';

  const app = document.getElementById('app');

  if (!app) return;

  const URLS = {
    misCursos: 'https://www.scad.mx/members-area/gestor-isp3068/challenges',
    catalogoCursos: 'https://www.scad.mx/e-learning',
    gymEntrenamiento: 'https://gym.scad.mx/'
  };

  app.innerHTML = `
    <h1>CPC e-Learning</h1>
    <nav aria-label="Módulos CPC e-Learning">
      <a href="${URLS.misCursos}">Mis Cursos</a>
      <a href="${URLS.catalogoCursos}">Catálogo de cursos</a>
      <a href="${URLS.gymEntrenamiento}">GYM Entrenamiento</a>
    </nav>
  `;
})();
