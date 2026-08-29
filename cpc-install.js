let deferredInstallPrompt = null;
let installButtonBound = false;

function isAppInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function getInstallButton() {
  return document.querySelector('.install-btn');
}

function renderInstallOption() {
  const button = getInstallButton();
  if (!button) return false;

  const installed = isAppInstalled();

  // CPC renderiza el botón dentro de app.js; en móvil debe permanecer visible.
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.visibility = 'visible';
  button.style.opacity = '1';

  button.textContent = installed ? 'App instalada' : 'Instalar app';
  button.disabled = installed;
  button.dataset.installed = installed ? 'true' : 'false';
  button.setAttribute('aria-label', installed ? 'App instalada' : 'Instalar app');

  return true;
}

async function handleInstallClick(event) {
  const button = event.target.closest('.install-btn');
  if (!button || isAppInstalled()) return;

  if (!deferredInstallPrompt) {
    window.alert(
      'La instalación todavía no está disponible. Abre el menú del navegador y selecciona “Instalar app” o “Agregar a pantalla principal”.'
    );
    return;
  }

  button.disabled = true;
  button.textContent = 'Instalando...';

  try {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  } catch (error) {
    console.error('CPC PWA install:', error);
  } finally {
    deferredInstallPrompt = null;
    renderInstallOption();
  }
}

function bindInstallButtonOnce() {
  if (installButtonBound) return true;
  const button = getInstallButton();
  if (!button) return false;

  installButtonBound = true;
  renderInstallOption();
  return true;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallOption();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  renderInstallOption();
});

document.addEventListener('click', handleInstallClick);

if (!bindInstallButtonOnce()) {
  const observer = new MutationObserver(() => {
    if (bindInstallButtonOnce()) observer.disconnect();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => {
        console.error('No fue posible registrar la PWA CPC:', error);
      });
  });
}
