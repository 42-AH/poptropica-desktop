// Keep the policy stable for this player, including later scene-quality resets.

const webTouchRendering = window.matchMedia('(pointer: coarse)').matches;

const webLowMemoryRendering = (() => {

  try { return webTouchRendering || window.localStorage.getItem('poptropica-rendering-v1') === 'low'; }

  catch { return webTouchRendering; }

})();

window.webUseLowMemoryRendering = () => webLowMemoryRendering;

window.RufflePlayer = window.RufflePlayer || {};

window.RufflePlayer.config = {

  publicPath: '/ruffle/',

  // Use the validated WebGL renderer for classic islands, AS3 and Realms.

  preferredRenderer: 'wgpu-webgl',

  allowScriptAccess: true,

  autoplay: 'on',

  unmuteOverlay: 'visible',

  // Touch-first devices need single-sample rendering during bitmap preparation.

  // The archived object's quality=high otherwise overrides Ruffle's mobile default.

  quality: webLowMemoryRendering ? 'low' : 'high',

  urlRewriteRules: [
    // Keep hair attached in alternate classic character rigs.
    [/^(?:https?:\/\/[^/]+)?\/?(creature\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=925789b5eff6de8e'],
    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandTribal\/assets\/char\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=148f5594b87a8e53'],
    // Refresh Costumizer removal and Undo.
    [/^(?:https?:\/\/[^/]+)?\/?(popups\/wardrobe\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=202a24e8211c1d7a'],

    // Survival 3: retain vector tower layers instead of baking oversized bitmaps.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/survival3\/radioTower\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=48b654286ac94b39'],

    // Home adventurer guidance no longer depends on retired ad configuration.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/hub\/town\/dialog\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=36e8b913ce0964fb'],



    // Mythology Grove: exact static art avoids expensive runtime vector baking.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/myth\/grove\/background\-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=76f06e7a197b1763'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/myth\/grove\/foreground\-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=cef61116818eb7f8'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/myth\/grove\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=3044876923f85bfe'],

    // Full-resolution static scenery; no runtime vector bake.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/shrink\/trashCan\/background\-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=6cae638befec1a0e'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/shrink\/trashCan\/foreground\-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=8710527a5d3f49d8'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/shrink\/schoolInterior\/background\-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=de2dbc23db1fe532'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/shrink\/trashCan\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=8bef876c54e43d32'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/shrink\/schoolInterior\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=9f841b0ce92771d2'],

    // Virus Hunter: native static scenery avoids runtime vector preparation.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/stomach\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=4a86ed64b190536f'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/stomach\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=35e0de36772103f3'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/anteArm\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=63345a331bb849dc'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/anteArm\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=7ae4d21a55349a3b'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/foreArm\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=1714e7f2a57f4a35'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/foreArm\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=d535ecd713a88591'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/heart\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=9f6079449924fa4c'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/intestine\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=f21ea82346d5f039'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/intestine\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=ac14721ca57be5e4'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/brain\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=8fb749161e462bb2'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/brain\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=09b1a8a442ce6039'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/mouthShip\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=a397845d6fa74833'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/mouthShip\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=d9916efd12f85cc2'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/mouth\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=8de0a8862551e396'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/mouth\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=3d3a5dadbeaf4eb1'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/shipTutorial\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=1b13f9a6905a604f'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/shipTutorial\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=cffd370a7b78fa70'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Heart\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=d53ec5fa3b29f1d4'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Heart\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=07c14de3ea97408f'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Intestine\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=2674b490476e5d37'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Intestine\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=c7a51a558c5c0700'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Lungs\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=236aa2488f04b77c'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Lungs\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=f57aa85f791aa637'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Mouth\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=e1e6836b8104c209'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Mouth\/foreground-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=5a6e98379596f6f7'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/day2Stomach\/background-native\.png)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=57184a94367298d1'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/anteArm\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=428092cd4adfa87b'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/brain\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=452090a9d731b239'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/day2Heart\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=3ecea9f823bdf4f0'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/day2Intestine\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=b3f46d3554733926'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/day2Lungs\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=953c31332cb9a7c0'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/day2Mouth\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=551580fe6e9220dc'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/day2Stomach\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=813b4fadf25a618b'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/foreArm\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=09d361f652606b24'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/heart\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=e4ee8ab240b68cb0'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/intestine\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=e09e7fcc0a340568'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/mouth\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=18474f6f6e97fd80'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/mouthShip\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=75b61183ae74dfb7'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/shipTutorial\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=c17dcf0402272890'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/stomach\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=75a6db21bef60132'],

    // Refresh static scenery that previously exhausted browser memory.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/survival4\/trophyRoom\/background\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=777937cad8ef5c89'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/mocktropica\/mainStreet\/backdropNight\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=49df820941d04791'],

    [/^(?:https?:\/\/[^/]+)?\/?(popups\/Moon\/LunarLander\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/$1?build=e9746b6180729ff2'],

    // Refresh the repaired classic puzzles and the lighter Wild West map.

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandMyth(?:AS2)?\/sceneTreeTop\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/$1?build=430275a18dfcf1d7'],

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandAstro\/sceneCastle5\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/$1?build=93ae22d04d6a62c5'],

    [/^(?:https?:\/\/[^/]+)?\/?(popups\/counter\/gargoyle\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/$1?build=536e4164de83d15d'],

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandWest\/sceneWestMap\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/$1?build=c387c2e845ce45d6'],

    // Refresh the flattened Hand background and skip its duplicate bitmap copy.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/virusHunter\/hand\/background\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=fe5cd429535466f6'],

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(data\/scenes\/virusHunter\/hand\/scene\.xml)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=9a145a45f77629c0'],

    // Refresh the smaller tower bitmap without reusing the older cached asset.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/deadAir\/tower\/tower-full\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=7137d663f08df5f1'],

    // Give revised Dead Air map art its own URL instead of reusing a cached icon.

    [/^(?:https?:\/\/[^/]+)?\/?(?:game\/)?(assets\/scenes\/map\/map\/islands\/deadAir\/island(?:-native)?\.swf)(?:\?[^#]*)?(?:#.*)?$/i, location.origin + '/game/$1?build=cbbb15d935453126'],

    // Refresh the repaired island cutscene transitions.
    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandCharlie\/sceneNutRoom\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=f55e00b82ec54a78'],
    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandVillain\/sceneOcean\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=01bd1a8580bca17d'],

    // Only valid shootout input can spend ammunition.
    [/^(?:https?:\/\/[^/]+)?\/?(popups\/West\/finalShootout\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=8a537efbdf97e877'],

    // Refresh classic room callbacks and the matching remote-avatar renderer.

    [/^(?:https?:\/\/[^/]+)?\/?(gameplay\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=8a545c830c23e6de'],

    [/^(?:https?:\/\/[^/]+)?\/?(char\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=cf06c0b5762481c5'],

    // Refresh Zomberry room physics, repeated TV spawns, and darkness drawing.

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandZombie\/sceneWharf\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=f7f61032424a7837'],

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandZombie\/sceneCarrots\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=fdb9f9022f8d63c6'],

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandZombie\/assets\/sharedContent\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=4d7679c7e4a36cf3'],

    // Keep the Wild West entrance cutscene rider attached after contact loss.

    [/^(?:https?:\/\/[^/]+)?\/?(scenes\/islandWest\/sceneMine01\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=fd6de0133daac61a3'],

    // These restored SWFs previously had a seven-day browser cache lifetime.

    [/^(?:https?:\/\/[^/]+)?\/(game\/assets\/(?:scenes\/hub\/town\/wheelPopup\/shipWheelPopup|scenes\/lands\/shared\/popups\/worldManagementPopup|scenes\/virusHunter\/mainStreet\/interactive|ui\/hud\/hud)\.swf)(?:\?[^#]*)?$/i, location.origin + '/$1?build=online-20260915'],

    [/^https?:\/\/(?:www\.)?poptropica\.com\//i, location.origin + '/'],

    [/^https?:\/\/static\.poptropica\.com\//i, location.origin + '/'],

    [/^https?:\/\/flash\.quantserve\.com\//i, location.origin + '/archived-quantserve/'],

  ],

};



// Opt-in, aggregate-only diagnostics; no saved profile contents are exposed.

window.webSaveTiming = (() => {

  const enabled = new URLSearchParams(location.search).has('webDiagnostics');

  let count = 0, totalMs = 0, reflectionMs = 0, maxMs = 0;

  return (duration, reflection, nodes, characters) => {

    if (!enabled) return;

    count++;

    totalMs += duration;

    reflectionMs += reflection;

    maxMs = Math.max(maxMs, duration);

    const stats = { count, totalMs, reflectionMs, maxMs, lastMs: duration, nodes, characters };

    document.documentElement.dataset.webSaveTiming = JSON.stringify(stats);

    console.info('[web-save]', JSON.stringify(stats));

  };

})();



// Browser repaint timing only (not the game's own FPS); disabled by default.

(() => {

  if (!new URLSearchParams(location.search).has('webDiagnostics')) return;

  let started=performance.now(), previous=started, frames=0, slow=0, maximum=0;

  function sample(timestamp) {

    const elapsed=timestamp-previous; previous=timestamp;

    if (document.visibilityState==='visible') {

      frames++; if(elapsed>50) slow++; maximum=Math.max(maximum,elapsed);

      if(timestamp-started>=5000) {

        const stats={fps:Math.round(frames*1000/(timestamp-started)),frames,over50ms:slow,maxMs:Math.round(maximum)};

        document.documentElement.dataset.webFrameTiming=JSON.stringify(stats);

        console.info('[web-frames]',JSON.stringify(stats));

        started=timestamp;frames=0;slow=0;maximum=0;

      }

    } else {started=timestamp;frames=0;slow=0;maximum=0;}

    requestAnimationFrame(sample);

  }

  requestAnimationFrame(sample);

})();

