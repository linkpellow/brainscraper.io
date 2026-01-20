(function () {
  const input = document.getElementById('url');
  const go = document.getElementById('go');

  function navigate() {
    const url = input.value.trim();
    if (url && window.explorerDesktop?.navigateBrowser) {
      window.explorerDesktop.navigateBrowser(url);
    }
  }

  go.addEventListener('click', navigate);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate();
  });
})();
