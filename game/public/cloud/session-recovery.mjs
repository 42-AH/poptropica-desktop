function accountChanged() {
  const error=new Error('The signed-in account changed. Reload before syncing; your browser progress is preserved.');
  error.status=409;error.code='account_changed';return error;
}

// Only the caller's account-bound operation may be replayed. `send` retains
// its original serialized body, including the save's idempotency request ID.
export async function recoverStaleCsrf({send,refreshSession,accountId,isCurrent,onRecovered=()=>{}}) {
  if(!isCurrent())throw accountChanged();
  try {
    return await send();
  } catch(error) {
    if(error.status!==403 || error.code!=='csrf_mismatch')throw error;
    if(!isCurrent())throw accountChanged();
    const session=await refreshSession();
    if(!isCurrent())throw accountChanged();
    if(!session.user) {
      const expired=new Error('Sign in again to sync. Your browser progress is preserved.');
      expired.status=401;expired.code='session_expired';throw expired;
    }
    if(session.user.id!==accountId)throw accountChanged();
    // Deliberately outside the first attempt's catch: at most one replay.
    const result=await send();
    if(!isCurrent())throw accountChanged();
    onRecovered();
    return result;
  }
}
