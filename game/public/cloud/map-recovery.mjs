import {editBridgeSaves} from './legacy-sol.mjs';

// Only the navigation bridge changes. Character/profile documents remain opaque.
export function requestMapRecovery(storage,hostname) {
  editBridgeSaves(storage,hostname,['TransitToken'],documents=>{
    const token=documents.TransitToken??(documents.TransitToken=Object.create(null));
    token.nextScene='game.scenes.map.map.Map';
    token.webReturnMapPending=true;
    delete token.webReturnRealmsPending;
    delete token.webReturnScenePending;
  });
}

export async function recoverToMap({waitForSync,canRecover,stop,backup,request,start}) {
  await waitForSync();
  if(!canRecover())throw Error('Finish saving or resolve the save conflict before returning to the map.');
  stop();
  try {
    // The player is stopped so its final local writes belong to this backup.
    await backup();
    if(!canRecover())throw Error('The active game changed. Return to the map was cancelled.');
    request();
  } finally {
    start();
  }
}
