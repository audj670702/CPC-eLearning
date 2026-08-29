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

  // En Android el acceso a instalación siempre debe permanecer visible.
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.opacity = '1';
  button.style.visibility = 'visible';

  if (isStandaloneApp()) {
    button.textContent = 'App instalada';
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    return;
  }

  button.textContent = 'Instalar';
  button.disabled = false;
  button.setAttribute('aria-disabled', 'false');
}

async function registerCpcServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js?v=0.3.8', {
      scope: '/'
    });
    await registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.error('CPC service worker:', error);
    return null;
  }
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

  await registerCpcServiceWorker();

  alert('Para instalar CPC en Android, abre el menú ⋮ de Chrome y selecciona “Instalar app” o “Agregar a pantalla principal”.');
});

const cpcInstallObserver = new MutationObserver(() => {
  if (getInstallButton()) syncInstallButton();
});

cpcInstallObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('load', async () => {
  await registerCpcServiceWorker();
  syncInstallButton();
});

syncInstallButton();
