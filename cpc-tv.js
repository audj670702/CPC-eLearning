// CPC · Módulo TV Capacitación · v0.5.15
// Mismo modelo que NEXUS (js/tv.js): un monitor con dos canales.
//   · "digital" → TV Digital Internet (HLS motortv.scad.mx).
//   · "cpc"     → Canal CPC, configurado desde el Panel CPC. Llega en el contexto
//                 cpcPwaContext → tv { youtubeId, segundoInicio, modo, titulo }.
// El canal CPC se consulta de nuevo cada POLL_MS mientras está al aire, para que
// los cambios hechos en el Panel CPC lleguen a la app sin recargar.

const TVDI_HLS = 'https://motortv.scad.mx/hls/canal.m3u8';
const POLL_MS = 10000;
const CHANNEL_NAMES = { digital: 'TV Digital Internet', cpc: 'CPC' };
// Etiquetas cortas de los botones de canal (como en NEXUS: una sola línea).
const CHANNEL_BUTTONS = { digital: 'TV Digital', cpc: 'CPC' };

const ICON_MUTED = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>';
const ICON_SOUND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const ICON_OPTIONS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
const ICON_EXPAND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const $ = (s) => document.querySelector(s);

let hls = null;
let tvMuted = true;
let channel = 'digital';
let tvContext = null;
let videoKey = '';
let pollTimer = null;
let loadContext = null;
let hasSession = () => false;
let globalBound = false;

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Marcado del monitor. app.js lo inserta dentro de la sección TV del inicio.
export function tvMarkup() {
  return `<div class="tv-console">
    <div id="tvMonitor" class="tv-monitor" data-channel="digital">
      <video id="tvVideo" autoplay muted playsinline preload="auto" aria-label="Canal en vivo"></video>
      <div id="tvFrameHost" class="tv-frame-host" hidden></div>
      <div id="tvMessage" class="tv-message" hidden></div>
    </div>
    <div class="tv-bar">
      <span id="tvNowLabel" class="tv-now">${CHANNEL_NAMES.digital}</span>
      <button id="btnTvOptions" class="tv-options-trigger" type="button" aria-label="Opciones del monitor" aria-expanded="false" aria-controls="tvOptions">${ICON_OPTIONS}</button>
    </div>
    <div id="tvFsLayer" class="tv-fs-layer" hidden><button id="btnCloseTvFs" class="tv-fs-close" type="button" aria-label="Salir de pantalla completa">${ICON_CLOSE}</button></div>
    <div id="tvOptions" class="tv-options" role="dialog" aria-label="Opciones del monitor" hidden>
      <div class="tv-options-head"><strong>Monitor</strong><button id="btnTvOptionsClose" class="tv-options-close" type="button" aria-label="Cerrar">×</button></div>
      <span class="tv-options-label">Canal</span>
      <div class="tv-channels">
        <button class="channel is-active" type="button" data-channel="digital" title="${CHANNEL_NAMES.digital}"><span>${CHANNEL_BUTTONS.digital}</span></button>
        <button class="channel" type="button" data-channel="cpc"><span>${CHANNEL_BUTTONS.cpc}</span></button>
      </div>
      <div class="tv-options-actions">
        <button id="btnTvMute" class="tv-opt-btn" type="button"><span id="tvMuteIcon">${ICON_MUTED}</span><span id="tvMuteText">Activar sonido</span></button>
        <button id="btnTvExpand" class="tv-opt-btn" type="button">${ICON_EXPAND}<span>Pantalla completa</span></button>
      </div>
    </div>
  </div>`;
}

// ---------- pantalla ----------
// Tres estados excluyentes: video HLS, reproductor YouTube o mensaje.
function show(state, message = '') {
  const v = $('#tvVideo'), f = $('#tvFrameHost'), m = $('#tvMessage');
  if (v) v.hidden = state !== 'video';
  if (f) { f.hidden = state !== 'frame'; if (state !== 'frame') f.replaceChildren(); }
  if (m) { m.hidden = state !== 'message'; m.textContent = state === 'message' ? message : ''; }
}

function destroyHls() {
  if (hls) { hls.destroy(); hls = null; }
  const v = $('#tvVideo');
  if (!v) return;
  v.pause();
  v.removeAttribute('src');
  v.load();
}

