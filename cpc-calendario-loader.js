(() => {
  let loading = false;
  let loaded = false;

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
      await import('./cpc-calendario.js?v=0.3.5');
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
