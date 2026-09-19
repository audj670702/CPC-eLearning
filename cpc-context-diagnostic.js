// CPC · Diagnóstico visible de contexto EO / CCA · v0.5.10
// Sólo lectura. No modifica autenticación, autorización ni contratos MNS.

const TOKEN_KEY = 'cpc_wix_member_tokens';
const CPC_CONTEXT_URL = 'https://www.scad.mx/_functions/cpcPwaContext';

const state = { se: 0, us: 0, eo: 0, mns: 0, eoNombre: '' };

function readTokens() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); }
  catch { return null; }
}

function ensureDiagnosticUi() {
  const topbar = document.querySelector('.topbar');
  const home = document.querySelector('.home-cpc');
  const modules = document.querySelector('.modules-section');
  if (!topbar || !home || !modules) return false;

  if (!document.getElementById('cpcContextDiagnosticStyles')) {
    const style = document.createElement('style');
    style.id = 'cpcContextDiagnosticStyles';
    style.textContent = `
      .cpc-eo-title{
        width:min(100%,760px);margin:0 auto;
        padding:8px 14px 0;
        color:#12335c;font-size:.82rem;font-weight:800;line-height:1.15;
      }
      .cpc-eo-title:empty{display:none}
      .cpc-cca{
        margin-top:5px;padding-left:2px;
        color:#a0a9b5;font-size:.52rem;font-weight:500;
        line-height:1;letter-spacing:.015em;text-align:left;
        user-select:text;
      }
      @media(max-width:560px){
        .cpc-eo-title{padding:7px 11px 0;font-size:.76rem}
        .cpc-cca{font-size:.49rem}
      }
    `;
    document.head.appendChild(style);
  }

  let eo = document.getElementById('cpcEoTitle');
  if (!eo) {
    eo = document.createElement('div');
    eo.id = 'cpcEoTitle';
    eo.className = 'cpc-eo-title';
    eo.setAttribute('aria-live', 'polite');
    topbar.insertAdjacentElement('afterend', eo);
  }

  let cca = document.getElementById('cpcCca');
  if (!cca) {
    cca = document.createElement('div');
    cca.id = 'cpcCca';
    cca.className = 'cpc-cca';
    cca.setAttribute('aria-label', 'Cadena de Código de Autenticación');
    modules.insertAdjacentElement('afterend', cca);
  }

  paint();
  return true;
}

function paint() {
  const eo = document.getElementById('cpcEoTitle');
  const cca = document.getElementById('cpcCca');
  if (eo) eo.textContent = state.eoNombre || '';
  if (cca) cca.textContent = `Se${state.se} · Us${state.us} · EO${state.eo} · MNS${state.mns}`;
}

function pick(obj, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], obj);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

async function loadContext() {
  const tokens = readTokens();
  const accessToken = tokens?.accessToken?.value || '';
  state.se = accessToken ? 1 : 0;
  paint();
  if (!accessToken) return;

  try {
    const memberRes = await fetch('https://www.wixapis.com/members/v1/members/my?fieldSet=FULL', {
      headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
      cache: 'no-store'
    });
    if (!memberRes.ok) return;

    const member = (await memberRes.json())?.member;
    const memberId = String(member?.id || '').trim();
    if (!memberId) return;
    state.se = 1;

    const res = await fetch(
      CPC_CONTEXT_URL + '?memberId=' + encodeURIComponent(memberId) + '&t=' + Date.now(),
      { cache: 'no-store' }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) { paint(); return; }

    state.us = 1;

    const eoNombre = String(pick(data, [
      'eo.nombre','eo.name','enteOperador.nombre','enteOperador.name',
      'contexto.eo.nombre','contexto.eo.name','context.eo.nombre','context.eo.name',
      'eoNombre','nombreEO'
    ]) || '').trim();

    const eoId = String(pick(data, [
      'eo._id','eo.id','eo.codigo','enteOperador._id','enteOperador.id','enteOperador.codigo',
      'contexto.eo._id','contexto.eo.id','context.eo._id','context.eo.id',
      'eoId','enteOperadorId'
    ]) || '').trim();

    state.eoNombre = eoNombre;
    state.eo = (eoNombre || eoId) ? 1 : 0;
    paint();
  } catch (error) {
    console.warn('[CPC CCA] No fue posible leer contexto CPC:', error);
    paint();
  }
}

function monitorMns() {
  const scan = () => {
    const frame = document.querySelector('#cpcMnsOverlay iframe');
    if (!frame) return;
    try {
      const text = frame.contentDocument?.body?.innerText || '';
      if (/Falta identificar el Ente Operador MNS/i.test(text) || /Inicia sesión para usar Mensajería/i.test(text)) {
        state.mns = 0;
      } else if (text.trim()) {
        // El frontend MNS recibió contexto y está operativo.
        state.mns = 1;
      }
      paint();
    } catch (_) {}
  };
  setInterval(scan, 1200);
}

const observer = new MutationObserver(() => {
  if (ensureDiagnosticUi()) observer.disconnect();
});
if (!ensureDiagnosticUi()) observer.observe(document.documentElement, { childList:true, subtree:true });

loadContext();
monitorMns();
