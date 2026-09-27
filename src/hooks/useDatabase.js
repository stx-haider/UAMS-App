import { useEffect, useState } from 'react';
import { getActiveAccountId, readState, subscribe } from '../data/database';

export default function useDatabase() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const currentRequest = ++request;
      const accountId = getActiveAccountId();
      setState(null);
      readState(accountId).then((value) => {
        if (active && currentRequest === request && accountId === getActiveAccountId()) setState(value);
      });
    };
    refresh();
    const unsubscribe = subscribe((value) => {
      if (value?.ownerAccountId && value.ownerAccountId === getActiveAccountId()) {
        request += 1;
        setState(value);
        return;
      }
      refresh();
    });
    return () => { active = false; request += 1; unsubscribe(); };
  }, []);
  return state;
}
