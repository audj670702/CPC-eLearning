const CPC_APP_VERSION = '0.3.8';

function enforceVisibleVersion() {
  const version = document.querySelector('.version');
  if (version) version.textContent = `v${CPC_APP_VERSION} | 2026`;
}

enforceVisibleVersion();

const cpcVersionObserver = new MutationObserver(() => {
  enforceVisibleVersion();
});

cpcVersionObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true
});

window.addEventListener('load', enforceVisibleVersion);
