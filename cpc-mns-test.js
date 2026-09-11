import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';

const CHANNEL = 'MNS_FRONTEND';
const MNS_FRAME_URL = 'mns-frontend-v052.html?v=0.5.4';
const MNS_INVOKE_URL = 'https://www.wixapis.com/velo/v1/http/invoke/mnsBridge';

const CLIENT_ID = '76bd3893-6f4b-4da9-bdc8-9c1d22513ee6';
const TOKEN_KEY = 'cpc_wix_member_tokens';

const MNS_CONTEXT = Object.freeze({
  mnsKey: 'MNS-RFRW2JY5BXMZ'
});

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

  const client = createClient({
    auth: OAuthStrategy({
      clientId: CLIENT_ID,
      tokens
    })
  });

  try {
    const renewed = await client.auth.renewToken(tokens.refreshToken);
    localStorage.setItem(TOKEN_KEY, JSON.stringify(renewed));
    return renewed?.accessToken?.value || '';
  } catch {
    return '';
  }
}

function findMessagingCard() {
  return [...document.querySelectorAll('.module-card')].find((card) =>
    card.querySelector('.module-copy strong')?.textContent?.trim().toUpperCase() === 'MENSAJERÍA'
  ) || null;
}

function ensureStyles() {
  if (document.getElementById('cpcMnsStyles')) return;
  const style = document.createElement('style');
  style.id = 'cpcMnsStyles';
  style.textContent = `
    .cpc-mns-overlay{
      position:fixed;inset:0;z-index:99999;background:rgba(11,28,47,.46);
      display:flex;align-items:stretch;justify-content:center;
    }
    .cpc-mns-panel{width:100%;height:100%;background:#f6f8fb;overflow:hidden}
    .cpc-mns-frame{display:block;width:100%;height:100%;border:0;background:#f6f8fb}
    body.cpc-mns-open{overflow:hidden}
    @media(min-width:760px){
      .cpc-mns-overlay{padding:28px;align-items:center}
      .cpc-mns-panel{
        width:min(1040px,calc(100vw - 56px));
        height:min(820px,calc(100dvh - 56px));
        border-radius:22px;
        box-shadow:0 24px 80px rgba(6,31,57,.28)
      }
    }
  `;
  document.head.appendChild(style);
}

function getFrame() {
  return document.querySelector('#cpcMnsOverlay iframe');
}

function applyMnsUi053(frame) {
  const doc = frame?.contentDocument;
  if (!doc) return;

  if (!doc.getElementById('mnsUi053Styles')) {
    const style = doc.createElement('style');
    style.id = 'mnsUi053Styles';
    style.textContent = `
      .rail{background:linear-gradient(90deg,#0b3158,#082849)!important;grid-template-columns:repeat(5,1fr)!important;height:66px!important;border-bottom:0!important;box-shadow:0 5px 16px rgba(8,40,73,.12)!important}
      .rail-btn{color:#d9e8f6!important;font-size:8.5px!important}
      .rail-btn.active{color:#fff!important;background:rgba(27,112,211,.58)!important}
      .rail-btn.active:after{background:#fff!important}
      .rail-btn .nav-ico{width:23px!important;height:23px!important;display:grid!important;place-items:center!important;line-height:1!important;font-size:0!important}
      .rail-btn .nav-ico svg{width:23px!important;height:23px!important;display:block!important;stroke:currentColor!important}
      .searchbox input{font-size:10.5px!important;padding-right:42px!important}
      .searchmark{right:10px!important;top:50%!important;transform:translateY(-50%)!important;width:24px!important;height:24px!important;color:#0b3158!important;display:grid!important;place-items:center!important;font-size:0!important}
      .searchmark svg{width:24px!important;height:24px!important;display:block!important;stroke:currentColor!important}
      #btnNew,.compose-btn{display:none!important}
      @media(min-width:760px){
        .rail{width:92px!important;height:auto!important;background:linear-gradient(180deg,#0b3158,#082849)!important;display:flex!important;flex-direction:column!important;padding:10px 8px!important}
        .rail-btn{height:72px!important;border-radius:12px!important;font-size:10px!important;gap:5px!important}
        .rail-btn .nav-ico{width:27px!important;height:27px!important}.rail-btn .nav-ico svg{width:27px!important;height:27px!important}
      }
    `;
    doc.head.appendChild(style);
  }

  const icons = {
    new: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.45 9.8 9.8 0 0 1-4.1-.95L4 19l1.2-3.3A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/></svg>',
    contacts: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 18c.5-3.1 2.5-4.8 5.5-4.8s5 1.7 5.5 4.8M14.2 14.3c2.9-.5 5.2 1 5.8 3.7"/></svg>',
    attention: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M5 12h2v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2ZM19 12h-2v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/><path d="M17 18c-.7 1.4-2 2-4 2"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 4.7 4.7"/></svg>'
  };

  const rail = doc.querySelector('.rail');
  if (rail && !doc.getElementById('btnNewRail')) {
    const btn = doc.createElement('button');
    btn.className = 'rail-btn';
    btn.id = 'btnNewRail';
    btn.setAttribute('aria-label', 'Nueva conversación');
    btn.innerHTML = `<span class="nav-ico">${icons.new}</span><span>Nueva</span>`;
    const chats = doc.getElementById('btnChats');
    rail.insertBefore(btn, chats || rail.firstChild);
    btn.addEventListener('click', () => doc.getElementById('btnNew')?.click());
  }

  [['btnChats','chat'],['btnContacts','contacts'],['btnAttention','attention'],['btnSystem','system']].forEach(([id,key]) => {
    const el = doc.getElementById(id)?.querySelector('.nav-ico');
    if (el) el.innerHTML = icons[key];
  });
  doc.querySelectorAll('.searchmark').forEach(el => { el.innerHTML = icons.search; });
}

