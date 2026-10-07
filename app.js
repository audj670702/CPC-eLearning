import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';
import { tvMarkup, initCpcTv } from './cpc-tv.js?v=0.5.24';

const app = document.getElementById('app');
if (!app) throw new Error('No se encontró #app');

const SCAD_SITE_URL = 'https://www.scad.mx';
const CPC_CONTEXT_URL = 'https://www.scad.mx/_functions/cpcPwaContext';
const CPC_PROFILE_URL = 'https://www.scad.mx/_functions/cpcPwaProfile';

// Perfil SYS (SCaD_USR · app CPC): nombre visible, teléfono y avatar.
// null = aún no cargado; { ok:false } = sin usuario CPC activo.
let sysProfile = null;
let currentMemberData = null;
function initialsOf(name) { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || '·'; }
function identityName(member) { return (sysProfile?.ok && sysProfile.nombreVisible) || member?.name || 'Usuario'; }
function identityAvatarHtml(member, cls = 'identity-avatar') { const url = sysProfile?.ok ? sysProfile.avatar : ''; return url ? `<img class="${cls}" src="${url}" alt="">` : `<span class="${cls} identity-initials">${initialsOf(identityName(member))}</span>`; }

const URLS = {
  misCursos: 'challenges',
  catalogoCursos: 'https://www.scad.mx/e-learning',
  gymEntrenamiento: 'https://gym.scad.mx/',
  gymIcon: 'assets/logo_gym.png',
  certificacionInfospe: 'assets/cpc_certificacion.pdf',
  scadHub: SCAD_SITE_URL
};

function withWixReturnUrl(rawUrl) {
  const url = new URL(rawUrl, window.location.href);
  url.searchParams.set('mensaje', window.location.href);
  return url.toString();
}

function getMemberAreaUrl(member, pageSlug) {
  const memberSlug = String(member?.slug || '').trim();
  if (!memberSlug) return '#';
  const url = new URL(`${SCAD_SITE_URL}/members-area/${encodeURIComponent(memberSlug)}/${pageSlug}`);
  url.searchParams.set('disableScrollToTop', 'true');
  return withWixReturnUrl(url.toString());
}

const CONSTANCIAS = [
  { numero: '01', titulo: 'Constancia de convenio de capacitación', texto: 'Se entrega un convenio de capacitación por empresa participante, incluyendo identificación de la empresa, personal a capacitar, y fechas de inicio y término. Esta constancia permite la gestión de la constancia de capacitación emitida por INFOSPE para proceso de refrendo o permiso.', url: 'https://static.wixstatic.com/media/0492f8_4bf2740fb4904a42bb2f0398e35601e5~mv2.png' },
  { numero: '02', titulo: 'Constancia de personal en capacitación', texto: 'Se entrega al inicio de cada curso e incluye los nombres de los guardias inscritos, identificación del curso y fechas de inicio y fin. Esta constancia permite al INFOSPE dar seguimiento al compromiso del convenio.', url: 'assets/Constancia de capacitación.png' },
  { numero: '03', titulo: 'Constancia de acreditación del curso', texto: 'Se entrega al concluir el curso, certificando que el guardia cumplió asistencia y evaluación. Es emitida por INFOSPE con gestión de CPC y entregada a la empresa contratante.', url: 'https://static.wixstatic.com/media/0492f8_b4d47f78a89f4aa89aa4a7fcc91db3ca~mv2.png' },
  { numero: '04', titulo: 'Constancia de finalización del programa digital', texto: 'El participante accede al programa digital en la plataforma SCaD, con material didáctico y recursos interactivos. Al concluir satisfactoriamente las actividades, se genera automáticamente su constancia de finalización y la recibe en su correo electrónico.', url: 'https://static.wixstatic.com/media/0492f8_70e0da893a28473d95c91adfad88a645~mv2.png' }
];

const WIX = { clientId: '76bd3893-6f4b-4da9-bdc8-9c1d22513ee6', redirectUri: 'https://cpc.scad.mx/' };
const STORAGE = { oauth: 'cpc_wix_oauth_data', tokens: 'cpc_wix_member_tokens' };

function readStoredTokens() { try { return JSON.parse(localStorage.getItem(STORAGE.tokens) || 'null'); } catch { localStorage.removeItem(STORAGE.tokens); return null; } }
function saveTokens(value) { localStorage.setItem(STORAGE.tokens, JSON.stringify(value)); }
function clearSessionStorage() { localStorage.removeItem(STORAGE.oauth); localStorage.removeItem(STORAGE.tokens); }

