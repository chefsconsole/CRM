import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, post, setCsrf } from './api';
import type { Role } from '../../../shared/domain';

export interface SessionUser { id: string; name: string; email: string; role: Role; agencyId: string | null; agencyName: string | null; agencyStatus: string | null; hotelId: string | null }
export interface PublicConfig { environment: string; isProduction: boolean; sandboxSupplier: boolean; contactEmail: string | null; contactPhone: string | null }

interface AuthState {
  user: SessionUser | null; ready: boolean; config: PublicConfig | null;
  login: (email: string, password: string) => Promise<SessionUser>; logout: () => Promise<void>; refresh: () => Promise<void>;
}
const Ctx = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: SessionUser; csrfToken: string }>('/auth/me');
      setCsrf(me.csrfToken);
      setUser(me.user);
    } catch { setUser(null); }
  }, []);
  useEffect(() => {
    Promise.all([refresh(), api<PublicConfig>('/public/config').then(setConfig).catch(() => {})]).finally(() => setReady(true));
  }, [refresh]);
  const login = async (email: string, password: string) => {
    const r = await post<{ csrfToken: string }>('/auth/login', { email, password });
    setCsrf(r.csrfToken);
    const me = await api<{ user: SessionUser; csrfToken: string }>('/auth/me');
    setCsrf(me.csrfToken);
    setUser(me.user);
    return me.user;
  };
  const logout = async () => { await post('/auth/logout').catch(() => {}); setCsrf(''); setUser(null); };
  return <Ctx.Provider value={{ user, ready, config, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const isStaff = (r?: Role) => r === 'hb_admin' || r === 'hb_ops' || r === 'hb_finance';
export const isAgency = (r?: Role) => r === 'agency_admin' || r === 'agency_agent';
export const homeFor = (u: SessionUser) => (isStaff(u.role) ? '/admin' : u.role === 'hotel_partner' ? '/partner' : '/app');
