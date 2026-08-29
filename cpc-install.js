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
  if (!button || !isAndroidDevice()) return false;

  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.opacity = '1';
  button.style.visibility = 'visible';

  if (isStandaloneApp()) {
    if (button.textContent !== 'App instalada') button.textContent = 'App instalada';
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    return true;
  }

  if (button.textContent !== 'Instalar') button.textContent = 'Instalar';
  button.disabled = false;
  button.setAttribute('aria-disabled', 'false');
  return true;
}

async function registerCpcServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js?v=0.3.8', {
      scope: '/'
    });
    return registration;
  } catch (error) {
    console.error('CPC service worker:', error);
    return null;
  }
}

function waitForInstallButton() {
  if (!isAndroidDevice()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const found = syncInstallButton();
    if (found || attempts >= 40) window.clearInterval(timer);
  }, 250);
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

  if (cpcDeferredInstallPrompt) {
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

    return;
  }

  alert('Para instalar CPC en Android, abre el menú ⋮ de Chrome y selecciona “Instalar app” o “Agregar a pantalla principal”.');
});

document.addEventListener('DOMContentLoaded', waitForInstallButton, { once: true });

window.addEventListener('load', async () => {
  registerCpcServiceWorker();
  waitForInstallButton();
}, { once: true });

waitForInstallButton();
