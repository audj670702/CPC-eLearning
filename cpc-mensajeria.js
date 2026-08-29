import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';

const API_BASE = 'https://www.scad.mx/_functions';
const CLIENT_ID = '76bd3893-6f4b-4da9-bdc8-9c1d22513ee6';
const TOKEN_KEY = 'cpc_wix_member_tokens';
const POLL_MS = 30000;

const sounds = {
  sent: new Audio('assets/Mensaje.mp3'),
  pending: new Audio('assets/mensaje-pendiente.mp3')
};
Object.values(sounds).forEach((audio) => { audio.preload = 'auto'; });

let activeConversation = null;
let inboxConversations = [];
let previousPending = null;
let pendingSoundBlocked = false;
let pollTimer = null;
let searchTimer = null;

function readTokens() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); }
  catch { return null; }
}

function tokenExpired(accessToken) {
  const expiresAt = Number(accessToken?.expiresAt || 0);
  if (!expiresAt) return false;
  const expiresMs = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return Date.now() >= expiresMs - 30000;
}

async function getAccessToken() {
  let tokens = readTokens();
  if (!tokens?.accessToken?.value) return '';
  if (!tokenExpired(tokens.accessToken)) return tokens.accessToken.value;
  if (!tokens?.refreshToken?.value) return '';

  const client = createClient({ auth: OAuthStrategy({ clientId: CLIENT_ID, tokens }) });
  try {
    const renewed = await client.auth.renewToken(tokens.refreshToken);
    localStorage.setItem(TOKEN_KEY, JSON.stringify(renewed));
    return renewed?.accessToken?.value || '';
  } catch {
    return '';
  }
}

async function api(path, options = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Inicia sesión para usar Mensajería.');

  const response = await fetch(`${API_BASE}/${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Authorization: accessToken,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.error || `No fue posible completar la operación (${response.status}).`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es-MX');
}

function formatDate(value, withTime = false) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', withTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }
  ).format(date);
}

function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function playSound(name) {
  const audio = sounds[name];
  if (!audio) return false;
  try {
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

async function announcePendingIfNeeded(total) {
  const next = Math.max(0, Number(total) || 0);
  if (previousPending === null) {
    previousPending = next;
    updateBadge(next);
    return;
  }

  if (next > previousPending) {
    const played = await playSound('pending');
    pendingSoundBlocked = !played;
  }
  previousPending = next;
  updateBadge(next);
}

function updateBadge(total) {
  const badge = document.getElementById('cpcMsgBadge');
  if (!badge) return;
  const n = Math.max(0, Number(total) || 0);
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
}

function findMessagingCard() {
  return [...document.querySelectorAll('.module-card')].find((card) =>
    card.querySelector('.module-copy strong')?.textContent?.trim().toUpperCase() === 'MENSAJERÍA'
  ) || null;
}

function bindMessagingCard() {
  const card = findMessagingCard();
  if (!card || card.dataset.cpcMessagingBound === 'true') return false;
  card.dataset.cpcMessagingBound = 'true';
  card.classList.add('cpc-msg-card');
  if (!card.querySelector('#cpcMsgBadge')) {
    card.insertAdjacentHTML('beforeend', '<span id="cpcMsgBadge" class="cpc-msg-badge" hidden>0</span>');
  }
  card.addEventListener('click', openMessaging);
  return true;
}

function ensureModal() {
  if (document.getElementById('cpcMessagingModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="cpcMessagingModal" class="cpc-msg-modal" hidden>
      <div id="cpcMsgShell" class="cpc-msg-shell" role="dialog" aria-modal="true" aria-label="Mensajería CPC">
        <section class="cpc-msg-sidebar">
          <div class="cpc-msg-top"><strong>Mensajería</strong><button id="cpcMsgClose" class="cpc-msg-close" type="button" aria-label="Cerrar">×</button></div>
          <div class="cpc-msg-shortcuts">
            <button id="cpcMsgSystem" class="cpc-msg-shortcut" type="button">⚙️ SISTEMA</button>
            <button id="cpcMsgAdmin" class="cpc-msg-shortcut primary" type="button">👨🏻‍💼 ATENCIÓN</button>
            <button id="cpcMsgContacts" class="cpc-msg-shortcut" type="button">👥 CONTACTOS</button>
          </div>
          <div id="cpcMsgSearch" class="cpc-msg-search" hidden>
            <input id="cpcMsgSearchInput" type="search" placeholder="Nombre completo o correo exacto" autocomplete="off">
            <div id="cpcMsgSearchResults" class="cpc-msg-search-results"><div class="cpc-msg-empty">Escribe el nombre completo o correo exacto.</div></div>
          </div>
          <div id="cpcMsgList" class="cpc-msg-list"><div class="cpc-msg-empty">Cargando conversaciones…</div></div>
        </section>

        <section class="cpc-msg-thread">
          <div class="cpc-msg-thread-head">
            <button id="cpcMsgBack" class="cpc-msg-back" type="button" aria-label="Volver">‹</button>
            <div class="cpc-msg-thread-title"><strong id="cpcMsgThreadName">Selecciona una conversación</strong><small id="cpcMsgThreadType"></small></div>
          </div>
          <div id="cpcMsgMessages" class="cpc-msg-messages"><div class="cpc-msg-placeholder">Selecciona una conversación para ver los mensajes.</div></div>
          <form id="cpcMsgComposer" class="cpc-msg-composer" hidden>
            <textarea id="cpcMsgInput" maxlength="2000" placeholder="Escribe un mensaje…" required></textarea>
            <button id="cpcMsgSend" class="cpc-msg-send" type="submit">Enviar</button>
          </form>
          <div id="cpcMsgReadonly" class="cpc-msg-readonly" hidden>Este canal es únicamente informativo.</div>
        </section>
      </div>
    </div>`);

  document.getElementById('cpcMsgClose')?.addEventListener('click', closeMessaging);
  document.getElementById('cpcMessagingModal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeMessaging();
  });
  document.getElementById('cpcMsgBack')?.addEventListener('click', () => {
    document.getElementById('cpcMsgShell')?.classList.remove('thread-open');
  });
  document.getElementById('cpcMsgSystem')?.addEventListener('click', openSystem);
  document.getElementById('cpcMsgAdmin')?.addEventListener('click', openAdministration);
  document.getElementById('cpcMsgContacts')?.addEventListener('click', openContacts);
  document.getElementById('cpcMsgSearchInput')?.addEventListener('input', scheduleUserSearch);
  document.getElementById('cpcMsgComposer')?.addEventListener('submit', sendMessage);
}