function closeMns() {
  document.getElementById('cpcMnsOverlay')?.remove();
  document.body.classList.remove('cpc-mns-open');
}

async function invokeMns(action, payload) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Inicia sesión para usar Mensajería.');

  const response = await fetch(MNS_INVOKE_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action,
      payload: {
        ...(payload || {}),
        mnsKey: MNS_CONTEXT.mnsKey
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `MNS no respondió (${response.status}).`);
  if (data?.ok !== true) throw new Error(data?.error || 'No fue posible completar la operación.');
  return data.data;
}

function openMns() {
  if (!readTokens()?.accessToken?.value) {
    document.querySelector('.session-btn')?.click();
    return;
  }

  ensureStyles();
  closeMns();

  const overlay = document.createElement('div');
  overlay.id = 'cpcMnsOverlay';
  overlay.className = 'cpc-mns-overlay';
  overlay.innerHTML = `
    <div class="cpc-mns-panel" role="dialog" aria-modal="true" aria-label="Mensajería">
      <iframe class="cpc-mns-frame" src="${MNS_FRAME_URL}" title="Mensajería SCaD MNS"></iframe>
    </div>`;

  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeMns();
  });

  document.body.appendChild(overlay);
  document.body.classList.add('cpc-mns-open');
  const frame = overlay.querySelector('iframe');
  frame.addEventListener('load', () => applyMnsUi053(frame), { once:true });
}

function bindMnsCard() {
  const card = findMessagingCard();
  if (!card || card.dataset.cpcMnsBound === 'true') return false;
  card.dataset.cpcMnsBound = 'true';
  card.addEventListener('click', openMns);
  return true;
}

window.addEventListener('message', async event => {
  const frame = getFrame();
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.origin !== window.location.origin) return;

  const message = event.data;
  if (!message || message.channel !== CHANNEL) return;

  if (message.type === 'CLOSE') {
    closeMns();
    return;
  }

  if (message.type === 'READY') {
    applyMnsUi053(frame);
    frame.contentWindow.postMessage({
      channel: CHANNEL,
      type: 'CONTEXT',
      payload: MNS_CONTEXT
    }, window.location.origin);
    return;
  }

  if (!message.id || !message.action) return;

  try {
    const data = await invokeMns(message.action, message.payload || {});
    frame.contentWindow.postMessage({
      channel: CHANNEL,
      id: message.id,
      ok: true,
      data
    }, window.location.origin);
  } catch (error) {
    frame.contentWindow.postMessage({
      channel: CHANNEL,
      id: message.id,
      ok: false,
      error: error?.message || 'Error MNS'
    }, window.location.origin);
  }
});

const observer = new MutationObserver(() => {
  if (bindMnsCard()) observer.disconnect();
});

if (!bindMnsCard()) {
  observer.observe(document.documentElement, { childList:true, subtree:true });
}
