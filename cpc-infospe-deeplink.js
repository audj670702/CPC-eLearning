(() => {
  const PARAM = 'modulo';
  const VALUE = 'infospe';

  function isInfospeUrl() {
    return String(new URLSearchParams(window.location.search).get(PARAM) || '').toLowerCase() === VALUE;
  }

  function setInfospeUrl(open) {
    const url = new URL(window.location.href);
    if (open) url.searchParams.set(PARAM, VALUE);
    else url.searchParams.delete(PARAM);
    history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function getUi() {
    return {
      modal: document.getElementById('infospeModal'),
      module: document.querySelector('.infospe-module'),
      close: document.querySelector('.infospe-close')
    };
  }

  function openInfospeFromUrl() {
    if (!isInfospeUrl()) return false;
    const { modal } = getUi();
    if (!modal) return false;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    return true;
  }

  function syncUiFromUrl() {
    const { modal } = getUi();
    if (!modal) return;
    if (isInfospeUrl()) {
      modal.hidden = false;
      document.body.classList.add('modal-open');
    } else if (!modal.hidden) {
      modal.hidden = true;
      document.body.classList.remove('modal-open');
    }
  }

  const observer = new MutationObserver(() => {
    if (openInfospeFromUrl()) observer.disconnect();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  openInfospeFromUrl();

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('.infospe-module')) {
      setInfospeUrl(true);
      return;
    }

    const { modal } = getUi();
    if (target.closest('.infospe-close') || (modal && target === modal)) {
      window.setTimeout(() => setInfospeUrl(false), 0);
    }
  }, true);

  window.addEventListener('popstate', syncUiFromUrl);
})();