function setShortcutActive(id) {
  document.querySelectorAll('.cpc-msg-shortcut').forEach((button) => button.classList.remove('primary'));
  document.getElementById(id)?.classList.add('primary');
}

async function openMessaging() {
  if (!readTokens()?.accessToken?.value) {
    document.querySelector('.session-btn')?.click();
    return;
  }
  ensureModal();
  const modal = document.getElementById('cpcMessagingModal');
  modal.hidden = false;
  document.body.classList.add('modal-open');
  await loadInbox();
  await openAdministration();
}

function closeMessaging() {
  const modal = document.getElementById('cpcMessagingModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
  document.getElementById('cpcMsgShell')?.classList.remove('thread-open');
  activeConversation = null;
}

function renderInbox(conversations = []) {
  const list = document.getElementById('cpcMsgList');
  if (!list) return;
  if (!conversations.length) {
    list.innerHTML = '<div class="cpc-msg-empty">No hay conversaciones todavía.</div>';
    return;
  }
  list.innerHTML = conversations.map((item) => `
    <button class="cpc-msg-item${activeConversation?.conversationId === item.conversationId ? ' active' : ''}" type="button" data-conversation-id="${escapeHtml(item.conversationId)}">
      <strong>${escapeHtml(item.nombre || 'Conversación')}</strong>
      ${Number(item.noLeidos || 0) > 0 ? `<span class="cpc-msg-count">${Math.min(99, Number(item.noLeidos || 0))}</span>` : ''}
      <small>${escapeHtml(item.ultimoMensaje || 'Sin mensajes')}</small>
      <span>${formatDate(item.fechaUltimoMensaje, true)}</span>
    </button>`).join('');
  list.querySelectorAll('.cpc-msg-item').forEach((button) => {
    button.addEventListener('click', () => openThread(button.dataset.conversationId));
  });
}

async function loadInbox() {
  const list = document.getElementById('cpcMsgList');
  if (list) list.innerHTML = '<div class="cpc-msg-empty">Cargando conversaciones…</div>';
  try {
    const data = await api('cpcMensajeriaBandeja');
    inboxConversations = data.conversations || [];
    renderInbox(inboxConversations);
    previousPending = Number(data.totalNoLeidos || 0);
    updateBadge(previousPending);
  } catch (error) {
    if (list) list.innerHTML = `<div class="cpc-msg-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function openAdministration() {
  setShortcutActive('cpcMsgAdmin');
  document.getElementById('cpcMsgSearch')?.setAttribute('hidden', '');
  try {
    const data = await api('cpcMensajeriaAdministracion', { method: 'POST', body: '{}' });
    await loadInbox();
    await openThread(data.conversationId, { forceName: 'ATENCIÓN AL USUARIO' });
  } catch (error) {
    window.alert(error.message);
  }
}

async function openSystem() {
  setShortcutActive('cpcMsgSystem');
  document.getElementById('cpcMsgSearch')?.setAttribute('hidden', '');
  const systemConversation = inboxConversations.find((item) => String(item.tipoConversacion || '').toUpperCase() === 'SISTEMA');
  if (systemConversation?.conversationId) {
    await openThread(systemConversation.conversationId, { forceName: 'SISTEMA' });
    return;
  }

  activeConversation = { tipoConversacion: 'SISTEMA', permiteRespuesta: false };
  document.getElementById('cpcMsgThreadName').textContent = 'SISTEMA';
  document.getElementById('cpcMsgThreadType').textContent = 'Avisos del sistema';
  document.getElementById('cpcMsgMessages').innerHTML = '<div class="cpc-msg-placeholder">Aún no hay avisos del sistema.</div>';
  document.getElementById('cpcMsgComposer').hidden = true;
  document.getElementById('cpcMsgReadonly').hidden = false;
  document.getElementById('cpcMsgShell')?.classList.add('thread-open');
}

function openContacts() {
  setShortcutActive('cpcMsgContacts');
  const box = document.getElementById('cpcMsgSearch');
  const input = document.getElementById('cpcMsgSearchInput');
  const results = document.getElementById('cpcMsgSearchResults');
  if (!box || !input || !results) return;
  box.hidden = false;
  input.value = '';
  results.innerHTML = '<div class="cpc-msg-empty">Escribe el nombre completo o correo exacto.</div>';
  input.focus();
}

function scheduleUserSearch(event) {
  window.clearTimeout(searchTimer);
  const term = String(event.target.value || '').trim();
  const results = document.getElementById('cpcMsgSearchResults');
  if (!term) {
    if (results) results.innerHTML = '<div class="cpc-msg-empty">Escribe el nombre completo o correo exacto.</div>';
    return;
  }
  searchTimer = window.setTimeout(() => searchUsers(term), 300);
}

async function searchUsers(term) {
  const results = document.getElementById('cpcMsgSearchResults');
  if (!results) return;
  const exactTerm = normalize(term);
  if (!exactTerm) {
    results.innerHTML = '<div class="cpc-msg-empty">Escribe el nombre completo o correo exacto.</div>';
    return;
  }

  results.innerHTML = '<div class="cpc-msg-empty">Buscando coincidencia exacta…</div>';
  try {
    const data = await api(`cpcMensajeriaUsuarios?q=${encodeURIComponent(String(term || '').trim())}`);
    const exactUsers = (data.users || []).filter((user) =>
      normalize(user.nombreCompleto) === exactTerm || normalize(user.email) === exactTerm
    ).slice(0, 1);

    results.innerHTML = exactUsers.length ? exactUsers.map((user) => `
      <button class="cpc-msg-user" type="button" data-member-id="${escapeHtml(user.memberId)}">
        <strong>${escapeHtml(user.nombreCompleto || 'Usuario CPC')}</strong>
        <small>${escapeHtml(user.email || '')}</small>
      </button>`).join('') : '<div class="cpc-msg-empty">No existe una coincidencia exacta.</div>';

    results.querySelectorAll('.cpc-msg-user').forEach((button) => {
      button.addEventListener('click', () => createDirectConversation(button.dataset.memberId));
    });
  } catch (error) {
    results.innerHTML = `<div class="cpc-msg-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function createDirectConversation(targetMemberId) {
  try {
    const data = await api('cpcMensajeriaCrearConversacion', {
      method: 'POST',
      body: JSON.stringify({ targetMemberId })
    });
    document.getElementById('cpcMsgSearch')?.setAttribute('hidden', '');
    await loadInbox();
    await openThread(data.conversationId);
  } catch (error) {
    window.alert(error.message);
  }
}

function renderMessages(messages = []) {
  const container = document.getElementById('cpcMsgMessages');
  if (!container) return;
  if (!messages.length) {
    container.innerHTML = '<div class="cpc-msg-placeholder">Aún no hay mensajes en esta conversación.</div>';
    return;
  }

  const currentMemberId = activeConversation?.currentMemberId || '';
  let lastDay = '';
  container.innerHTML = messages.map((message) => {
    const key = dayKey(message.fechaEnvio);
    const divider = key !== lastDay ? `<div class="cpc-msg-day">${formatDate(message.fechaEnvio)}</div>` : '';
    lastDay = key;
    const mine = message.remitenteId === currentMemberId;
    return `${divider}<article class="cpc-msg-bubble${mine ? ' mine' : ''}">
      ${mine ? '' : `<strong>${escapeHtml(message.remitenteNombreVisible || 'CPC')}</strong>`}
      <p>${escapeHtml(message.mensaje || '')}</p>
      <time>${formatDate(message.fechaEnvio, true)}</time>
    </article>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function openThread(conversationId, options = {}) {
  if (!conversationId) return;
  try {
    const data = await api(`cpcMensajeriaMensajes?conversationId=${encodeURIComponent(conversationId)}`);
    activeConversation = data.conversation || { conversationId };

    const memberData = await fetch('https://www.wixapis.com/members/v1/members/my?fieldSet=BASIC', {
      headers: { Authorization: await getAccessToken() }, cache: 'no-store'
    }).then((r) => r.ok ? r.json() : null).catch(() => null);
    activeConversation.currentMemberId = memberData?.member?.id || '';

    document.getElementById('cpcMsgThreadName').textContent = options.forceName || activeConversation.nombre || 'Conversación';
    document.getElementById('cpcMsgThreadType').textContent = activeConversation.tipoConversacion === 'SISTEMA' ? 'Avisos del sistema' : '';
    renderMessages(data.messages || []);

    const composer = document.getElementById('cpcMsgComposer');
    const readonly = document.getElementById('cpcMsgReadonly');
    const canReply = activeConversation.permiteRespuesta !== false && activeConversation.tipoConversacion !== 'SISTEMA';
    composer.hidden = !canReply;
    readonly.hidden = canReply;
    document.getElementById('cpcMsgShell')?.classList.add('thread-open');

    await api('cpcMensajeriaMarcarLeida', {
      method: 'POST',
      body: JSON.stringify({ conversationId })
    }).catch(() => null);
    await refreshPending(false);
    await loadInbox();
  } catch (error) {
    window.alert(error.message);
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (!activeConversation?.conversationId) return;
  const input = document.getElementById('cpcMsgInput');
  const button = document.getElementById('cpcMsgSend');
  const mensaje = String(input?.value || '').trim();
  if (!mensaje) return;

  try {
    button.disabled = true;
    await api('cpcMensajeriaEnviar', {
      method: 'POST',
      body: JSON.stringify({ conversationId: activeConversation.conversationId, mensaje })
    });
    input.value = '';
    await playSound('sent');
    await openThread(activeConversation.conversationId);
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function refreshPending(announce = true) {
  if (!readTokens()?.accessToken?.value) {
    previousPending = null;
    updateBadge(0);
    return;
  }
  try {
    const data = await api('cpcMensajeriaPendientes');
    if (announce) await announcePendingIfNeeded(data.total || 0);
    else {
      previousPending = Number(data.total || 0);
      updateBadge(previousPending);
    }
  } catch {
    // El sondeo nunca debe afectar el acceso normal a CPC.
  }
}

function startPolling() {
  window.clearInterval(pollTimer);
  refreshPending(false);
  pollTimer = window.setInterval(() => refreshPending(true), POLL_MS);
}

function initialize() {
  ensureModal();
  if (!bindMessagingCard()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (bindMessagingCard() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
  startPolling();
}

document.addEventListener('click', async () => {
  if (pendingSoundBlocked) {
    const played = await playSound('pending');
    if (played) pendingSoundBlocked = false;
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('cpcMessagingModal')?.hidden) closeMessaging();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();