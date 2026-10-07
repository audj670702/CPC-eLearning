/* =====================================================
 * cpc-constancias.js · v0.1.0
 * CPC e-Learning · MIS CONSTANCIAS (opción del menú)
 * =====================================================
 *
 * Opción "Mis constancias" del menú de la cuenta. Lista las constancias CPC
 * vigentes del alumno y genera el PDF en el dispositivo con el mismo
 * generador del Panel CPC (cpc-constancia-pdf.js), así el documento es
 * idéntico.
 *
 * Backend: https://www.scad.mx/_functions/cpcPwaConstancia (X-CPC-Session).
 *   - sin parámetros       → lista de constancias vigentes del alumno
 *   - ?inscripcion=<id>    → datos de la constancia para el PDF
 *
 * jsPDF y el generador se cargan sólo al descargar (no afectan el arranque).
 * ===================================================== */
(() => {
  'use strict';

  const API_URL = 'https://www.scad.mx/_functions/cpcPwaConstancia';
  const TOKENS_KEY = 'cpc_wix_member_tokens';
  const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  const GENERADOR_URL = './cpc-constancia-pdf.js?v=0.2.1';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  function token() {
    try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || 'null')?.accessToken?.value || ''; }
    catch { return ''; }
  }

  function fecha(value) {
    if (!value) return '';
    const d = new Date(value && value.$date ? value.$date : value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function api(query = '') {
    const t = token();
    if (!t) throw Object.assign(new Error('Inicia sesión para consultar tus constancias.'), { code: 'AUTH_REQUIRED' });
    const res = await fetch(`${API_URL}${query}${query ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'X-CPC-Session': t }
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) {
      throw Object.assign(new Error('Tu sesión expiró. Cierra y vuelve a abrir la app para continuar.'), { code: 'AUTH_REQUIRED' });
    }
    if (!res.ok || body.ok === false) throw new Error(body.mensaje || 'No fue posible consultar tus constancias.');
    return body;
  }

  function cargarScript(src, listo) {
    if (listo()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => (listo() ? resolve() : reject(new Error('No se cargó ' + src)));
      s.onerror = () => reject(new Error('No fue posible cargar el generador de constancias. Revisa tu conexión.'));
      document.head.appendChild(s);
    });
  }

  async function cargarGenerador() {
    await cargarScript(JSPDF_URL, () => Boolean(window.jspdf?.jsPDF));
    await cargarScript(GENERADOR_URL, () => Boolean(window.CPCConstanciaPDF));
  }

  // ---------- estilos ----------
  function estilos() {
    if (document.getElementById('cpcConstanciasCss')) return;
    const css = document.createElement('style');
    css.id = 'cpcConstanciasCss';
    css.textContent = `
.cpc-cert-backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:14px;background:rgba(15,32,56,.5)}
.cpc-cert-backdrop[hidden]{display:none}
.cpc-cert-modal{width:min(520px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(15,32,56,.28);padding:16px}
.cpc-cert-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.cpc-cert-head strong{display:block;font-size:1rem;color:#12335c}
.cpc-cert-head small{display:block;font-size:.7rem;color:#718096;margin-top:2px}
.cpc-cert-close{width:34px;height:34px;border:1px solid #d9e2ed;border-radius:50%;background:#fff;color:#12335c;font-size:1.1rem;cursor:pointer}
.cpc-cert-list{display:grid;gap:10px}
.cpc-cert-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-left:4px solid #b08d57;border-radius:12px;background:#fbfcfe}
.cpc-cert-item strong{display:block;font-size:.8rem;color:#12335c;line-height:1.3}
.cpc-cert-item span{display:block;font-size:.68rem;color:#718096;margin-top:3px}
.cpc-cert-item .folio{font-weight:800;color:#174b82;letter-spacing:.02em}
.cpc-cert-btn{min-height:36px;padding:0 13px;border:0;border-radius:9px;background:#174b82;color:#fff;font-size:.72rem;font-weight:800;cursor:pointer;white-space:nowrap}
.cpc-cert-btn:disabled{opacity:.6;cursor:wait}
.cpc-cert-empty,.cpc-cert-msg{padding:16px 12px;text-align:center;font-size:.76rem;color:#52647a;line-height:1.45}
.cpc-cert-msg.error{color:#9b1c1c}
.cpc-cert-note{margin-top:10px;font-size:.66rem;color:#8a98a8;text-align:center}`;
    document.head.appendChild(css);
  }

  // ---------- modal ----------
  function modal() {
    let el = document.getElementById('cpcCertModal');
    if (el) return el;
    estilos();
    el = document.createElement('div');
    el.id = 'cpcCertModal';
    el.className = 'cpc-cert-backdrop';
    el.hidden = true;
    el.innerHTML = `<section class="cpc-cert-modal" role="dialog" aria-modal="true" aria-labelledby="cpcCertTitle">
      <div class="cpc-cert-head"><div><strong id="cpcCertTitle">Mis constancias</strong><small>Constancias CPC emitidas a tu nombre</small></div>
      <button class="cpc-cert-close" type="button" aria-label="Cerrar">×</button></div>
      <div data-cert-body></div>
      <p class="cpc-cert-note">Cada constancia incluye un código QR para verificar su autenticidad.</p>
    </section>`;
    document.body.appendChild(el);
    const cerrar = () => { el.hidden = true; document.body.classList.remove('modal-open'); };
    el.querySelector('.cpc-cert-close').addEventListener('click', cerrar);
    el.addEventListener('click', (e) => { if (e.target === el) cerrar(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cert-id]');
      if (b) descargar(b);
    });
    return el;
  }

  function pintarLista(lista) {
    const body = modal().querySelector('[data-cert-body]');
    if (!lista.length) {
      body.innerHTML = '<div class="cpc-cert-empty"><strong>Aún no tienes constancias emitidas.</strong><br>Cuando concluyas un curso y se libere tu constancia, aparecerá aquí para descargarla.</div>';
      return;
    }
    body.innerHTML = `<div class="cpc-cert-list">${lista.map((c) => `
      <article class="cpc-cert-item">
        <div><strong>${esc(c.cursoNombre || 'Curso CPC')}</strong>
          <span>${esc(c.cursoCodigo || '')}${c.horas ? ` · ${esc(c.horas)} horas` : ''}</span>
          <span>Constancia No. <b class="folio">${esc(c.folio)}</b> · ${esc(fecha(c.fechaExpedicion))}</span></div>
        <button class="cpc-cert-btn" type="button" data-cert-id="${esc(c.inscripcionId)}" data-cert-folio="${esc(c.folio)}">Descargar</button>
      </article>`).join('')}</div><div data-cert-msg></div>`;
  }

  function mensaje(texto, error = false) {
    const box = modal().querySelector('[data-cert-msg]');
    if (box) box.innerHTML = texto ? `<div class="cpc-cert-msg${error ? ' error' : ''}">${esc(texto)}</div>` : '';
  }

  async function abrir() {
    const el = modal();
    document.querySelector('.member-menu')?.setAttribute('hidden', '');
    document.querySelector('.member-trigger')?.setAttribute('aria-expanded', 'false');
    el.hidden = false;
    document.body.classList.add('modal-open');
    const body = el.querySelector('[data-cert-body]');
    body.innerHTML = '<div class="cpc-cert-msg">Consultando tus constancias…</div>';
    try {
      const r = await api();
      pintarLista(Array.isArray(r.constancias) ? r.constancias : []);
    } catch (error) {
      body.innerHTML = `<div class="cpc-cert-msg error">${esc(error.message)}</div>`;
    }
  }

  async function entregarPdf(doc, folio) {
    const nombre = `Constancia_${folio}.pdf`;
    const blob = doc.output('blob');
    const archivo = typeof File === 'function' ? new File([blob], nombre, { type: 'application/pdf' }) : null;
    const movil = window.matchMedia?.('(pointer: coarse)').matches;
    // En teléfono se usa el menú de compartir (Guardar en Archivos, WhatsApp, correo…).
    if (movil && archivo && navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: `Constancia ${folio}` });
        return 'compartida';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelada';
      }
    }
    doc.save(nombre);
    return 'descargada';
  }

  async function descargar(boton) {
    const id = boton.dataset.certId;
    const folio = boton.dataset.certFolio;
    const texto = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Generando…';
    mensaje('');
    try {
      const [r] = await Promise.all([api(`?inscripcion=${encodeURIComponent(id)}`), cargarGenerador()]);
      const doc = await window.CPCConstanciaPDF.generar({ constancia: r.documento });
      const resultado = await entregarPdf(doc, r.documento.folio || folio);
      if (resultado !== 'cancelada') mensaje(`Constancia ${r.documento.folio || folio} lista.`);
    } catch (error) {
      console.error('CPC constancias:', error);
      mensaje(error.message || 'No fue posible generar la constancia.', true);
    } finally {
      boton.disabled = false;
      boton.textContent = texto;
    }
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.constancias-open-btn')) return;
    event.preventDefault();
    abrir();
  });
})();