function playHls(url) {
  videoKey = '';
  destroyHls();
  const v = $('#tvVideo');
  if (!v || !url) { show('message', 'Canal no disponible'); return; }
  show('video');
  v.muted = tvMuted;
  v.defaultMuted = tvMuted;
  v.playsInline = true;
  if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(() => {}); return; }
  if (window.Hls?.isSupported()) {
    hls = new window.Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 });
    hls.loadSource(url);
    hls.attachMedia(v);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
    hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) { destroyHls(); show('message', `${CHANNEL_NAMES.digital} · señal no disponible`); } });
    return;
  }
  v.src = url;
  v.play().catch(() => {});
}

function youtubeEmbedUrl(tv) {
  const id = String(tv?.youtubeId || '').trim();
  if (!id) return '';
  const start = Math.max(0, Math.floor(Number(tv?.segundoInicio) || 0));
  const u = new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);
  u.searchParams.set('autoplay', '1');
  u.searchParams.set('mute', tvMuted ? '1' : '0');
  u.searchParams.set('playsinline', '1');
  u.searchParams.set('controls', '1');
  u.searchParams.set('rel', '0');
  u.searchParams.set('enablejsapi', '1');
  u.searchParams.set('start', String(start));
  u.searchParams.set('loop', '1');
  u.searchParams.set('playlist', id);
  u.searchParams.set('origin', location.origin);
  return u.toString();
}

