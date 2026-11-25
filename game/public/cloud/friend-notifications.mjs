const REFRESH_MS = 30_000;
const TIMEOUT_MS = 8_000;

export function installFriendNotifications({host = globalThis.window, button, badge, getAccountId, onChange=()=>{},
  fetcher = host?.fetch?.bind(host)} = {}) {
  if (!host?.document || !button || !badge || typeof getAccountId !== 'function' || typeof fetcher !== 'function') {
    return {refresh() {}, update() {}, reset() {}, destroy() {}};
  }
  const document = host.document;
  let timer = null, current = null, account = null, pageHidden = false, destroyed = false;
  const activeAccount = () => { const id = getAccountId(); return Number.isSafeInteger(id) && id > 0 ? id : null; };
  const visible = () => !destroyed && !pageHidden && !document.hidden;
  function render(incoming) {
    onChange(incoming);
    badge.textContent = '!';
    badge.hidden = incoming === 0;
    badge.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-label', incoming > 0 ? 'Friends: pending requests and invitations' : 'Friends');
  }
  function pause() {
    if (timer !== null) host.clearTimeout(timer);
    timer = null;
    if (!current) return;
    const request = current;
    current = null;
    host.clearTimeout(request.timeout);
    request.controller.abort();
  }
  function reconcileAccount() {
    const next = activeAccount();
    if (next !== account) { pause(); account = next; render(0); }
    return account;
  }
  function schedule() {
    if (timer !== null) host.clearTimeout(timer);
    timer = null;
    if (visible() && account !== null) timer = host.setTimeout(refresh, REFRESH_MS);
  }
  function settle(request, incoming) {
    if (destroyed || current !== request) return;
    reconcileAccount();
    if (current !== request) { schedule(); return; }
    host.clearTimeout(request.timeout);
    current = null;
    if (incoming !== undefined) render(incoming);
    schedule();
  }
  async function refresh() {
    if (destroyed) return;
    reconcileAccount();
    if (!visible() || account === null || current) return;
    if (timer !== null) host.clearTimeout(timer);
    timer = null;
    const controller = new (host.AbortController || globalThis.AbortController)();
    const request = {account, controller, timeout: null};
    current = request;
    request.timeout = host.setTimeout(() => { controller.abort(); settle(request); }, TIMEOUT_MS);
    try {
      const response = await fetcher('/api/social.php?action=friend-notifications', {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Friend notifications unavailable');
      const data = await response.json();
      if (data?.accountId !== request.account || !Number.isSafeInteger(data.incoming) || data.incoming < 0) {
        throw new Error('Invalid friend notifications');
      }
      settle(request, data.incoming);
    } catch { settle(request); }
  }
  function update(accountId, incoming) {
    if (destroyed) return;
    reconcileAccount();
    if (account === null || accountId !== account || !Number.isSafeInteger(incoming) || incoming < 0) return;
    // A panel action is newer than an outstanding poll, including a valid zero.
    pause();
    render(incoming);
    schedule();
  }
  function reset() {
    if (destroyed) return;
    pause(); account = activeAccount(); render(0); void refresh();
  }
  function onVisibility() { reconcileAccount(); if (visible()) void refresh(); else pause(); }
  function onPageHide() { pageHidden = true; pause(); }
  function onPageShow() { pageHidden = false; void refresh(); }
  document.addEventListener('visibilitychange', onVisibility);
  host.addEventListener('pagehide', onPageHide);
  host.addEventListener('pageshow', onPageShow);
  reset();
  return {refresh, update, reset, destroy() {
    if (destroyed) return;
    destroyed = true; pause(); render(0);
    document.removeEventListener('visibilitychange', onVisibility);
    host.removeEventListener('pagehide', onPageHide);
    host.removeEventListener('pageshow', onPageShow);
  }};
}
