// CPC · Monitor TV · v0.5.16
// Réplica del monitor de NEXUS. Fuentes de referencia en el repo nexus:
//   js/tv.js        → reproducción, canales, sonido y pantalla completa (copiado tal cual).
//   js/modes.js     → initTvOptions (menú de opciones del monitor).
//   js/back-nav.js  → el botón Atrás cierra el menú y la pantalla completa.
// Única adaptación: el canal "eo" de NEXUS aquí es "cpc" = TV Capacitación, configurado
// desde el Panel CPC (cpcPwaContext → tv). Como en CPC no hay recarga de contexto global,
// el canal se vuelve a consultar cada POLL_MS mientras está al aire.

const TVDI_HLS = "https://motortv.scad.mx/hls/canal.m3u8";
const CPC_CHANNEL_NAME = "TV Capacitación";
const DIGITAL_CHANNEL_NAME = "TV Digital";
const POLL_MS = 10000;

let context = null, hls = null, tvMuted = true, communityVideoKey = "";
const $ = s => document.querySelector(s);

// ---------- marcado (idéntico a nexus/index.html) ----------
export function tvMarkup() {
  return `<section class="tv-section" aria-label="${CPC_CHANNEL_NAME}">
      <div class="tv-console">
        <div id="tvMonitor" class="tv-monitor"><video id="tvVideo" autoplay muted playsinline preload="auto" aria-label="Canal en vivo"></video><div id="tvPlaceholder" class="tv-placeholder"></div><div id="tvScreenCenter" class="tv-screen-center"><span class="tv-play">▶</span></div></div>
        <div class="tv-bar">
          <span id="tvNowLabel" class="tv-now">${CPC_CHANNEL_NAME}</span>
          <button id="btnTvOptions" class="tv-options-trigger" type="button" aria-label="Opciones del monitor" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>
        </div>
        <div id="tvFsLayer" class="tv-fs-layer" hidden><button id="btnCloseTvFs" class="tv-fs-close" type="button" aria-label="Salir de pantalla completa"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div id="tvOptions" class="tv-controls tv-options" role="dialog" aria-label="Opciones del monitor" hidden>
          <div class="tv-options-head"><strong>Monitor</strong><button id="btnTvOptionsClose" class="tv-options-close" type="button" aria-label="Cerrar">×</button></div>
          <span class="tv-options-label">Canal</span>
          <div class="tv-channels">
            <button class="channel" type="button" data-channel="internet"><span>${DIGITAL_CHANNEL_NAME}</span></button>
            <button class="channel is-active" type="button" data-channel="cpc"><span id="cpcChannelName">${CPC_CHANNEL_NAME}</span></button>
          </div>
          <div class="tv-options-actions">
            <button id="btnTvMute" class="tv-opt-btn" type="button"><span id="tvMuteIcon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg></span><span id="tvMuteText">Activar sonido</span></button>
            <button id="btnTvExpand" class="tv-opt-btn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Pantalla completa</span></button>
          </div>
        </div>
      </div>
    </section>`;
}

