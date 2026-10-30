import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, type Role } from '../../../shared/domain';
import { Icon, Logo, type IconName } from '../components/icons';
import { Loading } from '../components/ui';
import { useAuth } from '../lib/auth';

export interface NavItem { to: string; label: string; icon: IconName; end?: boolean; badge?: number }
export interface NavGroup { label?: string; items: NavItem[] }

export function EnvBanner() {
  const { config } = useAuth();
  if (!config || config.isProduction) return null;
  return <div className="env-banner"><strong>{config.environment.toUpperCase()} environment.</strong> Sample hotels and rates are for demonstration only{config.sandboxSupplier ? ' · sandbox supplier responses are simulated' : ''}.</div>;
}

/** Shared shell for the agent portal, admin console and partner workspace. Enforces the role on the client; the server enforces it again. */
export function PortalLayout({ roles, nav, sub, footer }: { roles: Role[]; nav: NavGroup[]; sub: string; footer?: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to="/login?wrong=1" replace />;
  return (
    <>
      <div className="portal">
        <div className="topbar">
          <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <Logo sub={sub} />
          <span style={{ width: 36 }} />
        </div>
        {open && <div className="overlay" onClick={() => setOpen(false)} />}
        <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
          <div className="brand row between"><Logo sub={sub} />{open && <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="x" /></button>}</div>
          <nav className="side-nav">
            {nav.map((g, i) => (
              <div key={i} className="stack gap-1">
                {g.label && <div className="side-group">{g.label}</div>}
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                    <Icon name={it.icon} size={18} />{it.label}{!!it.badge && <span className="side-badge">{it.badge}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            {footer}
            <div className="side-user"><div>{user.name}</div><div className="subtle">{user.agencyName ?? ROLE_LABEL[user.role]}</div></div>
            <button className="side-link" style={{ background: 'none', border: 0, cursor: 'pointer', width: '100%' }} onClick={async () => { await logout(); navigate('/'); }}>
              <Icon name="logout" size={18} />Sign out
            </button>
          </div>
        </aside>
        <main className="main" id="main"><EnvBanner /><Outlet /></main>
      </div>
    </>
  );
}
