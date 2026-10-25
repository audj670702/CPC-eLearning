import { resolveSysTransmission } from "./cpc-tv-model.js?v=0.5.35";
// CPC · Monitor TV · v0.5.35 · modelo compartido (CPC, LOT…)
// CH 00: canal de la EO (en CPC, TV Capacitación). Opcional: eoChannel:false lo omite.
// CH 01–02: señales digitales. CH 03+: catálogo y programación de SYS.
// Opciones (tvMarkup / initCpcTv): eoChannel (true), staticEffect (false: estática al cambiar de canal).
// v0.5.35 · canales de YouTube: el reproductor siempre arranca silenciado (autoplay permitido),
// el sonido se activa después, y el cambio de programa reutiliza el mismo reproductor.

const TVDI_HLS = "https://tvdigital.scad.mx/cfcx/canal/index.m3u8";
const CPC_CHANNEL_NAME = "TV Capacitación";
const DIGITAL_CHANNEL_NAME = "TV Digital";
const POLL_MS = 10000;

const API_BASE = "https://www.scad.mx/_functions";
const DIGITAL_CHANNELS = [
  { codigo: "CH01", numero: 1, nombre: "TV Digital Internet", tipo: "VPS", senal: TVDI_HLS },
  { codigo: "CH02", numero: 2, nombre: "Programación variada", tipo: "VPS", senal: "https://tvdigital.scad.mx/cfcx/prueba/index.m3u8" }
];
const EO_CHANNEL = { codigo: "cpc", numero: 0, nombre: CPC_CHANNEL_NAME, tipo: "EO" };
let opts = { eoChannel: true, staticEffect: false };
function setOptions(next = {}) {
  if ("eoChannel" in next) opts.eoChannel = next.eoChannel !== false;
  if ("staticEffect" in next) opts.staticEffect = next.staticEffect === true;
}
function baseChannels() { return opts.eoChannel ? [EO_CHANNEL] : []; }
function defaultChannel() { return opts.eoChannel ? "cpc" : "CH01"; }
let channels = [EO_CHANNEL, ...DIGITAL_CHANNELS];
let selected = "cpc", catalogTimer = null, clockOffset = 0, sysTransmission = null;
let selectionVersion = 0, sysLoading = false, cpcLoading = false;
let context = null, hls = null, tvMuted = true, communityVideoKey = "";
const $ = s => document.querySelector(s);

// ---------- marcado (idéntico a nexus/index.html) ----------
export function tvMarkup(options = {}) {
  setOptions(options);
  const first = opts.eoChannel ? EO_CHANNEL : DIGITAL_CHANNELS[0];
  return `<section class="tv-section" aria-label="${opts.eoChannel ? CPC_CHANNEL_NAME : "Monitor TV"}">
    <div class="tv-console">
      <div id="tvMonitor" class="tv-monitor">
        <video id="tvVideo" autoplay muted playsinline preload="auto" aria-label="Canal en vivo"></video>
        <div id="tvPlaceholder" class="tv-placeholder"></div>
        <div id="tvScreenCenter" class="tv-screen-center"><span class="tv-play">▶</span></div>
        <div id="tvLoadIndicator" class="tv-load-indicator" role="status" aria-live="polite" hidden><span id="tvLoadText"></span><span class="tv-load-line" aria-hidden="true"></span></div>
        <div class="tv-caption"><div class="tv-channel-heading"><strong id="tvChannelNumber">CH ${String(first.numero).padStart(2, "0")}</strong><span id="tvNowLabel" class="tv-now">${first.nombre}</span></div><small id="tvContentTitle"></small></div>
        ${opts.staticEffect ? '<div id="tvStatic" class="tv-static" aria-hidden="true"></div>' : ""}
      </div>
      <button id="tvResume" class="tv-resume" type="button" hidden>▶ Reproducir</button>
      <div class="tv-bar">
        <button id="btnTvMute" class="tv-toolbar-button" type="button" aria-label="Activar sonido"><span id="tvMuteIcon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg></span><span id="tvMuteText" class="tv-sr-only">Activar sonido</span></button>
        <button id="btnTvOptions" class="tv-toolbar-button tv-channel-trigger" type="button" aria-label="Elegir canal" aria-controls="tvOptions" aria-expanded="false"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/></svg><span>Canales</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <button id="btnTvExpand" class="tv-toolbar-button" type="button" aria-label="Ampliar monitor"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
      <div id="tvFsLayer" class="tv-fs-layer" hidden><button id="btnCloseTvFs" class="tv-fs-close" type="button" aria-label="Salir de pantalla completa">×</button></div>
      <div id="tvOptions" class="tv-controls tv-options" role="dialog" aria-label="Elegir canal" hidden>
        <div class="tv-options-head"><strong>Canales</strong><button id="btnTvOptionsClose" class="tv-options-close" type="button" aria-label="Cerrar canales">×</button></div>
        <div class="tv-channels" id="tvChannelList"></div>
      </div>
    </div>
  </section>`;
}