let tokens = readStoredTokens();
const wixClient = createClient({ auth: OAuthStrategy({ clientId: WIX.clientId, ...(tokens ? { tokens } : {}) }) });

function tokenExpired(accessToken) {
  const expiresAt = Number(accessToken?.expiresAt || 0);
  if (!expiresAt) return false;
  const expiresMs = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return Date.now() >= expiresMs - 30000;
}

async function ensureFreshTokens() {
  if (!tokens?.refreshToken?.value || !tokenExpired(tokens.accessToken)) return tokens;
  const renewed = await wixClient.auth.renewToken(tokens.refreshToken);
  wixClient.auth.setTokens(renewed); tokens = renewed; saveTokens(renewed); return renewed;
}

async function finishOAuthCallbackIfNeeded() {
  if (!window.location.hash || (!window.location.hash.includes('code=') && !window.location.hash.includes('error='))) return;
  const stored = JSON.parse(localStorage.getItem(STORAGE.oauth) || 'null');
  const returned = wixClient.auth.parseFromUrl();
  if (returned.error) { clearSessionStorage(); history.replaceState({}, document.title, window.location.pathname + window.location.search); throw new Error(returned.errorDescription || returned.error); }
  if (!stored) { history.replaceState({}, document.title, window.location.pathname + window.location.search); throw new Error('No se encontró el estado OAuth guardado.'); }
  const memberTokens = await wixClient.auth.getMemberTokens(returned.code, returned.state, stored);
  wixClient.auth.setTokens(memberTokens); tokens = memberTokens; saveTokens(memberTokens); localStorage.removeItem(STORAGE.oauth);
  history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

async function getCurrentMember() {
  if (!tokens?.accessToken?.value) return null;
  try { await ensureFreshTokens(); } catch { clearSessionStorage(); tokens = null; return null; }
  const response = await fetch('https://www.wixapis.com/members/v1/members/my?fieldSet=FULL', { headers: { Authorization: tokens.accessToken.value, 'Content-Type': 'application/json' } });
  if (response.status === 401 || response.status === 403) { clearSessionStorage(); tokens = null; return null; }
  if (!response.ok) throw new Error(`No fue posible leer el miembro Wix (${response.status}).`);
  return (await response.json()).member || null;
}

function normalizeMember(member) {
  if (!member) return null;
  const contact = member.contact || {}; const profile = member.profile || {};
  const firstName = contact.firstName || profile.firstName || ''; const lastName = contact.lastName || profile.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return { id: member.id, name: fullName || profile.nickname || member.loginEmail || 'Usuario', email: member.loginEmail || '', avatar: profile.photo?.url || profile.photo?.image?.url || profile.image?.url || '', slug: profile.slug || '' };
}

function constanciasHtml() {
  return CONSTANCIAS.map((item) => `<article class="infospe-cert-card"><a class="infospe-doc-thumb infospe-cert-thumb" href="${item.url}" target="_blank" rel="noopener noreferrer" aria-label="Ver ${item.titulo}"><img src="${item.url}" alt="${item.titulo}"><span class="infospe-thumb-action">Ver documento</span></a><div class="infospe-cert-copy"><div class="infospe-cert-title-row"><span class="infospe-cert-number">${item.numero}</span><strong>${item.titulo}</strong></div><p>${item.texto}</p></div></article>`).join('');
}

function render(member) {
  currentMemberData = member;
  const sessionControl = member ? `<div class="member-control"><button class="member-trigger menu-trigger" type="button" aria-expanded="false" aria-label="Menú"><span class="menu-icon" aria-hidden="true"><span></span><span></span><span></span></span></button><nav class="member-menu" aria-label="Cuenta SCaD" hidden><span class="member-email">${member.email}</span><button class="member-menu-link profile-open-btn" type="button">Editar perfil</button><button class="member-menu-link constancias-open-btn" type="button">Mis constancias</button><a class="member-menu-link" href="${getMemberAreaUrl(member, 'my-account')}">Mi Perfil SCaD</a><a class="member-menu-link" href="${getMemberAreaUrl(member, 'my-subscriptions')}">Mis suscripciones</a><a class="member-menu-link" href="${getMemberAreaUrl(member, 'my-wallet')}">Mis formas de pago</a><a class="member-menu-link" href="${getMemberAreaUrl(member, 'my-groups')}">Mis grupos</a><a class="member-menu-link" href="${withWixReturnUrl(URLS.scadHub)}">SCaD HUB</a><div class="member-menu-separator" aria-hidden="true"></div><button class="logout-btn" type="button">Cerrar sesión</button></nav></div>` : '<button class="session-btn" type="button">Iniciar sesión</button>';

  app.innerHTML = `<div class="app-shell">
    <header class="topbar"><div class="brand"><img src="assets/icon-192.png" alt="CPC"><strong>CPC e-Learning</strong></div><div class="top-actions">${sessionControl}</div></header>
    <main class="home-cpc">
      <div class="tv-home top-band">
        <div class="top-band-left">${member ? identityCardMarkup(member) : ''}<button class="install-btn tv-install-btn" type="button" disabled>Instalar app</button></div>
        ${tvMarkup()}
      </div>
      <section class="modules-section" aria-label="Accesos CPC e-Learning">
        <button class="module-card accent-blue" type="button"><span class="module-icon">✉</span><span class="module-copy"><strong>MENSAJERÍA</strong><small>Comunicación CPC</small></span><span class="arrow">›</span></button>
        <a class="module-card accent-navy" href="${member ? getMemberAreaUrl(member, URLS.misCursos) : '#'}" data-requires-member="true"><span class="module-icon">🧑‍💻</span><span class="module-copy"><strong>MIS CURSOS</strong><small>Programas en curso</small></span><span class="arrow">›</span></a>
        <a class="module-card accent-green" href="${withWixReturnUrl(URLS.catalogoCursos)}"><span class="module-icon">📚</span><span class="module-copy"><strong>CATÁLOGO DE CURSOS</strong><small>Explora la oferta de capacitación</small></span><span class="arrow">›</span></a>
        <button class="module-card accent-purple" type="button"><span class="module-icon">📆</span><span class="module-copy"><strong>CALENDARIO</strong><small>Fechas de clases</small></span><span class="arrow">›</span></button>
        <button class="module-card accent-infospe infospe-module" type="button"><span class="module-icon module-logo"><img src="assets/logo_infospe.png" alt="INFOSPE"></span><span class="module-copy"><strong>INFOSPE - SEGURIDAD PRIVADA</strong><small>Acreditación y constancias</small></span><span class="arrow">›</span></button>
        <a class="module-card accent-orange" href="${URLS.gymEntrenamiento}"><span class="module-icon module-logo"><img src="${URLS.gymIcon}" alt="GYM Entrenamiento"></span><span class="module-copy"><strong>GYM ENTRENAMIENTO</strong><small>Acceso a entrenamiento</small></span><span class="arrow">›</span></a>
      </section>
    </main>
    <footer class="app-footer"><div class="powered-by"><span>Powered by</span><img src="assets/logo_scad_hub.png" alt="SCaD HUB"></div><span class="version">v0.5.0 | 2026</span></footer>
  </div>
  <div class="infospe-modal" id="infospeModal" hidden><div class="infospe-panel"><div class="infospe-panel-top"><div class="infospe-heading"><img src="assets/logo_infospe.png" alt="INFOSPE"><div><strong>INFOSPE - Seguridad Privada</strong><span>Curso Básico de Profesionalización</span></div></div><button class="infospe-close" type="button" aria-label="Cerrar">×</button></div><div class="infospe-content"><section class="infospe-info-block infospe-intro-layout"><div class="infospe-info-copy"><p>La normatividad en el Estado de Guanajuato establece la obligación a la empresas de seguridad privada que cumplan un programa de capacitación basado en la currícula que el INFOSPE establece.</p><p>Este requisito se cumple acreditando la aprobación del Curso Básico de Profesionalización en Materia de Seguridad Privada.</p><p>El curso es presencial con apoyo en plataformas digitales y sesiones virtuales.</p><p>El período de impartición del curso base se realiza en 15 semanas.</p><p>De acuerdo a los requerimientos de la empresa, se puede impartir el curso en períodos convenientes para el cliente.</p></div><div class="infospe-accreditation-inline"><strong>Acreditación</strong><a class="infospe-doc-thumb infospe-accreditation-thumb" href="${URLS.certificacionInfospe}" target="_blank" rel="noopener noreferrer" aria-label="Ver acreditación CPC INFOSPE"><span class="infospe-pdf-preview"><iframe src="${URLS.certificacionInfospe}#toolbar=0&navpanes=0&scrollbar=0&view=FitH" title="Vista previa de acreditación CPC INFOSPE" tabindex="-1"></iframe></span><span class="infospe-thumb-action">Ver documento</span></a></div></section><section class="infospe-commercial"><div class="infospe-commercial-row"><strong>Precio regular:</strong><p>$ 6,900.00 + IVA por persona.</p></div><div class="infospe-commercial-row infospe-commercial-long"><strong>Garantía de Inversión:</strong><div><p>La política de GARANTÍA DE INVERSIÓN consiste en que, si por cualquier motivo un participante inscrito no concluye el curso, se bonifica el pago realizado a favor de otro participante en el siguiente curso.</p><p>La validez de esta política de inversión está sujeta a que la inscripción del nuevo participante se realice en el curso inmediato y se inscriba de manera regular a otro participante. Aplica sólo en precio regular.</p><p>El pago se realiza al momento de la inscripción del guardia al curso.</p><p>En el caso de convenios de capacitación en grupos diferidos (inscripción de guardias en diferentes fechas), se realiza el pago del 20% a la firma del convenio y el 80% de cada guardia conforme se vayan inscribiendo. El primer grupo se paga al 100%.</p></div></div></section><section class="infospe-constancias"><h3>Constancias que emitimos</h3><p class="infospe-intro">Documentamos formalmente cada etapa del proceso de capacitación, brindando certeza a las empresas de seguridad privada y a su personal.</p><div class="infospe-cert-list">${constanciasHtml()}</div></section></div></div></div>`;
  if (member) app.insertAdjacentHTML('beforeend', profileModalMarkup());
  bindUI(); initTv(member);
}

// Editar perfil (modelo Nexus): nombre visible, teléfono y avatar en SCaD_USR.
function profileModalMarkup() {
  return `<div class="profile-backdrop" id="profileModal" hidden><section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
    <button class="profile-close" type="button" aria-label="Cerrar">×</button>
    <div class="profile-head"><span class="profile-avatar" id="profileAvatar"></span><div><span class="profile-kicker">PERFIL</span><h2 id="profileModalTitle">Editar perfil</h2></div></div>
    <div class="profile-form">
      <label>Nombre visible<input id="profileName" type="text" maxlength="80" autocomplete="name"></label>
      <label>Teléfono / WhatsApp<input id="profilePhone" type="tel" maxlength="30" autocomplete="tel"></label>
      <div class="profile-photo-field"><span class="profile-photo-label">Avatar</span><input id="profileAvatarFile" class="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp">
        <div class="profile-photo-actions"><button id="btnChooseProfilePhoto" class="profile-photo-button" type="button">Cargar foto</button><button id="btnTakeProfilePhoto" class="profile-photo-button" type="button">Tomar foto</button></div>
        <span class="profile-photo-help">Selecciona una imagen del dispositivo o usa la cámara.</span></div>
      <div class="profile-fixed"><span>Correo</span><strong id="profileEmail">—</strong></div>
    </div>
    <div class="profile-message" id="profileMessage" hidden></div>
    <div class="profile-actions"><button class="profile-button secondary" id="btnCancelProfile" type="button">Cancelar</button><button class="profile-button primary" id="btnSaveProfile" type="button">Guardar</button></div>
  </section></div>`;
}

// Tarjeta de identidad (avatar con lápiz para editar el perfil).
function identityCardMarkup(member) {
  return `<section class="identity-card" aria-label="Identidad del usuario"><div class="identity-avatar-wrap"><span class="identity-avatar-holder">${identityAvatarHtml(member, 'identity-avatar')}</span><button class="identity-edit profile-open-btn" type="button" aria-label="Editar perfil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></button></div><div class="identity-copy"><strong class="identity-name">${identityName(member)}</strong><span class="identity-email">${member.email || ''}</span></div></section>`;
}

function refreshIdentity() {
  const member = currentMemberData; if (!member) return;
  const holder = app.querySelector('.identity-avatar-holder'); if (holder) holder.innerHTML = identityAvatarHtml(member, 'identity-avatar');
  const nameEl = app.querySelector('.identity-name'); if (nameEl) nameEl.textContent = identityName(member);
}

function paintProfileAvatar(url) {
  const el = document.getElementById('profileAvatar'); if (!el) return;
  el.style.backgroundImage = url ? `url("${String(url).replace(/"/g, '%22')}")` : '';
  el.textContent = url ? '' : initialsOf(document.getElementById('profileName')?.value || identityName(currentMemberData));
}

// Reduce la imagen (máx. 800 px, JPEG) antes de enviarla.
function resizeImageFile(file, max = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer la imagen.'));
    reader.onload = () => { const img = new Image(); img.onerror = () => reject(new Error('Formato de imagen no válido.')); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.86)); }; img.src = reader.result; };
    reader.readAsDataURL(file);
  });
}

