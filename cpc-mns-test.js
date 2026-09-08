const MNS_FRAME_URL = 'mns-frontend.html?v=0.4.1';

function findMessagingCard() {
  return [...document.querySelectorAll('.module-card')].find((card) =>
    card.querySelector('.module-copy strong')?.textContent?.trim().toUpperCase() === 'MENSAJERÍA'
  ) || null;
}

function ensureStyles() {
  if (document.getElementById('cpcMnsTestStyles')) return;
  const style = document.createElement('style');
  style.id = 'cpcMnsTestStyles';
  style.textContent = `
    .cpc-mns-overlay{
      position:fixed;inset:0;z-index:99999;background:rgba(11,28,47,.46);
      display:flex;align-items:stretch;justify-content:center;
    }
    .cpc-mns-panel{
      width:100%;height:100%;background:#f6f8fb;overflow:hidden;
    }
    .cpc-mns-frame{
      display:block;width:100%;height:100%;border:0;background:#f6f8fb;
    }
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

function closeMns() {
  document.getElementById('cpcMnsOverlay')?.remove();
  document.body.classList.remove('cpc-mns-open');
}

function openMns() {
  ensureStyles();
  closeMns();

  const overlay = document.createElement('div');
  overlay.id = 'cpcMnsOverlay';
  overlay.className = 'cpc-mns-overlay';
  overlay.innerHTML = `
    <div class="cpc-mns-panel" role="dialog" aria-modal="true" aria-label="Mensajería">
      <iframe class="cpc-mns-frame" src="${MNS_FRAME_URL}" title="Mensajería SCaD MNS"></iframe>
    </div>`;

  overlay.addEventListener('click', (event) => {
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

window.addEventListener('message', (event) => {
  if (event.source !== document.querySelector('#cpcMnsOverlay iframe')?.contentWindow) return;
  if (event.data?.channel === 'MNS_FRONTEND' && event.data?.type === 'CLOSE') closeMns();
});

const observer = new MutationObserver(() => {
  if (bindMnsCard()) observer.disconnect();
});

if (!bindMnsCard()) {
  observer.observe(document.documentElement, { childList:true, subtree:true });
}