// ---------- nexus/js/tv.js ----------
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setStreamState(state,message=''){
  const el=$("#tvLoadIndicator"),label=$("#tvLoadText");
  if(!el||!label)return;
  const busy=state==='loading'||state==='reconnecting';
  el.dataset.state=state;el.hidden=!message;label.textContent=message;
  $("#tvMonitor")?.setAttribute('aria-busy',String(busy));
}
let digitalRetryTimer = null, digitalWatchTimer = null;
let digitalNeedsGesture = false, digitalRetries = 0, digitalGeneration = 0;
function stopDigitalRecovery(){
  clearTimeout(digitalRetryTimer);clearInterval(digitalWatchTimer);
  digitalRetryTimer=null;digitalWatchTimer=null;
}
function digitalFallback(needsGesture=false){
  digitalNeedsGesture=needsGesture;
  if(needsGesture)setStreamState('action','Pulsa Reproducir');
  const b=$("#tvResume");if(b){b.textContent=needsGesture?'▶ Reproducir':'↻ Reintentar señal';b.hidden=false}
  const v=$("#tvVideo");if(v&&needsGesture)v.controls=true;
}
function attemptDigitalPlay(v){
  const generation=digitalGeneration;
  const result=v.play();
  result?.catch(error=>{
    if(generation!==digitalGeneration)return;
    if(error?.name==='AbortError')return;
    if(error?.name==='NotAllowedError'){digitalFallback(true);return}
    retryDigital();
  });
}
function retryDigital(){
  if(currentChannel()?.tipo!=='VPS'||digitalRetryTimer||digitalNeedsGesture)return;
  digitalFallback();
  if(digitalRetries>=3){setStreamState('error','Señal no disponible · Reintenta');return}
  setStreamState('reconnecting','Reconectando…');
  const generation=digitalGeneration, delay=5000*(2**digitalRetries++);
  digitalRetryTimer=setTimeout(()=>{
    digitalRetryTimer=null;
    if(generation===digitalGeneration&&document.visibilityState==='visible'&&currentChannel()?.tipo==='VPS')playUrl(currentChannel().senal,true);
  },delay);
}
function watchDigital(v){
  let lastTime=v.currentTime, lastProgress=Date.now(), hasPlayed=false;
  v.onerror=retryDigital;
  v.onwaiting=()=>{if(!digitalNeedsGesture)setStreamState(hasPlayed?'reconnecting':'loading',hasPlayed?'Recuperando señal…':'Cargando señal…')};
  v.onstalled=v.onwaiting;
  v.onplaying=()=>{
    hasPlayed=true;lastProgress=Date.now();digitalNeedsGesture=false;
    clearTimeout(digitalRetryTimer);digitalRetryTimer=null;
    $("#tvResume").hidden=true;v.controls=false;setStreamState('playing');
  };
  digitalWatchTimer=setInterval(()=>{
    if(document.visibilityState!=='visible'||digitalNeedsGesture){lastProgress=Date.now();return}
    if(v.currentTime!==lastTime){
      lastTime=v.currentTime;lastProgress=Date.now();
      // A sustained connection earns a fresh recovery budget.
      if(v.currentTime>10)digitalRetries=0;
    }else if(Date.now()-lastProgress>(hasPlayed?45000:60000))retryDigital();
  },5000);
}
function destroyHls(){
  digitalGeneration++;stopDigitalRecovery();
  const v=$("#tvVideo");
  if(v){v.onerror=null;v.onplaying=null;v.onwaiting=null;v.onstalled=null;v.controls=false}
  if(hls){hls.destroy();hls=null}
  if(v){v.pause();v.removeAttribute("src");v.load()}
}
function setPlaceholder(active){const v=$("#tvVideo"),p=$("#tvPlaceholder"),c=$("#tvScreenCenter");if(p)p.hidden=!active;if(c)c.hidden=!active;if(v)v.hidden=active}
function playUrl(url,recovering=false){
  communityVideoKey="";
  const c=$("#tvScreenCenter");if(c)c.innerHTML='<span class="tv-play">▶</span>';
  destroyHls();
  if(!recovering)digitalRetries=0;
  digitalNeedsGesture=false;
  const v=$("#tvVideo");
  if(!v||!url){setPlaceholder(true);setStreamState('error','Señal no configurada');return}
  setStreamState(recovering?'reconnecting':'loading',recovering?'Reconectando…':'Cargando señal…');
  setPlaceholder(false);
  v.defaultMuted=tvMuted;v.muted=tvMuted;v.playsInline=true;
  v.setAttribute('webkit-playsinline','');
  watchDigital(v);
  if(/\.m3u8($|\?)/i.test(url)){
    // Safari/iOS use native HLS. Android/Chromium use the MSE player when available.
    const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||
      (/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)||
      (/Safari/.test(navigator.userAgent)&&!/Chrome|Chromium|Android/.test(navigator.userAgent));
    if(!apple&&window.Hls&&Hls.isSupported()){
      hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:30,maxBufferLength:30});
      hls.attachMedia(v);hls.loadSource(url);
      hls.on(Hls.Events.MANIFEST_PARSED,()=>attemptDigitalPlay(v));
      hls.on(Hls.Events.ERROR,(_,d)=>{
        if(!d.fatal)return;
        if(d.type===Hls.ErrorTypes.MEDIA_ERROR&&digitalRetries<3){
          digitalRetries++;setStreamState('reconnecting','Recuperando señal…');hls.recoverMediaError();
        }else retryDigital();
      });
      return;
    }
    if(v.canPlayType("application/vnd.apple.mpegurl")){
      v.src=url;attemptDigitalPlay(v);return;
    }
  }
  v.src=url;attemptDigitalPlay(v);
}
function resumeDigital(){
  const v=$("#tvVideo");
  if(!v||currentChannel()?.tipo!=='VPS')return;
  clearTimeout(digitalRetryTimer);digitalRetryTimer=null;digitalRetries=0;
  digitalNeedsGesture=false;
  // Keep the loaded stream and invoke play within the user's tap.
  setStreamState('loading','Cargando señal…');
  if(!v.error&&(v.currentSrc||v.getAttribute('src')||hls)){attemptDigitalPlay(v);return}
  playUrl(currentChannel().senal);
}
// v0.5.35 · El reproductor de YouTube SIEMPRE se crea silenciado: es la única forma de
// reproducción automática que todos los navegadores permiten sin un toque del usuario.
// Si el usuario pidió sonido, se activa en cuanto el video está al aire; si el navegador lo
// impide (iPhone/Safari), el video sigue en silencio en vez de detenerse y pedir Reproducir.
let ytReady = false, ytState = null, ytPlayerMuted = true, ytUnmuteAt = 0, ytWatchTimer = null, ytWatchGeneration = 0;
function youtubeEmbedUrl(tv){const id=String(tv?.youtubeId||"").trim();if(!id)return"";const start=Math.max(0,Math.floor(Number(tv?.segundoInicio)||0));const u=new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);u.searchParams.set("autoplay","1");u.searchParams.set("mute","1");u.searchParams.set("playsinline","1");u.searchParams.set("controls","1");u.searchParams.set("rel","0");u.searchParams.set("enablejsapi","1");u.searchParams.set("start",String(start));u.searchParams.set("origin",location.origin);return u.toString()}
function sendYoutubeCommand(func,args=[]){const f=$("#tvCommunityFrame");if(f?.contentWindow)f.contentWindow.postMessage(JSON.stringify({event:"command",func,args}),"https://www.youtube.com")}
function paintMute(){const i=$("#tvMuteIcon"),t=$("#tvMuteText");if(i)i.innerHTML=tvMuted?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';if(t)t.textContent=tvMuted?"Activar sonido":"Silenciar";$("#btnTvMute")?.setAttribute("aria-label",tvMuted?"Activar sonido":"Silenciar")}
function youtubeUnmute(){ytUnmuteAt=Date.now();sendYoutubeCommand("unMute")}
// El navegador no permitió el sonido: se queda en silencio y el video continúa.
function youtubeKeepPlayingMuted(){ytUnmuteAt=0;tvMuted=true;paintMute();sendYoutubeCommand("mute");sendYoutubeCommand("playVideo");setStreamState('notice','Toca 🔊 para activar el sonido');setTimeout(()=>{if(ytState===1&&$("#tvLoadIndicator")?.dataset.state==='notice')setStreamState('playing')},4000)}
// Si el video no arranca solo, primero se reintenta en silencio; sólo después se ofrece Reproducir.
function watchYoutubeStart(){clearTimeout(ytWatchTimer);const generation=++ytWatchGeneration;ytWatchTimer=setTimeout(()=>{if(generation!==ytWatchGeneration||ytState===1||document.visibilityState!=='visible')return;sendYoutubeCommand("mute");sendYoutubeCommand("playVideo");ytWatchTimer=setTimeout(()=>{if(generation===ytWatchGeneration&&ytState!==1&&document.visibilityState==='visible')showPlayFallback()},6000)},6000)}
function stopYoutubeWatch(){clearTimeout(ytWatchTimer);ytWatchGeneration++}
function renderCpcTransmission(force=false){const tv=context?.tv,id=String(tv?.youtubeId||"").trim(),center=$("#tvScreenCenter");if(!id){stopYoutubeWatch();setStreamState('idle',selected==='cpc'&&!loadContext?'Inicia sesión para este canal':'Sin programación');communityVideoKey="";destroyHls();setPlaceholder(true);if(center)center.innerHTML='<span class="tv-play">▶</span>';return}const key=`${tv?.modo||""}:${tv?.itemId||""}:${tv?.occurrence??""}:${id}`;if(!force&&communityVideoKey===key)return;communityVideoKey=key;$("#tvResume").hidden=true;
// Cambio de programa en el mismo canal: se carga en el reproductor que ya está al aire
// (sin recrear el iframe), así conserva el permiso de reproducción y el sonido.
const current=$("#tvCommunityFrame");if(current&&ytReady){ytState=null;setStreamState('loading','Cargando señal…');sendYoutubeCommand("loadVideoById",[{videoId:id,startSeconds:Math.max(0,Math.floor(Number(tv?.segundoInicio)||0))}]);watchYoutubeStart();return}
destroyHls();setStreamState('loading','Cargando señal…');const v=$("#tvVideo"),p=$("#tvPlaceholder");if(v)v.hidden=true;if(p)p.hidden=false;if(center){ytReady=false;ytState=null;center.hidden=false;ytPlayerMuted=true;ytUnmuteAt=0;center.innerHTML=`<iframe id="tvCommunityFrame" class="tv-youtube-frame" src="${esc(youtubeEmbedUrl(tv))}" title="${esc(tv.titulo||CPC_CHANNEL_NAME)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;watchYoutubeStart();
const frame=$("#tvCommunityFrame");frame?.addEventListener('load',()=>{frame.contentWindow?.postMessage(JSON.stringify({event:'listening',id:'cpc-monitor'}),'https://www.youtube.com');for(const event of ['onStateChange','onAutoplayBlocked','onError'])frame.contentWindow?.postMessage(JSON.stringify({event:'command',func:'addEventListener',args:[event]}),'https://www.youtube.com')});}}
function playCpc(){renderCpcTransmission(true)}
function currentChannel(){return channels.find(c=>c.codigo===selected)}
function renderChannels(){
  const list=$("#tvChannelList");
  if(list)list.innerHTML=channels.map(c=>`<button class="channel ${c.codigo===selected?'is-active':''}" type="button" data-channel="${esc(c.codigo)}" aria-pressed="${c.codigo===selected}"><span>CH ${String(c.numero).padStart(2,'0')} · ${esc(c.nombre)}</span></button>`).join('');
  const c=currentChannel();
  if(!c)return;
  $("#tvChannelNumber").textContent=`CH ${String(c.numero).padStart(2,'0')}`;
  $("#tvNowLabel").textContent=c.nombre;
}
function showPlayFallback(){setStreamState('action','Pulsa Reproducir');const b=$("#tvResume");if(b){b.textContent="▶ Reproducir";b.hidden=false}}
function setTitle(title=''){const el=$("#tvContentTitle");if(el){el.textContent=title;el.title=title}}
// Estática breve al sintonizar, como en el monitor del panel TV Digital (sólo con staticEffect).
function flashStatic(){const st=$("#tvStatic");if(!st)return;st.classList.remove('on');void st.offsetWidth;st.classList.add('on')}
function setChannel(ch,{effect=true}={}){
  if(!channels.some(c=>c.codigo===ch))return;
  selected=ch;selectionVersion++;sysTransmission=null;sysLoading=false;
  stopCpcPolling();stopYoutubeWatch();
  if(effect)flashStatic();
  const m=$("#tvMonitor");if(m){m.dataset.channel=ch;m.dataset.source=currentChannel()?.tipo==='VPS'?'hls':'youtube'}
  communityVideoKey='';
  // Remove the old YouTube iframe before switching to an HLS signal.
  const center=$("#tvScreenCenter");if(center)center.innerHTML='<span class="tv-play">▶</span>';
  renderChannels();setTitle();$("#tvResume").hidden=true;setStreamState('loading','Consultando señal…');
  if(ch==='cpc'){playCpc();if(loadContext)setStreamState('loading','Consultando señal…');setTitle(context?.tv?.titulo||'');startCpcPolling()}
  else {
    const c=currentChannel();
    if(c.tipo==='VPS')playUrl(c.senal);else {destroyHls();setPlaceholder(true)}
    refreshSys();pollTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshSys()},POLL_MS);
  }
}
// Monitor fuera de pantalla (p. ej. la app cambió de vista): se detiene la señal y se libera el
// reproductor; al volver se sintoniza de nuevo el mismo canal, sin estática.
let tvActive = true;
export function setTvActive(active){
  active=active!==false;if(active===tvActive)return;tvActive=active;
  if(active){setChannel(selected,{effect:false});return}
  stopCpcPolling();stopYoutubeWatch();communityVideoKey='';destroyHls();
  const center=$("#tvScreenCenter");if(center)center.innerHTML='<span class="tv-play">▶</span>';
  setPlaceholder(true);setStreamState('idle','');closeTvOptions();exitTvPseudoFullscreen();
}
export function setTvContext(next){context=next||null;if(tvActive&&selected==='cpc'){renderCpcTransmission(false);setTitle(context?.tv?.titulo||'')}}
function stepChannel(direction){const i=channels.findIndex(c=>c.codigo===selected);setChannel(channels[(i+direction+channels.length)%channels.length].codigo)}
async function readPublic(path){
  const response=await fetch(`${API_BASE}/${path}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`TV ${response.status}`);
  const data=await response.json();
  if(data.ok!==true){const error=new Error(data.mensaje||data.codigo||'Sin programación');error.code=data.codigo;throw error;}
  const server=Date.parse(response.headers.get('Date'));
  if(Number.isFinite(server))clockOffset=server-Date.now();
  return data;
}
async function refreshCatalog(){
  try{
    const data=await readPublic('tvdCanales');
    if(!Array.isArray(data.canales))throw new Error('Catálogo inválido');
    const seen=new Set();
    const sys=data.canales.filter(c=>/^CH\d{2}$/.test(c.codigo)&&Number(c.numero)>0&&Number(c.numero)===Number(c.codigo.slice(2))&&['VPS','VIRTUAL'].includes(c.tipo)&&!seen.has(c.codigo)&&seen.add(c.codigo));
    const previous=currentChannel();
    channels=[...baseChannels(),...DIGITAL_CHANNELS.map(f=>({...f,...sys.find(c=>c.codigo===f.codigo)})),...sys.filter(c=>c.numero>2)];
    const next=currentChannel();
    if(!next)setChannel('CH01');
    else if(tvActive&&previous&&(previous.tipo!==next.tipo||previous.senal!==next.senal))setChannel(selected,{effect:false});
    else renderChannels();
  }catch(error){console.warn('[CPC TV] Catálogo SYS:',error)}
}
async function refreshSys(){
  if(selected==='cpc'||sysLoading)return;
  const version=selectionVersion,code=selected;
  sysLoading=true;
  try{
    const data=await readPublic(`tvdTransmision?canal=${encodeURIComponent(code)}`);
    if(version!==selectionVersion)return;
    sysTransmission=data;
    renderSysTransmission();
  }catch(error){
    if(version===selectionVersion){sysTransmission=null;setTitle('');if(currentChannel()?.tipo==='VIRTUAL'){destroyHls();setPlaceholder(true);setStreamState(error.code==='SIN_TRANSMISION_ACTIVA'?'idle':'error',error.code==='SIN_TRANSMISION_ACTIVA'?'Sin programación':'No se pudo cargar la señal');}}
  }finally{if(version===selectionVersion)sysLoading=false}
}
function renderSysTransmission(){
  if(!tvActive||!sysTransmission||selected==='cpc')return;
  const tv=resolveSysTransmission(sysTransmission,Date.now()+clockOffset);
  if(currentChannel()?.tipo==='VPS'){setTitle(sysTransmission.transmision?.videoAlAire||'');return}
  setTitle(tv?.titulo||'');
  if(!tv){destroyHls();setPlaceholder(true);setStreamState('idle','Sin programación');return}
  const previous=context;
  context={tv};renderCpcTransmission(false);context=previous;
}
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
  if(currentChannel()?.tipo==="VPS"&&v&&!v.hidden&&typeof v.webkitEnterFullscreen==="function"){try{v.webkitEnterFullscreen();closeTvOptions();return}catch{}}
  closeTvOptions();setTimeout(enterTvPseudoFullscreen,200);
}
function initTv(){const m=$("#tvMonitor"),x=$("#btnTvExpand"),c=$(".tv-controls");if(!m||!c)return;m.dataset.channel=defaultChannel();c.addEventListener("click",e=>{const b=e.target.closest("[data-channel]");if(b)setChannel(b.dataset.channel)});x?.addEventListener("click",()=>toggleTvFullscreen());$("#btnCloseTvFs")?.addEventListener("click",exitTvPseudoFullscreen);$("#btnTvMute")?.addEventListener("click",()=>{tvMuted=!tvMuted;const v=$("#tvVideo");if(v)v.muted=tvMuted;paintMute();if(currentChannel()?.tipo!=="VPS"){if(tvMuted){ytUnmuteAt=0;sendYoutubeCommand("mute")}else youtubeUnmute()}else if(!tvMuted)v?.play().catch(()=>{})});$("#tvResume")?.addEventListener('click',()=>{if(currentChannel()?.tipo==='VPS')resumeDigital();else{setStreamState('loading','Cargando señal…');sendYoutubeCommand('playVideo');$("#tvResume").hidden=true}});
setChannel(defaultChannel())}

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
  window.addEventListener('message',event=>{
    const frame=$("#tvCommunityFrame");
    if(event.origin!=='https://www.youtube.com'||event.source!==frame?.contentWindow)return;
    let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}
    if(data?.event==='onReady'||data?.event==='initialDelivery')ytReady=true;
    if(typeof data?.info?.muted==='boolean'){ytPlayerMuted=data.info.muted;
      // Sonido cambiado desde los controles de YouTube: el icono del monitor lo refleja.
      if(ytState===1&&Date.now()-ytUnmuteAt>3000&&tvMuted!==data.info.muted){tvMuted=data.info.muted;paintMute()}}
    // Ni en silencio se permitió arrancar (p. ej. ahorro de energía): se reintenta y, si no, se ofrece Reproducir.
    if(data?.event==='onAutoplayBlocked'){sendYoutubeCommand('mute');sendYoutubeCommand('playVideo')}
    const playerState=data?.event==='onStateChange'?data.info:data?.event==='infoDelivery'?data.info?.playerState:null;
    if(playerState!=null)ytState=playerState;
    if(playerState===1){stopYoutubeWatch();$("#tvResume").hidden=true;if($("#tvLoadIndicator")?.dataset.state!=='notice')setStreamState('playing');if(!tvMuted&&ytPlayerMuted!==false&&Date.now()-ytUnmuteAt>3000)youtubeUnmute()}
    if(playerState===3)setStreamState('loading','Cargando señal…');
    // Pausa justo después de activar el sonido = el navegador lo bloqueó: se sigue en silencio.
    if(playerState===2&&document.visibilityState==='visible'){if(Date.now()-ytUnmuteAt<3000)youtubeKeepPlayingMuted();else showPlayFallback()}
    if(data?.event==='onError'){setStreamState('error','Video no disponible');$("#tvResume").hidden=false}
    if(data?.event==='onStateChange'&&data.info===0){communityVideoKey='';if(selected==='cpc')refreshCpc();else refreshSys()}
  });
  setInterval(()=>{if(document.visibilityState==='visible'&&selected!=='cpc')renderSysTransmission()},1000);
  // tv.js: Esc sale de la pantalla completa dentro de la app.
  document.addEventListener("keydown", e => { if(e.key==="Escape"){closeTvOptions();if(document.body.classList.contains("tv-fs"))exitTvPseudoFullscreen()} });
  // back-nav.js
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = stack.pop();
    if (top) closeModal(top);
  });
  new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => { if (tvActive && document.visibilityState === "visible") { refreshCatalog(); communityVideoKey=''; if(selected === "cpc") refreshCpc(); else { if(currentChannel()?.tipo==='VPS'){const v=$("#tvVideo");if(v&&!digitalNeedsGesture&&(v.paused||v.error))resumeDigital()} refreshSys(); } } });
}

// ---------- TV Capacitación: contexto desde el Panel ADM (Wix) ----------
let loadContext = null, pollTimer = null, contextGeneration = 0;
function stopCpcPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
async function refreshCpc() {
  if (!loadContext || cpcLoading) return;
  cpcLoading=true;
  const generation=contextGeneration;
  try { const next = await loadContext(); if (generation===contextGeneration && $("#tvMonitor")?.dataset.channel === "cpc") setTvContext(next); }
  catch (error) { console.warn("[CPC TV] TV Capacitación:", error);if(generation===contextGeneration&&selected==='cpc'&&!communityVideoKey)setStreamState('error','No se pudo cargar la señal'); }
  finally { if(generation===contextGeneration)cpcLoading=false; }
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
  contextGeneration++;context=null;cpcLoading=false;
  loadContext = typeof options.loadContext === "function" ? options.loadContext : null;
  stopCpcPolling();
  communityVideoKey = "";
  bindDocumentOnce();
  initTvOptions();
  initTv();
  clearInterval(catalogTimer);
  refreshCatalog();
  catalogTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshCatalog()},60000);
}
