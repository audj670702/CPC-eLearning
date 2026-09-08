import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';

const CHANNEL = 'MNS_FRONTEND';
const MNS_FRAME_URL = 'mns-frontend.html?v=0.5.1';
const MNS_INVOKE_URL = 'https://www.wixapis.com/velo/v1/http/invoke/mnsBridge';

const CLIENT_ID = '76bd3893-6f4b-4da9-bdc8-9c1d22513ee6';
const TOKEN_KEY = 'cpc_wix_member_tokens';

const MNS_CONTEXT = Object.freeze({
  appId: '517f9bac-b113-48aa-b97c-cf8034e4d750',
  eoId: '2aed39b1-8110-4bac-af71-5a8d0d68bf6d'
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
      .cpc-mns-overlay{padding:24px}
      .cpc-mns-panel{
        max-width:540px;height:calc(100dvh - 48px);border-radius:22px;
        box-shadow:0 20px 70px rgba(6,31,57,.26)
      }
    }
  `;
  document.head.appendChild(style);
}

function getFrame() {
  return document.querySelector('#cpcMnsOverlay iframe');
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
    body: JSON.stringify({ action, payload })
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
