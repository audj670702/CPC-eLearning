// cpc-mi-personal.js · v0.2.0 · "Mi personal": consulta de solo lectura para el enlace de un cliente.
// Aparece sólo si cpcPwaContext devuelve miPersonal = true.
// Mismas tres vistas que el Panel CPC: Inscripciones, Asistencia y Evaluaciones,
// con búsqueda, filtros, orden por columna y exportación a Excel y PDF.

const CPC_MI_PERSONAL_URL = 'https://www.scad.mx/_functions/cpcMiPersonal';
const MP_XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const MP_JSPDF_SRC = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const MP_AUTOTABLE_SRC = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';

const MP_TABS = {
  inscripciones: {
    label: 'Inscripciones',
    cols: [['codigo', 'Código'], ['nombre', 'Nombre'], ['email', 'Email'], ['curso', 'Curso'], ['cursoCodigo', 'Código curso'], ['reportes', 'En reportes']]
  },
  asistencia: {
    label: 'Asistencia',
    cols: [['clase', 'Clase'], ['curso', 'Curso'], ['codigo', 'Código'], ['nombre', 'Nombre'], ['estatus', 'Asistencia'], ['justificada', 'Justificada']],
    estados: [['', 'Todas'], ['Asistencia', 'Asistencia'], ['Inasistencia', 'Inasistencia'], ['Sin registrar', 'Sin registrar']]
  },
  evaluaciones: {
    label: 'Evaluaciones',
    cols: [['codigo', 'Código'], ['nombre', 'Nombre'], ['curso', 'Curso'], ['tipo', 'Tipo'], ['tema', 'Tema'], ['calificacion', 'Calificación'], ['resultado', 'Resultado'], ['intentos', 'Intentos'], ['fecha', 'Fecha']],
    estados: [['', 'Todos'], ['Aprobado', 'Aprobado'], ['No aprobado', 'No aprobado']]
  }
};

const mpState = { data: null, tab: 'inscripciones', q: '', curso: '', estado: '', sort: { key: '', dir: 1 } };
let mpLibsPromise = null;

function mpEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function mpFecha(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

function mpLoadLibs() {
  if (!mpLibsPromise) {
    mpLibsPromise = (async () => {
      if (!window.XLSX) await mpLoadScript(MP_XLSX_SRC);
      if (!(window.jspdf && window.jspdf.jsPDF)) await mpLoadScript(MP_JSPDF_SRC);
      if (!(window.jspdf && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await mpLoadScript(MP_AUTOTABLE_SRC);
    })().catch(error => { mpLibsPromise = null; throw error; });
  }
  return mpLibsPromise;
}

function mpStyles() {
  if (document.getElementById('miPersonalStyles')) return;
  const st = document.createElement('style');
  st.id = 'miPersonalStyles';
  st.textContent = `
    .mp-modal{width:min(1120px,100%);display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 36px)}
    .mp-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .mp-head strong{font-size:1.05rem;color:#12335c}
    .mi-personal-close{border:0;background:transparent;font-size:1.5rem;line-height:1;cursor:pointer;color:#475569;padding:0 4px}
    .mp-cliente{font-size:.85rem;color:#64748b}
    .mp-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .mp-tab{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 12px;font-size:.85rem;cursor:pointer;color:#334155}
    .mp-tab.active{background:#24539a;border-color:#24539a;color:#fff}
    .mp-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .mp-toolbar input,.mp-toolbar select{padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:.85rem;background:#fff}
    .mp-toolbar input[type=search]{min-width:200px;flex:1}
    .mp-spacer{flex:1}
    .mp-btn{padding:6px 12px;border:1px solid #24539a;background:#24539a;color:#fff;border-radius:8px;font-size:.85rem;cursor:pointer}
    .mp-btn:disabled{opacity:.5;cursor:default}
    .mp-count{font-size:.8rem;color:#64748b}
    .mp-body{overflow:auto;border:1px solid #e2e8f0;border-radius:8px;min-height:120px;max-height:60vh}
    .mp-table{width:100%;border-collapse:collapse;font-size:.83rem}
    .mp-table th{position:sticky;top:0;background:#f1f5f9;text-align:left;padding:7px 8px;border-bottom:1px solid #cbd5e1;cursor:pointer;white-space:nowrap;color:#1e293b}
    .mp-table td{padding:6px 8px;border-bottom:1px solid #eef2f6;vertical-align:top;color:#0f172a}
    .mp-table tr:nth-child(even) td{background:#fafcff}
    .mp-empty{padding:18px;color:#64748b;font-size:.9rem}
    .mp-msg{padding:18px;color:#b91c1c;font-size:.9rem}
  `;
  document.head.appendChild(st);
}

function miPersonalModal() {
  let modal = document.getElementById('miPersonalModal');
  if (modal) return modal;
  mpStyles();
  modal = document.createElement('div');
  modal.id = 'miPersonalModal';
  modal.className = 'profile-backdrop';
  modal.hidden = true;
  modal.innerHTML = '<section class="profile-modal mp-modal" role="dialog" aria-modal="true" aria-labelledby="miPersonalTitle">'
    + '<header class="mp-head"><strong id="miPersonalTitle">Mi personal</strong><button type="button" class="mi-personal-close" aria-label="Cerrar">×</button></header>'
    + '<div class="mp-cliente" id="miPersonalCliente"></div>'
    + '<nav class="mp-tabs" id="miPersonalTabs"></nav>'
    + '<div class="mp-toolbar">'
    + '<input type="search" id="miPersonalBuscar" placeholder="Buscar por nombre, código o curso">'
    + '<select id="miPersonalCurso" aria-label="Curso"></select>'
    + '<select id="miPersonalEstado" aria-label="Estado"></select>'
    + '<span class="mp-spacer"></span>'
    + '<button type="button" class="mp-btn" id="miPersonalXlsx">Excel</button>'
    + '<button type="button" class="mp-btn" id="miPersonalPdf">PDF</button>'
    + '</div>'
    + '<div class="mp-count" id="miPersonalCuenta"></div>'
    + '<div class="mp-body" id="miPersonalBody"></div>'
    + '</section>';
  document.body.appendChild(modal);
  modal.querySelector('.mi-personal-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
  document.getElementById('miPersonalBuscar').addEventListener('input', e => { mpState.q = e.target.value; mpRender(); });
  document.getElementById('miPersonalCurso').addEventListener('change', e => { mpState.curso = e.target.value; mpRender(); });
  document.getElementById('miPersonalEstado').addEventListener('change', e => { mpState.estado = e.target.value; mpRender(); });
  document.getElementById('miPersonalXlsx').addEventListener('click', () => mpExport('xlsx'));
  document.getElementById('miPersonalPdf').addEventListener('click', () => mpExport('pdf'));
  return modal;
}

// Convierte los datos del servidor en filas planas por vista.
function mpFilas(tab, data) {
  const cursoNombre = new Map((data.cursos || []).map(c => [c.id, c.nombre]));
  if (tab === 'inscripciones') {
    const porUsuario = new Map();
    for (const i of data.inscripciones || []) {
      if (!porUsuario.has(i.usuarioId)) porUsuario.set(i.usuarioId, []);
      porUsuario.get(i.usuarioId).push(i);
    }
    const filas = [];
    for (const p of data.personal || []) {
      const lista = porUsuario.get(p.id) || [];
      if (!lista.length) {
        filas.push({ codigo: p.codigo, nombre: p.nombre, email: p.email, curso: '—', cursoCodigo: '—', reportes: '—', _curso: '' });
      }
      for (const i of lista) {
        filas.push({ codigo: p.codigo, nombre: p.nombre, email: p.email, curso: i.curso || '—', cursoCodigo: i.cursoCodigo || '—', reportes: i.considerarReportes ? 'Sí' : 'No', _curso: i.cursoId || '' });
      }
    }
    return filas;
  }
  if (tab === 'asistencia') {
    return (data.asistencias || []).map(a => ({
      clase: a.clase || '—',
      curso: a.curso || cursoNombre.get(a.cursoId) || '—',
      codigo: a.codigo,
      nombre: a.nombre,
      estatus: a.status === 'PRESENTE' ? 'Asistencia' : a.status === 'AUSENTE' ? 'Inasistencia' : 'Sin registrar',
      justificada: a.status === 'AUSENTE' && a.justified ? 'Sí' : '—',
      _curso: a.cursoId || '',
      _estado: a.status === 'PRESENTE' ? 'Asistencia' : a.status === 'AUSENTE' ? 'Inasistencia' : 'Sin registrar'
    }));
  }
  return (data.evaluaciones || []).map(e => ({
    codigo: e.codigo,
    nombre: e.nombre,
    curso: e.curso || cursoNombre.get(e.cursoId) || '—',
    tipo: e.tipo === 'FINAL' ? 'Final' : e.tipo === 'DIAGNOSTICA' ? 'Diagnóstica' : (e.tipo || '—'),
    tema: e.temaId || '—',
    calificacion: e.calificacion != null ? e.calificacion : '—',
    resultado: e.aprobado ? 'Aprobado' : 'No aprobado',
    intentos: e.intentos,
    fecha: mpFecha(e.fecha),
    _curso: e.cursoId || '',
    _estado: e.aprobado ? 'Aprobado' : 'No aprobado'
  }));
}

function mpFiltradas() {
  const tab = MP_TABS[mpState.tab];
  let filas = mpFilas(mpState.tab, mpState.data);
  const q = mpState.q.trim().toLowerCase();
  if (q) filas = filas.filter(f => tab.cols.some(([k]) => String(f[k] ?? '').toLowerCase().includes(q)));
  if (mpState.curso) filas = filas.filter(f => f._curso === mpState.curso);
  if (mpState.estado && tab.estados) filas = filas.filter(f => f._estado === mpState.estado);
  if (mpState.sort.key) {
    const k = mpState.sort.key, dir = mpState.sort.dir;
    filas = [...filas].sort((a, b) => String(a[k] ?? '').localeCompare(String(b[k] ?? ''), 'es', { numeric: true }) * dir);
  }
  return filas;
}

function mpRender() {
  const body = document.getElementById('miPersonalBody');
  const tabs = document.getElementById('miPersonalTabs');
  const tab = MP_TABS[mpState.tab];
  tabs.innerHTML = Object.keys(MP_TABS).map(k => '<button type="button" class="mp-tab' + (k === mpState.tab ? ' active' : '') + '" data-tab="' + k + '">' + MP_TABS[k].label + '</button>').join('');
  tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    mpState.tab = b.dataset.tab; mpState.estado = ''; mpState.sort = { key: '', dir: 1 }; mpRender();
  }));

  const cursoSel = document.getElementById('miPersonalCurso');
  const cursos = (mpState.data.cursos || []);
  cursoSel.innerHTML = '<option value="">Todos los cursos</option>' + cursos.map(c => '<option value="' + mpEscape(c.id) + '"' + (c.id === mpState.curso ? ' selected' : '') + '>' + mpEscape(c.nombre || c.codigo) + '</option>').join('');

  const estadoSel = document.getElementById('miPersonalEstado');
  estadoSel.hidden = !tab.estados;
  if (tab.estados) estadoSel.innerHTML = tab.estados.map(([v, t]) => '<option value="' + mpEscape(v) + '"' + (v === mpState.estado ? ' selected' : '') + '>' + mpEscape(t) + '</option>').join('');

  const filas = mpFiltradas();
  document.getElementById('miPersonalCuenta').textContent = filas.length + ' registro' + (filas.length === 1 ? '' : 's');
  document.getElementById('miPersonalXlsx').disabled = !filas.length;
  document.getElementById('miPersonalPdf').disabled = !filas.length;

  if (!filas.length) {
    body.innerHTML = '<div class="mp-empty">Sin registros con estos filtros.</div>';
    return;
  }
  const th = ([k, t]) => {
    const marca = mpState.sort.key === k ? (mpState.sort.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th data-sort="' + k + '">' + mpEscape(t) + marca + '</th>';
  };
  body.innerHTML = '<table class="mp-table"><thead><tr>' + tab.cols.map(th).join('') + '</tr></thead><tbody>'
    + filas.map(f => '<tr>' + tab.cols.map(([k]) => '<td>' + mpEscape(f[k]) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table>';
  body.querySelectorAll('th[data-sort]').forEach(h => h.addEventListener('click', () => {
    const k = h.dataset.sort;
    mpState.sort = mpState.sort.key === k ? { key: k, dir: -mpState.sort.dir } : { key: k, dir: 1 };
    mpRender();
  }));
}

async function mpExport(tipo) {
  const tab = MP_TABS[mpState.tab];
  const filas = mpFiltradas();
  if (!filas.length) return;
  const encabezados = tab.cols.map(([, t]) => t);
  const cuerpo = filas.map(f => tab.cols.map(([k]) => String(f[k] ?? '')));
  const nombre = 'Mi_personal_' + mpState.tab + '_' + new Date().toISOString().slice(0, 10);
  try {
    await mpLoadLibs();
    if (tipo === 'xlsx') {
      const libro = window.XLSX.utils.book_new();
      const hoja = window.XLSX.utils.aoa_to_sheet([encabezados, ...cuerpo]);
      window.XLSX.utils.book_append_sheet(libro, hoja, tab.label.slice(0, 31));
      window.XLSX.writeFile(libro, nombre + '.xlsx');
    } else {
      const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      doc.setFontSize(12);
      doc.text('Mi personal · ' + tab.label + ' · ' + (mpState.data.cliente || ''), 36, 40);
      doc.autoTable({ startY: 56, head: [encabezados], body: cuerpo, styles: { fontSize: 8 }, headStyles: { fillColor: [36, 83, 154] } });
      doc.save(nombre + '.pdf');
    }
  } catch (error) {
    console.error('Mi personal · exportar:', error);
    alert('No se pudo generar el archivo: ' + error.message);
  }
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
      modal.hidden = false;
      document.getElementById('miPersonalBody').innerHTML = '<div class="mp-empty">Consultando…</div>';
      try {
        mpState.data = await fetchMiPersonal(getToken);
        mpState.tab = 'inscripciones';
        mpState.q = ''; mpState.curso = ''; mpState.estado = ''; mpState.sort = { key: '', dir: 1 };
        document.getElementById('miPersonalBuscar').value = '';
        document.getElementById('miPersonalCliente').textContent = mpState.data.cliente ? 'Cliente: ' + mpState.data.cliente : '';
        mpRender();
      } catch (error) {
        console.error('Mi personal:', error);
        document.getElementById('miPersonalBody').innerHTML = '<div class="mp-msg">' + mpEscape(error.message) + '</div>';
      }
    });
  }).catch(error => console.error('Mi personal · contexto:', error));
}
