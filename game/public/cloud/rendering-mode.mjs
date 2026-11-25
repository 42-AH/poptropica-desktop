// Device preference only; deliberately outside the game's save-key namespace.
export const RENDERING_KEY = 'poptropica-rendering-v1';
export function readRenderingMode(storage) {
  try { return storage.getItem(RENDERING_KEY) === 'low' ? 'low' : 'normal'; }
  catch { return 'normal'; }
}

export function installRenderingMode({button, storage, canChange, offer, restart, report}) {
  let mode = readRenderingMode(storage);
  const render = () => {
    button.textContent = 'Low-RAM mode: ' + (mode === 'low' ? 'on' : 'off');
    button.setAttribute('aria-pressed', String(mode === 'low'));
  };
  render();
  button.addEventListener('click', () => {
    if (!canChange()) return;
    const next = mode === 'low' ? 'normal' : 'low';
    offer(next === 'low'
      ? 'Low-RAM mode reduces smoothing and some artwork detail. Save and restart the game to apply it.'
      : 'Save and restart the game to restore normal artwork quality.', async () => {
      if (!canChange()) return;
      // Do not restart unless the preference can be saved. Never touch game data.
      try { storage.setItem(RENDERING_KEY, next); }
      catch { report('This browser could not save the graphics setting. The game has not restarted.'); return; }
      try { await restart(); mode = next; render(); }
      catch (error) {
        try { storage.setItem(RENDERING_KEY, mode); } catch {}
        throw error;
      }
    });
  });
}
