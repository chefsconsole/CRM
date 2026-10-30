import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, Logo } from '../components/icons';
import { homeFor, useAuth } from '../lib/auth';
import { EnvBanner } from './PortalLayout';

export function PublicLayout() {
  const { user, config } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setOpen(false); if (!loc.hash) window.scrollTo(0, 0); }, [loc.pathname, loc.hash]);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 24); h(); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h); }, []);
  const dark = loc.pathname === '/' && !scrolled;
  return (
    <div className="site">
      <EnvBanner />
      <header className={`site-header${dark ? ' on-dark' : ''}`}>
        <div className="site-wrap row between">
          <Link to="/" aria-label="HotelBridge Global home"><Logo dark={!dark} /></Link>
          <nav className={`site-nav${open ? ' open' : ''}`} aria-label="Site">
            <a href="/#network">Network</a>
            <a href="/#agents">For agents</a>
            <a href="/#hotels">For hotels</a>
            <a href="/#groups">Group Desk</a>
            <NavLink to="/how-it-works">How it works</NavLink>
            <span className="site-nav-cta">
              {user ? <Link className="btn btn-sm" to={homeFor(user)}>Open workspace</Link>
                : <><Link className="btn btn-sm btn-ghost" to="/login">Sign in</Link><Link className="btn btn-sm" to="/register">Register agency</Link></>}
            </span>
          </nav>
          <button className="icon-btn site-menu" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu"><Icon name={open ? 'x' : 'menu'} /></button>
        </div>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="site-footer">
        <div className="site-wrap">
          <div className="footer-grid">
            <div className="stack gap-3">
              <Logo />
              <p className="footer-note">A curated B2B hotel distribution network for travel agents, tour operators and DMCs.</p>
            </div>
            <div className="stack gap-2"><span className="footer-h">Agents</span><Link to="/register">Register your agency</Link><Link to="/login">Agent sign in</Link><a href="/#groups">Group Desk</a></div>
            <div className="stack gap-2"><span className="footer-h">Partners</span><Link to="/partners/hotels">Hotel partnerships</Link><Link to="/partners/distribution">Distribution partners</Link></div>
            <div className="stack gap-2"><span className="footer-h">Company</span><Link to="/how-it-works">Bookings, payments &amp; support</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
              {config?.contactEmail && <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>}
            </div>
          </div>
          <div className="footer-base"><span>© {new Date().getFullYear()} HotelBridge Global</span><span>Company registration details will be published here once confirmed.</span></div>
        </div>
      </footer>
    </div>
  );
}
