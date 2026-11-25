async function transfer(command, input) {
  const hostname = location.hostname;
  const meta = () => JSON.parse(localStorage.getItem(META_KEY) || 'null');
  const markerKey = 'poptropica.desktop.offline.v1';
  const marker = () => JSON.parse(localStorage.getItem(markerKey) || 'null');
  const account = value => value && /^user:[1-9][0-9]*$/.test(value.owner) && typeof value.username === 'string' && value.username.length > 0;
  const pack = (value, bundle) => ({owner:value.owner, username:value.username, revision:value.revision, syncedDigest:value.syncedDigest || '', bundle});
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 4000);
  try {
    return await navigator.locks.request('poptropica-game-workspace', {signal:deadline.signal}, async () => {
      clearTimeout(timer);
      const db = await openBackups();
      try {
        const current = meta();
        const bundle = snapshot(localStorage, hostname);
        if (command === 'leaveOffline') {
          const saved = marker();
          if (!saved || !account(current) || current.owner !== saved.owner) return null;
          const digest = await fingerprint(bundle);
          return digest === saved.digest ? null : {owner:saved.owner, ticket:saved.ticket, bundle};
        }
        if (command === 'online') {
          const key = owner => 'desktop:offline-ticket:' + owner;
          if (input && input.draft) {
            const draft = input.draft;
            let ticket = await backupGet(db, key(draft.owner));
            if (!ticket || ticket.ticket!==draft.ticket)ticket=await backupGet(db,'desktop:previous-ticket:'+draft.owner);
            if (!ticket || ticket.ticket !== draft.ticket) throw Error('This offline save belongs to another visit. Your local progress is still on this PC.');
            const incoming = validateBundle(draft.bundle);
            const digest = await fingerprint(incoming);
            if (ticket.applied !== digest) {
              const active = current && current.owner === ticket.owner;
              const prior = active ? pack(current,bundle) : await backupGet(db,'owner:'+ticket.owner);
              if (prior) {
                const previous = await fingerprint(prior.bundle);
                if (previous !== digest && previous !== ticket.digest && previous !== ticket.applied && previous !== prior.syncedDigest)
                  throw Error('This PC has two unsynced adventures. Both copies have been kept.');
                await backupPut(db,'desktop:before-offline:'+ticket.owner,prior);
              }
              const record = pack(ticket,incoming);
              await backupPut(db,'owner:'+ticket.owner,record);
              if (active) {
                install(localStorage,hostname,incoming);
                const {bundle:unused,...fields}=record;
                localStorage.setItem(META_KEY,JSON.stringify(fields));
              }
              ticket.applied=digest;
              await backupPut(db,key(ticket.owner),ticket);
            }
          }
          const active=meta();
          if (!input.offline || !account(active)) return null;
          const latest=snapshot(localStorage,hostname);
          const digest=await fingerprint(latest);
          const old=await backupGet(db,key(active.owner));
          const same=old && old.digest===digest && old.revision===active.revision && old.syncedDigest===(active.syncedDigest||'');
          const ticket=same ? old : {owner:active.owner,username:active.username,revision:active.revision,syncedDigest:active.syncedDigest||'',digest,ticket:crypto.randomUUID()};
          if (!same) {
            if(old)await backupPut(db,'desktop:previous-ticket:'+old.owner,old);
            await backupPut(db,key(ticket.owner),ticket);
          }
          return {...ticket,bundle:latest};
        }
        if (command !== 'enterOffline') throw Error('Unknown save operation');
        const previous=marker();
        if (!input && !previous) return null;
        if (current) await backupPut(db,'owner:'+current.owner,pack(current,bundle));
        const next=input || await backupGet(db,'owner:guest') || {owner:'guest',username:'',revision:0,syncedDigest:'',bundle:emptyBundle()};
        const files=next.bundle;
        const fields={owner:next.owner, username:next.username, revision:next.revision, syncedDigest:next.syncedDigest};
        const before=localStorage.getItem(META_KEY);
        try {
          install(localStorage,hostname,files);
          localStorage.setItem(META_KEY,JSON.stringify(fields));
          if(input)localStorage.setItem(markerKey,JSON.stringify({owner:next.owner,ticket:next.ticket,digest:next.digest}));
          else localStorage.removeItem(markerKey);
        } catch(error) {
          install(localStorage,hostname,bundle);
          if(before===null)localStorage.removeItem(META_KEY);else localStorage.setItem(META_KEY,before);
          throw error;
        }
        return input ? input.username : null;
      } finally {db.close();}
    });
  } catch (error) {
    if (deadline.signal.aborted) throw Error('Close the other game window, then try again.');
    throw error;
  } finally { clearTimeout(timer); }
}
