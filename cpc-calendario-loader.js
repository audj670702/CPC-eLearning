(() => {
  const VERSION = 'v0.3.6 | 2026';
  let loading = false;
  let loaded = false;

  const applyVersion = () => {
    const version = document.querySelector('.version');
    if (!version) return false;
    version.textContent = VERSION;
    return true;
  };

  if (!applyVersion()) {
    const observer = new MutationObserver(() => {
      if (applyVersion()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('click', async (event) => {
    const card = event.target.closest('.module-card');
    if (!card) return;

    const title = card.querySelector('.module-copy strong')?.textContent?.trim().toUpperCase();
    if (title !== 'CALENDARIO' || loaded) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (loading) return;
    loading = true;

    try {
      await import('./cpc-calendario.js?v=0.3.6');
      loaded = true;
      loading = false;
      card.click();
    } catch (error) {
      loading = false;
      console.error('CPC calendario lazy-load:', error);
      alert('No fue posible abrir el calendario. La aplicación principal continúa disponible.');
    }
  }, true);
})();
