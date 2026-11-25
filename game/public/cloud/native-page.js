// Original ExternalInterface entry points shared by both game engines.
(() => {
  const name=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value);
  let leaving=false;
  window.POSTToBase=(room,island,path='gameplay')=>{
    if(leaving || !name(room) || !name(island) || !name(path))return false;
    const form=document.createElement('form');form.method='POST';form.action='/base.php';
    for(const [key,value] of Object.entries({room,island,startup_path:path})) {
      const field=document.createElement('input');field.type='hidden';field.name=key;field.value=value;form.append(field);
    }
    leaving=true;document.body.append(form);form.submit();return true;
  };
  window.dbug=message=>{if(new URLSearchParams(location.search).has('webDiagnostics'))console.debug(String(message).slice(0,1000));};
  window.loadTrackingPixel=url=>{
    try {if(new URL(url).hostname==='notify.maps.poptropica.com')window.POSTToBase('Home','Home');}catch{}
  };
  // Retired surrounding-site advertising and analytics calls have no work to
  // perform in the current account wrapper.
  const callbacks=['showWrapper','hideWrapper','unhideWrapper','clearWrapper','refreshWrapper','sendTrackingPixels','playTheaterVideo','tutorialCompleted','GATrackEvent','GATrackPageView','ga','sendToComScoreBeacon','cookieSetCookie'];
  for(const callback of callbacks)window[callback]=()=>undefined;
  window.cookieGetCookie=()=>'';
})();
