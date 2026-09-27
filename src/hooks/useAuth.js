import { useEffect, useState } from 'react';
import { getActiveAccount, subscribe } from '../data/database';

export default function useAuth() {
  const [account, setAccount] = useState(undefined);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const currentRequest = ++request;
      getActiveAccount().then((value) => {
        if (active && currentRequest === request) setAccount(value);
      });
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => { active = false; request += 1; unsubscribe(); };
  }, []);
  return account;
}
