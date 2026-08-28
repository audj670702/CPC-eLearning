(() => {
  'use strict';

  const app = document.getElementById('app');

  if (!app) return;

  const URLS = {
    misCursos: 'https://www.scad.mx/members-area/gestor-isp3068/challenges'
  };

  app.innerHTML = `
    <h1>CPC e-Learning</h1>
    <nav aria-label="Módulos CPC e-Learning">
      <a href="${URLS.misCursos}">Mis Cursos</a>
    </nav>
  `;
})();
