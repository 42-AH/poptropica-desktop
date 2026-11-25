const REFRESH_MS = 30_000;
const TIMEOUT_MS = 8_000;

export function installOnlineCount({host = globalThis.window, element, fetcher = host?.fetch?.bind(host)} = {}) {
  if (!host?.document || !element || typeof fetcher !== 'function') {
    return {refresh() {}, destroy() {}};
  }

  const document = host.document;
  let timer = null;
  let current = null;
  let pageHidden = false;
  let destroyed = false;
  const visible = () => !destroyed && !pageHidden && !document.hidden;
  const render = value => { element.textContent = `Players online: ${value}`; };
  render('…');

  function clearTimer() {
    if (timer !== null) host.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (visible()) timer = host.setTimeout(refresh, REFRESH_MS);
  }

  function settle(request, value) {
    if (current !== request || destroyed) return;
    host.clearTimeout(request.timeout);
    current = null;
    render(value);
    schedule();
  }

  async function refresh() {
    if (!visible() || current) return;
    clearTimer();
    const controller = new (host.AbortController || globalThis.AbortController)();
    const request = {controller, timeout: null};
    current = request;
    request.timeout = host.setTimeout(() => {
      controller.abort();
      settle(request, 'unavailable');
    }, TIMEOUT_MS);
    try {
      const response = await fetcher('/api/cloud.php?action=online', {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Online count unavailable');
      const data = await response.json();
      if (!Number.isSafeInteger(data?.online) || data.online < 0) throw new Error('Invalid online count');
      settle(request, data.online);
    } catch {
      settle(request, 'unavailable');
    }
  }

  function pause() {
    clearTimer();
    if (!current) return;
    const request = current;
    current = null;
    host.clearTimeout(request.timeout);
    request.controller.abort();
  }

  function onVisibility() { if (visible()) refresh(); else pause(); }
  function onPageHide() { pageHidden = true; pause(); }
  function onPageShow() { pageHidden = false; if (visible()) refresh(); }

  document.addEventListener('visibilitychange', onVisibility);
  host.addEventListener('pagehide', onPageHide);
  host.addEventListener('pageshow', onPageShow);
  refresh();

  return {
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pagehide', onPageHide);
      host.removeEventListener('pageshow', onPageShow);
    },
  };
}
