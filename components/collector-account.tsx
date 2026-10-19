'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { requestJSON } from '@/lib/api-client';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type Account = { userId: string; displayName: string; role: string; visibility: string; needsSetup: boolean };
type AccountState = { account: Account | null; error: string; loading: boolean; refreshAccount: () => Promise<void> };
const AccountContext = createContext<AccountState | null>(null);

export function CollectorAccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refreshAccount = useCallback(async () => {
    try { setAccount(await requestJSON<Account>('/api/account')); setError(''); }
    catch (e) { setAccount(null); setError(e instanceof Error ? e.message : 'Could not load your account.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshAccount(); }, [refreshAccount]);
  return <AccountContext.Provider value={{ account, error, loading, refreshAccount }}>{children}</AccountContext.Provider>;
}

export function useCollectorAccount() {
  const state = useContext(AccountContext);
  if (!state) throw new Error('Collector account provider is missing.');
  return state;
}

export function CollectorAccountMenu() {
  const { account, loading, error, refreshAccount } = useCollectorAccount();
  if (loading) return <span className="collector-account-status" role="status">Loading account…</span>;
  if (!account) return <div className="collector-account-status"><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>{error && <button type="button" onClick={() => void refreshAccount()}>Retry account</button>}</div>;
  return <DropdownMenu><DropdownMenuTrigger className="collector-account-trigger" aria-label={`Collector menu: ${account.displayName || 'Collector'}`}><span>{account.displayName || 'Collector'}</span><ChevronDown size={16} aria-hidden="true" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="collector-account-menu"><DropdownMenuItem asChild><a href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={16} aria-hidden="true" />Sign out</a></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
