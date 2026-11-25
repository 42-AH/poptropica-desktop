// Pass only player records received from the account/social service.
// Identity decoration never changes the username used by game or API calls.
export function renderPlayerIdentity(element, player, fallback = '') {
  element.textContent = typeof player?.username === 'string' ? player.username : fallback;
  if (player?.badge !== 'dev') return;
  const badge = element.ownerDocument.createElement('span');
  badge.className = 'player-dev-badge';
  badge.textContent = 'dev';
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', 'Developer');
  element.append(element.ownerDocument.createTextNode(' '), badge);
}
