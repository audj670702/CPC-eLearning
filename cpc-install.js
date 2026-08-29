let cpcDeferredInstallPrompt = null;

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '');
}

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function getInstallButton() {
  return document.querySelector('.install-btn');
}

function syncInstallButton() {
  const button = getInstallButton();
  if (!button) return;

  if (!isAndroidDevice()) return;

  // La hoja móvil anterior ocultaba este control. En Android debe permanecer visible.
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';

  if (isStandaloneApp()) {
    button.textContent = 'App instalada';
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    return;
  }

  button.textContent = 'Instalar';
  button.disabled = !cpcDeferredInstallPrompt;
  button.setAttribute('aria-disabled', String(!cpcDeferredInstallPrompt));
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  cpcDeferredInstallPrompt = event;
  syncInstallButton();
});

window.addEventListener('appinstalled', () => {
  cpcDeferredInstallPrompt = null;
  syncInstallButton();
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('.install-btn');
  if (!button || !isAndroidDevice() || isStandaloneApp()) return;
  if (!cpcDeferredInstallPrompt) return;

  button.disabled = true;

  try {
    await cpcDeferredInstallPrompt.prompt();
    await cpcDeferredInstallPrompt.userChoice;
  } catch (error) {
    console.error('CPC PWA install:', error);
  } finally {
    cpcDeferredInstallPrompt = null;
    syncInstallButton();
  }
});

const cpcInstallObserver = new MutationObserver(() => {
  if (getInstallButton()) syncInstallButton();
});

cpcInstallObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

syncInstallButton();