function sendYoutubeCommand(func) {
  const f = $('#tvCpcFrame');
  if (f?.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com');
}

function renderCpcTransmission(force = false) {
  const tv = tvContext?.tv || null;
  const id = String(tv?.youtubeId || '').trim();
  if (!id) { videoKey = ''; destroyHls(); show('message', `${CHANNEL_NAMES.cpc} · sin transmisión en este momento`); return; }
  const key = `${tv?.modo || ''}:${id}`;
  if (!force && videoKey === key) return;
  videoKey = key;
  destroyHls();
  show('frame');
  const host = $('#tvFrameHost');
  if (host) host.innerHTML = `<iframe id="tvCpcFrame" class="tv-youtube-frame" src="${esc(youtubeEmbedUrl(tv))}" title="${esc(tv.titulo || 'Canal CPC')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
}

// ---------- canal CPC (Panel CPC) ----------
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

async function refreshCpc({ force = false } = {}) {
  if (channel !== 'cpc' || !loadContext) return;
  try {
    const fresh = await loadContext();
    if (channel !== 'cpc') return;
    tvContext = fresh;
    renderCpcTransmission(force);
  } catch (error) {
    console.warn('[CPC TV] Canal CPC:', error);
    if (force) { videoKey = ''; destroyHls(); show('message', error?.message || `No fue posible cargar el canal ${CHANNEL_NAMES.cpc}.`); }
  }
}

function startCpc() {
  stopPolling();
  if (!hasSession()) { videoKey = ''; destroyHls(); show('message', `Inicia sesión para ver el canal ${CHANNEL_NAMES.cpc}`); return; }
  if (tvContext) renderCpcTransmission(true);
  else show('message', `Sintonizando ${CHANNEL_NAMES.cpc}…`);
  refreshCpc({ force: !tvContext });
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshCpc(); }, POLL_MS);
}

// ---------- canales ----------
function setChannel(ch) {
  channel = ch === 'cpc' ? 'cpc' : 'digital';
  const m = $('#tvMonitor');
  if (m) m.dataset.channel = channel;
  document.querySelectorAll('.channel[data-channel]').forEach((b) => b.classList.toggle('is-active', b.dataset.channel === channel));
  const nl = $('#tvNowLabel');
  if (nl) nl.textContent = CHANNEL_NAMES[channel];
  if (channel === 'cpc') startCpc();
  else { stopPolling(); playHls(TVDI_HLS); }
}

// ---------- opciones del monitor ----------
function setOptionsOpen(open) {
  const o = $('#tvOptions'), t = $('#btnTvOptions');
  if (!o) return;
  o.hidden = !open;
  t?.setAttribute('aria-expanded', String(open));
}

// ---------- audio ----------
function paintMute() {
  const i = $('#tvMuteIcon'), tt = $('#tvMuteText');
  if (i) i.innerHTML = tvMuted ? ICON_MUTED : ICON_SOUND;
  if (tt) tt.textContent = tvMuted ? 'Activar sonido' : 'Silenciar';
}

function toggleMute() {
  tvMuted = !tvMuted;
  const v = $('#tvVideo');
  if (v) { v.muted = tvMuted; v.defaultMuted = tvMuted; }
  paintMute();
  if (channel === 'cpc') sendYoutubeCommand(tvMuted ? 'mute' : 'unMute');
  else if (!tvMuted) v?.play().catch(() => {});
}

// ---------- pantalla completa ----------
// 1) API nativa (Android, escritorio, iPad). 2) iPhone con canal de video: reproductor nativo.
// 3) Si nada de lo anterior existe (iPhone con YouTube): el monitor ocupa toda la pantalla
//    dentro de la app, con botón para salir; el botón Atrás también lo cierra.
function nativeFsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

function enterPseudoFullscreen() {
  const layer = $('#tvFsLayer');
  document.body.classList.add('tv-fs');
  if (layer) layer.hidden = false;
  try { history.pushState({ cpcTvFs: true }, '', location.href); } catch {}
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch {}
}

function exitPseudoFullscreen({ fromHistory = false } = {}) {
  if (!document.body.classList.contains('tv-fs')) return;
  const layer = $('#tvFsLayer');
  document.body.classList.remove('tv-fs');
  if (layer) layer.hidden = true;
  try { screen.orientation?.unlock?.(); } catch {}
  if (!fromHistory && history.state?.cpcTvFs) { try { history.back(); } catch {} }
}

function toggleFullscreen() {
  const m = $('#tvMonitor');
  if (!m) return;
  if (nativeFsElement()) { const ex = document.exitFullscreen || document.webkitExitFullscreen; try { ex?.call(document)?.catch?.(() => {}); } catch {} return; }
  if (document.body.classList.contains('tv-fs')) { exitPseudoFullscreen(); return; }
  setOptionsOpen(false);
  const req = m.requestFullscreen || m.webkitRequestFullscreen;
  if (req) {
    try {
      const r = req.call(m);
      if (r && typeof r.then === 'function') {
        r.then(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch {} })
          .catch(() => setTimeout(enterPseudoFullscreen, 200));
      }
      return;
    } catch {}
  }
  const v = $('#tvVideo');
  if (channel !== 'cpc' && v && !v.hidden && typeof v.webkitEnterFullscreen === 'function') { try { v.webkitEnterFullscreen(); return; } catch {} }
  setTimeout(enterPseudoFullscreen, 200);
}

// ---------- arranque ----------
// options.loadContext: () => Promise<contexto cpcPwaContext> (con .tv).
// options.hasSession:  () => boolean.
// options.defaultChannel: 'cpc' | 'digital'.
export function initCpcTv(options = {}) {
  loadContext = typeof options.loadContext === 'function' ? options.loadContext : null;
  hasSession = typeof options.hasSession === 'function' ? options.hasSession : () => false;
  videoKey = '';
  stopPolling();

  const m = $('#tvMonitor'), opts = $('#tvOptions'), trigger = $('#btnTvOptions');
  if (!m || !opts || !trigger) return;

  trigger.addEventListener('click', (e) => { e.stopPropagation(); setOptionsOpen(opts.hidden); });
  $('#btnTvOptionsClose')?.addEventListener('click', () => setOptionsOpen(false));
  opts.addEventListener('click', (e) => {
    const b = e.target.closest('[data-channel]');
    if (!b) return;
    if (b.dataset.channel !== channel) setChannel(b.dataset.channel);
    setTimeout(() => setOptionsOpen(false), 150);
  });
  $('#btnTvMute')?.addEventListener('click', toggleMute);
  $('#btnTvExpand')?.addEventListener('click', toggleFullscreen);
  $('#btnCloseTvFs')?.addEventListener('click', () => exitPseudoFullscreen());

  if (!globalBound) {
    globalBound = true;
    document.addEventListener('click', (e) => {
      const o = $('#tvOptions'), t = $('#btnTvOptions');
      if (o && !o.hidden && !o.contains(e.target) && !t?.contains(e.target)) setOptionsOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.body.classList.contains('tv-fs')) exitPseudoFullscreen();
      else setOptionsOpen(false);
    });
    window.addEventListener('popstate', () => exitPseudoFullscreen({ fromHistory: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && channel === 'cpc') refreshCpc(); });
  }

  paintMute();
  setChannel(options.defaultChannel === 'cpc' && hasSession() ? 'cpc' : 'digital');
}