function bindProfile() {
  const modal = document.getElementById('profileModal'); const openBtns = app.querySelectorAll('.profile-open-btn'); if (!modal || !openBtns.length) return;
  const fileInput = document.getElementById('profileAvatarFile'); const msg = document.getElementById('profileMessage'); const saveBtn = document.getElementById('btnSaveProfile');
  let pendingPhoto = null;
  const showMsg = (text) => { msg.textContent = text || ''; msg.hidden = !text; };
  const close = () => { modal.hidden = true; document.body.classList.remove('modal-open'); };
  const open = async () => {
    app.querySelector('.member-menu').hidden = true; app.querySelector('.member-trigger')?.setAttribute('aria-expanded', 'false');
    await sysSessionReady.catch(() => null);
    pendingPhoto = null; fileInput.value = ''; showMsg('');
    document.getElementById('profileName').value = identityName(currentMemberData);
    document.getElementById('profilePhone').value = (sysProfile?.ok && sysProfile.telefono) || '';
    document.getElementById('profileEmail').textContent = currentMemberData?.email || '—';
    paintProfileAvatar(sysProfile?.ok ? sysProfile.avatar : '');
    const enabled = Boolean(sysProfile?.ok); saveBtn.disabled = !enabled;
    document.getElementById('btnChooseProfilePhoto').disabled = !enabled; document.getElementById('btnTakeProfilePhoto').disabled = !enabled;
    if (!enabled) showMsg(sysProfile?.mensaje || 'Tu usuario CPC aún no está activo. Consulta con la administración de CPC.');
    modal.hidden = false; document.body.classList.add('modal-open');
  };
  openBtns.forEach((btn) => btn.addEventListener('click', open));
  modal.querySelector('.profile-close').addEventListener('click', close);
  document.getElementById('btnCancelProfile').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.getElementById('btnChooseProfilePhoto').addEventListener('click', () => { fileInput.removeAttribute('capture'); fileInput.click(); });
  document.getElementById('btnTakeProfilePhoto').addEventListener('click', () => { fileInput.setAttribute('capture', 'user'); fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; if (!file) return;
    try { pendingPhoto = await resizeImageFile(file); paintProfileAvatar(pendingPhoto); showMsg(''); } catch (error) { pendingPhoto = null; showMsg(error.message); }
  });
  saveBtn.addEventListener('click', async () => {
    const nombreVisible = document.getElementById('profileName').value.trim(); const telefono = document.getElementById('profilePhone').value.trim();
    const payload = { nombreVisible, telefono }; if (pendingPhoto) payload.foto = { base64: pendingPhoto, mimeType: 'image/jpeg', fileName: 'avatar.jpg' };
    try {
      saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; showMsg('');
      const fresh = await ensureFreshTokens().catch(() => tokens); const accessToken = fresh?.accessToken?.value || tokens?.accessToken?.value || '';
      const response = await fetch(CPC_PROFILE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CPC-Session': accessToken }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true) throw new Error(data?.mensaje || 'No fue posible guardar el perfil.');
      sysProfile = { ok: true, nombreVisible: data.nombreVisible || nombreVisible, telefono: data.telefono ?? telefono, avatar: data.avatar || sysProfile?.avatar || '' };
      refreshIdentity(); close();
    } catch (error) { showMsg(error.message); } finally { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }
  });
}

// Monitor TV: canal "TV Capacitación" (predeterminado, configurado desde el Panel CPC) + "TV Digital Internet".
// El canal CPC se lee del contexto cpcPwaContext (campo tv) del miembro en sesión.
async function loadCpcTvContext() {
  // Sólo consulta (sin ?primeraEntrada=1). Espera a que termine el arranque de sesión.
  await sysSessionReady.catch(() => null);
  const fresh = await ensureFreshTokens().catch(() => tokens);
  const accessToken = fresh?.accessToken?.value || tokens?.accessToken?.value || '';
  if (!accessToken) throw new Error('Inicia sesión para continuar.');
  const response = await fetch(CPC_CONTEXT_URL + '?t=' + Date.now(), { cache: 'no-store', headers: { 'X-CPC-Session': accessToken } });
  const data = await response.json().catch(() => ({ ok: false, mensaje: 'HTTP ' + response.status }));
  if (!response.ok || !data?.ok) throw new Error(data?.mensaje || ('Contexto CPC ' + response.status));
  return data;
}

function initTv(member) {
  const memberId = String(member?.id || '').trim();
  initCpcTv({ loadContext: memberId ? () => loadCpcTvContext() : null });
}

function bindUI() {
  bindProfile();
  const memberTrigger = app.querySelector('.member-trigger'); const memberMenu = app.querySelector('.member-menu'); const sessionBtn = app.querySelector('.session-btn'); const logoutBtn = app.querySelector('.logout-btn'); const infospeModule = app.querySelector('.infospe-module'); const infospeModal = document.getElementById('infospeModal'); const infospeClose = app.querySelector('.infospe-close');
  infospeModule?.addEventListener('click', () => { infospeModal.hidden = false; document.body.classList.add('modal-open'); });
  infospeClose?.addEventListener('click', () => { infospeModal.hidden = true; document.body.classList.remove('modal-open'); });
  infospeModal?.addEventListener('click', (event) => { if (event.target === infospeModal) { infospeModal.hidden = true; document.body.classList.remove('modal-open'); } });
  memberTrigger?.addEventListener('click', () => { const open = memberTrigger.getAttribute('aria-expanded') === 'true'; memberTrigger.setAttribute('aria-expanded', String(!open)); memberMenu.hidden = open; });
  sessionBtn?.addEventListener('click', async () => { try { sessionBtn.disabled = true; sessionBtn.textContent = 'Conectando…'; const oauthData = wixClient.auth.generateOAuthData(WIX.redirectUri, window.location.href.split('#')[0]); localStorage.setItem(STORAGE.oauth, JSON.stringify(oauthData)); const { authUrl } = await wixClient.auth.getAuthUrl(oauthData); window.location.href = authUrl; } catch (error) { console.error(error); sessionBtn.disabled = false; sessionBtn.textContent = 'Iniciar sesión'; alert('No fue posible abrir el inicio de sesión de Wix.'); } });
  logoutBtn?.addEventListener('click', async () => { try { logoutBtn.disabled = true; logoutBtn.textContent = 'Cerrando…'; const { logoutUrl } = await wixClient.auth.logout(WIX.redirectUri); clearSessionStorage(); window.location.href = logoutUrl; } catch (error) { console.error(error); clearSessionStorage(); window.location.href = WIX.redirectUri; } });
}

// Primera entrada SYS: con la sesión Wix validada, el backend vincula al alumno
// (correo + acceso directo de la EO) y activa sus inscripciones en espera.
// Es el ÚNICO disparador de la primera entrada (los demás módulos sólo consultan).
let sysSessionReady = Promise.resolve();
async function syncSysSession() {
  const fresh = await ensureFreshTokens().catch(() => tokens);
  const accessToken = fresh?.accessToken?.value || tokens?.accessToken?.value || '';
  if (!accessToken) return;
  const response = await fetch(CPC_CONTEXT_URL + '?primeraEntrada=1&t=' + Date.now(), { cache: 'no-store', headers: { 'X-CPC-Session': accessToken } });
  const data = await response.json().catch(() => null);
  sysProfile = data?.ok
    ? { ok: true, nombreVisible: data.usuario?.nombreVisibleSys || '', telefono: data.usuario?.telefono || '', avatar: data.usuario?.avatar || '' }
    : { ok: false, mensaje: data?.mensaje || '' };
  refreshIdentity();
}

async function boot() { try { await finishOAuthCallbackIfNeeded(); const rawMember = await getCurrentMember(); if (rawMember) { sysSessionReady = syncSysSession().catch((error) => console.warn('CPC primera entrada:', error)); } render(normalizeMember(rawMember)); } catch (error) { console.error('CPC auth:', error); render(null); } }
boot();
