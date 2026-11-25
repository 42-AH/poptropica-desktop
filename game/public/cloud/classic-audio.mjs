const PREFERENCE_KEY = 'classic-island-audio-v1';

const EFFECTS = Object.freeze({
  inventory: 'ui_roll_over.mp3',
  item: 'ping_05.mp3',
});

function safeFile(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9 _().-]*\.mp3$/i.test(value)
    && !value.includes('..');
}

function clampVolume(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 1;
}

export function createClassicAudio({host = globalThis.window, container, resolve} = {}) {
  if (!host?.document || !container || typeof resolve !== 'function') {
    throw new TypeError('Classic audio needs a window, controls container, and scene resolver');
  }

  const document = host.document;
  let preference = {muted: false, volume: 1};
  try {
    const saved = JSON.parse(host.localStorage?.getItem(PREFERENCE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      preference.muted = saved.muted === true;
      preference.volume = clampVolume(saved.volume);
    }
  } catch { /* Private browsing and disabled storage are harmless. */ }

  const title = document.createElement('span');
  title.textContent = 'Island sound';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(Math.round(preference.volume * 100));
  slider.setAttribute('aria-label', 'Island sound volume');
  container.append(title, toggle, slider);
  container.hidden = true;

  let scene = null;
  let music = null;
  let ambient = null;
  let effectTrack = null;
  let suspended = false;
  let pageHidden = false;
  let blocked = false;
  let destroyed = false;

  function savePreference() {
    try {
      host.localStorage?.setItem(PREFERENCE_KEY, JSON.stringify(preference));
    } catch { /* Audio preferences must never affect game saves. */ }
  }

  function shouldPlay() {
    return !destroyed && !!scene && !preference.muted && !suspended && !pageHidden && !document.hidden;
  }

  function updateControls() {
    container.hidden = !scene;
    toggle.textContent = preference.muted || blocked ? 'Enable island sound' : 'Mute island sound';
    toggle.setAttribute('aria-label', toggle.textContent);
    slider.disabled = !scene;
  }

  function release(track) {
    if (!track) return;
    track.retired = true;
    try { track.audio.pause(); } catch {}
    try { track.audio.removeAttribute('src'); track.audio.load(); } catch {}
    try { track.audio.remove(); } catch {}
  }

  function makeTrack(category, file, loop) {
    const audio = document.createElement('audio');
    audio.hidden = true;
    audio.preload = 'none';
    audio.loop = loop;
    const track = {audio, file, retired: false, pending: false, failed: false, interruption: 0};
    audio.addEventListener('error', () => {
      if (!track.retired) {
        track.failed = true;
        try { audio.pause(); } catch {}
        if (category === 'effects' && effectTrack === track) {
          effectTrack = null;
          release(track);
        }
      }
    });
    if (!loop) audio.addEventListener('ended', () => {
      if (effectTrack === track) effectTrack = null;
      release(track);
    });
    container.append(audio);
    audio.src = `/game/sound/${category}/${file}`;
    return track;
  }

  function playTrack(track) {
    if (!track || track.retired || track.failed || track.pending || blocked || !shouldPlay()) return;
    const interruption = track.interruption;
    let result;
    try {
      result = track.audio.play();
    } catch {
      blocked = true;
      updateControls();
      return;
    }
    if (!result || typeof result.then !== 'function') return;
    track.pending = true;
    Promise.resolve(result).then(() => {
      track.pending = false;
      if (track.retired || !shouldPlay()) {
        try { track.audio.pause(); } catch {}
      } else if (track.audio.paused) playTrack(track);
    }, error => {
      track.pending = false;
      if (!track.retired && shouldPlay()) {
        if (error?.name === 'AbortError' && track.interruption !== interruption) {
          playTrack(track);
          return;
        }
        blocked = true;
        updateControls();
      }
    });
  }

  function reconcile() {
    for (const [track, mix] of [[music, 0.3], [ambient, 0.12], [effectTrack, 0.22]]) {
      if (!track) continue;
      try {
        track.audio.volume = clampVolume(preference.volume * mix);
        if (!shouldPlay()) {
          if (track.pending) track.interruption++;
          track.audio.pause();
        }
        else if (!track.failed && track.audio.paused) playTrack(track);
      } catch { track.failed = true; }
    }
    updateControls();
  }

  function swap(current, category, file) {
    if (current?.file === file && !current.retired) return current;
    release(current);
    return file ? makeTrack(category, file, true) : null;
  }

  function stop() {
    release(music); release(ambient); release(effectTrack);
    music = ambient = effectTrack = scene = null;
    suspended = false;
    blocked = false;
    updateControls();
  }

  function setScene(island, room) {
    if (destroyed) return;
    let next;
    try { next = resolve(island, room); } catch { next = null; }
    if (!next || !safeFile(next.music) || (next.ambient != null && !safeFile(next.ambient))) {
      stop();
      return;
    }
    scene = {island, room};
    suspended = false;
    blocked = false;
    music = swap(music, 'music', next.music);
    ambient = swap(ambient, 'ambient', next.ambient || null);
    if (effectTrack) { release(effectTrack); effectTrack = null; }
    reconcile();
  }

  function suspend() {
    suspended = true;
    if (effectTrack) { release(effectTrack); effectTrack = null; }
    reconcile();
  }

  function unlock() {
    if (!scene || destroyed) return;
    if (preference.muted) return;
    blocked = false;
    reconcile();
  }

  function effect(name) {
    if (!Object.hasOwn(EFFECTS, name)) return;
    const file = EFFECTS[name];
    if (!shouldPlay()) return;
    if (effectTrack) release(effectTrack);
    effectTrack = makeTrack('effects', file, false);
    reconcile();
  }

  function onToggle() {
    if (blocked && !preference.muted) {
      unlock();
      return;
    }
    preference.muted = !preference.muted;
    savePreference();
    blocked = false;
    if (preference.muted && effectTrack) { release(effectTrack); effectTrack = null; }
    reconcile();
  }

  function onVolume() {
    preference.volume = clampVolume(Number(slider.value) / 100);
    savePreference();
    reconcile();
  }

  function onVisibility() {
    if (document.hidden && effectTrack) { release(effectTrack); effectTrack = null; }
    reconcile();
  }
  function onPageHide() {
    pageHidden = true;
    if (effectTrack) { release(effectTrack); effectTrack = null; }
    reconcile();
  }
  function onPageShow() { pageHidden = false; reconcile(); }
  function onGesture(event) {
    // The enable button handles its own click; otherwise pointerdown would
    // unlock first and the following click would immediately mute it again.
    if (blocked && event?.target !== toggle) unlock();
  }

  toggle.addEventListener('click', onToggle);
  slider.addEventListener('input', onVolume);
  document.addEventListener('visibilitychange', onVisibility);
  host.addEventListener('pagehide', onPageHide);
  host.addEventListener('pageshow', onPageShow);
  host.addEventListener('pointerdown', onGesture);
  host.addEventListener('keydown', onGesture);
  updateControls();

  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    toggle.removeEventListener('click', onToggle);
    slider.removeEventListener('input', onVolume);
    document.removeEventListener('visibilitychange', onVisibility);
    host.removeEventListener('pagehide', onPageHide);
    host.removeEventListener('pageshow', onPageShow);
    host.removeEventListener('pointerdown', onGesture);
    host.removeEventListener('keydown', onGesture);
    title.remove(); toggle.remove(); slider.remove();
  }

  function guard(action) {
    return (...args) => {
      try { return action(...args); }
      catch { try { stop(); } catch {} }
    };
  }

  return {
    setScene: guard(setScene),
    suspend: guard(suspend),
    stop: guard(stop),
    unlock: guard(unlock),
    effect: guard(effect),
    destroy: guard(destroy),
  };
}