// ---------- nexus/js/tv.js ----------
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function destroyHls(){if(hls){hls.destroy();hls=null}const v=$("#tvVideo");if(!v)return;v.pause();v.removeAttribute("src");v.load()}
function setPlaceholder(active){const v=$("#tvVideo"),p=$("#tvPlaceholder"),c=$("#tvScreenCenter");if(p)p.hidden=!active;if(c)c.hidden=!active;if(v)v.hidden=active}
function playUrl(url){communityVideoKey="";const c=$("#tvScreenCenter");if(c)c.innerHTML='<span class="tv-play">▶</span>';destroyHls();const v=$("#tvVideo");if(!v||!url){setPlaceholder(true);return}setPlaceholder(false);v.muted=tvMuted;if(/\.m3u8($|\?)/i.test(url)){if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=url;v.play().catch(()=>{});return}if(window.Hls&&Hls.isSupported()){hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:30});hls.loadSource(url);hls.attachMedia(v);hls.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)setPlaceholder(true)});return}}v.src=url;v.play().catch(()=>{})}
function youtubeEmbedUrl(tv){const id=String(tv?.youtubeId||"").trim();if(!id)return"";const start=Math.max(0,Math.floor(Number(tv?.segundoInicio)||0));const u=new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);u.searchParams.set("autoplay","1");u.searchParams.set("mute",tvMuted?"1":"0");u.searchParams.set("playsinline","1");u.searchParams.set("controls","1");u.searchParams.set("rel","0");u.searchParams.set("enablejsapi","1");u.searchParams.set("start",String(start));u.searchParams.set("loop","1");u.searchParams.set("playlist",id);u.searchParams.set("origin",location.origin);return u.toString()}
function sendYoutubeCommand(func){const f=$("#tvCommunityFrame");if(f?.contentWindow)f.contentWindow.postMessage(JSON.stringify({event:"command",func,args:[]}),"https://www.youtube.com")}
function renderCpcTransmission(force=false){const tv=context?.tv,id=String(tv?.youtubeId||"").trim(),center=$("#tvScreenCenter");if(!id){communityVideoKey="";destroyHls();setPlaceholder(true);if(center)center.innerHTML='<span class="tv-play">▶</span>';return}const key=`${tv?.modo||""}:${id}`;if(!force&&communityVideoKey===key)return;communityVideoKey=key;destroyHls();const v=$("#tvVideo"),p=$("#tvPlaceholder");if(v)v.hidden=true;if(p)p.hidden=false;if(center){center.hidden=false;center.innerHTML=`<iframe id="tvCommunityFrame" class="tv-youtube-frame" src="${esc(youtubeEmbedUrl(tv))}" title="${esc(tv.titulo||CPC_CHANNEL_NAME)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`}}
function playCpc(){renderCpcTransmission(true)}
function setChannel(ch){const m=$("#tvMonitor");if(m)m.dataset.channel=ch;document.querySelectorAll(".channel[data-channel]").forEach(b=>b.classList.toggle("is-active",b.dataset.channel===ch));const nl=$("#tvNowLabel");if(nl)nl.textContent=ch==="cpc"?CPC_CHANNEL_NAME:DIGITAL_CHANNEL_NAME;if(ch==="cpc"){playCpc();startCpcPolling()}else{stopCpcPolling();playUrl(TVDI_HLS)}}
// En NEXUS el contexto llega una vez; aquí también llega por sondeo, así que sólo se
// vuelve a cargar el reproductor si cambió lo que el Panel CPC tiene al aire.
export function setTvContext(next){context=next||null;if($("#tvMonitor")?.dataset.channel==="cpc")renderCpcTransmission(false)}
// v0.3.3 · Pantalla completa del monitor.
// 1) API nativa (Android, escritorio, iPad). 2) iPhone con canal de video: reproductor nativo.
// 3) Si nada de lo anterior existe (iPhone con YouTube): el monitor ocupa toda la pantalla
//    dentro de la app, con botón para salir; el botón Atrás también lo cierra.
function closeTvOptions(){const o=$("#tvOptions"),t=$("#btnTvOptions");if(o&&!o.hidden){o.hidden=true;t?.setAttribute("aria-expanded","false")}}
function nativeFsElement(){return document.fullscreenElement||document.webkitFullscreenElement||null}
function enterTvPseudoFullscreen(){const layer=$("#tvFsLayer");document.body.classList.add("tv-fs");if(layer)layer.hidden=false;try{screen.orientation?.lock?.("landscape").catch(()=>{})}catch{}}
function exitTvPseudoFullscreen(){const layer=$("#tvFsLayer");document.body.classList.remove("tv-fs");if(layer&&!layer.hidden)layer.hidden=true;try{screen.orientation?.unlock?.()}catch{}}
function toggleTvFullscreen(){
  const m=$("#tvMonitor");if(!m)return;
  if(nativeFsElement()){const ex=document.exitFullscreen||document.webkitExitFullscreen;try{ex?.call(document)?.catch?.(()=>{})}catch{}return}
  if(document.body.classList.contains("tv-fs")){exitTvPseudoFullscreen();return}
  const req=m.requestFullscreen||m.webkitRequestFullscreen;
  if(req){
    closeTvOptions();
    try{const r=req.call(m);if(r&&typeof r.then==="function"){r.then(()=>{try{screen.orientation?.lock?.("landscape").catch(()=>{})}catch{}}).catch(()=>setTimeout(enterTvPseudoFullscreen,200))}return}catch{}
  }
  const v=$("#tvVideo");
  if(m.dataset.channel!=="cpc"&&v&&!v.hidden&&typeof v.webkitEnterFullscreen==="function"){try{v.webkitEnterFullscreen();closeTvOptions();return}catch{}}
  closeTvOptions();setTimeout(enterTvPseudoFullscreen,200);
}
function initTv(){const m=$("#tvMonitor"),x=$("#btnTvExpand"),c=$(".tv-controls");if(!m||!c)return;m.dataset.channel="cpc";c.addEventListener("click",e=>{const b=e.target.closest("[data-channel]");if(b)setChannel(b.dataset.channel)});x?.addEventListener("click",()=>toggleTvFullscreen());$("#btnCloseTvFs")?.addEventListener("click",exitTvPseudoFullscreen);$("#btnTvMute")?.addEventListener("click",()=>{tvMuted=!tvMuted;const v=$("#tvVideo"),i=$("#tvMuteIcon");if(v)v.muted=tvMuted;if(i)i.innerHTML=tvMuted?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';const tt=$("#tvMuteText");if(tt)tt.textContent=tvMuted?"Activar sonido":"Silenciar";if(m.dataset.channel==="cpc")sendYoutubeCommand(tvMuted?"mute":"unMute");else if(!tvMuted)v?.play().catch(()=>{})});setChannel("cpc")}

// ---------- nexus/js/modes.js · initTvOptions ----------
function initTvOptions() {
  const trigger = $("#btnTvOptions"), panel = $("#tvOptions");
  if (!trigger || !panel) return;
  const setOpen = open => { panel.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); };
  trigger.addEventListener("click", e => { e.stopPropagation(); setOpen(panel.hidden); });
  $("#btnTvOptionsClose")?.addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", e => { if (e.target.closest("[data-channel]")) setTimeout(() => setOpen(false), 150); });
}

// ---------- nexus/js/back-nav.js (sólo las capas del monitor) ----------
// Cada capa que se abre agrega un paso al historial del navegador.
// Así, el botón Atrás cierra la capa superior en lugar de salir de la app.
// Si la capa se cierra con su propio botón, se consume ese paso del historial.
const MODAL_SELECTOR = ["#tvOptions", "#tvFsLayer"].join(",");
const CLOSE_SELECTOR = ["#btnCloseTvFs", "#btnTvOptionsClose"].join(",");
const stack = [];
let ignorePops = 0;
function isOpen(el) { return !!el && el.isConnected && !el.hidden; }
function closeModal(el) {
  const own = [...el.querySelectorAll(CLOSE_SELECTOR)].find(b => b.closest(MODAL_SELECTOR) === el);
  if (own) own.click();
  if (isOpen(el)) el.hidden = true;
}
function onOpened(el) {
  if (stack.includes(el)) return;
  stack.push(el);
  history.pushState({ cpcTvModal: el.id || true }, "");
}
function onClosed(el) {
  const i = stack.indexOf(el);
  if (i === -1) return;
  stack.splice(i, 1);
  if (history.state && history.state.cpcTvModal) { ignorePops++; history.back(); }
}
function scan() {
  document.querySelectorAll(MODAL_SELECTOR).forEach(el => { if (isOpen(el)) onOpened(el); });
  [...stack].forEach(el => { if (!isOpen(el)) onClosed(el); });
}

// ---------- listeners de documento (una sola vez, aunque app.js vuelva a pintar) ----------
let docBound = false;
function bindDocumentOnce() {
  if (docBound) return;
  docBound = true;
  // modes.js: un toque fuera del menú lo cierra.
  document.addEventListener("click", e => {
    const panel = $("#tvOptions"), trigger = $("#btnTvOptions");
    if (panel && !panel.hidden && !panel.contains(e.target) && !trigger?.contains(e.target)) { panel.hidden = true; trigger?.setAttribute("aria-expanded", "false"); }
  });
  // tv.js: Esc sale de la pantalla completa dentro de la app.
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("tv-fs")) exitTvPseudoFullscreen(); });
  // back-nav.js
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = stack.pop();
    if (top) closeModal(top);
  });
  new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && $("#tvMonitor")?.dataset.channel === "cpc") refreshCpc(); });
}

// ---------- TV Capacitación: contexto desde el Panel CPC ----------
let loadContext = null, pollTimer = null;
function stopCpcPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
async function refreshCpc() {
  if (!loadContext) return;
  try { const next = await loadContext(); if ($("#tvMonitor")?.dataset.channel === "cpc") setTvContext(next); }
  catch (error) { console.warn("[CPC TV] TV Capacitación:", error); }
}
function startCpcPolling() {
  stopCpcPolling();
  if (!loadContext) return;
  refreshCpc();
  pollTimer = setInterval(() => { if (document.visibilityState === "visible") refreshCpc(); }, POLL_MS);
}

// options.loadContext: () => Promise<contexto cpcPwaContext> (con .tv). Sin sesión: se omite
// y TV Capacitación muestra el monitor en espera (▶), igual que NEXUS sin transmisión.
export function initCpcTv(options = {}) {
  loadContext = typeof options.loadContext === "function" ? options.loadContext : null;
  stopCpcPolling();
  communityVideoKey = "";
  bindDocumentOnce();
  initTvOptions();
  initTv();
}
