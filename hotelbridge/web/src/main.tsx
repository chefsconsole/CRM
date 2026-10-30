import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/site.css';
import { AuthProvider } from './lib/auth';
import { Loading, ToastProvider } from './components/ui';
import { PublicLayout } from './layouts/PublicLayout';
import { PortalLayout, type NavGroup } from './layouts/PortalLayout';
import Home from './pages/public/Home';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import PartnerApply from './pages/public/PartnerApply';
import { HowItWorks, Legal } from './pages/public/Info';
import Overview from './pages/agent/Overview';
import Search from './pages/agent/Search';
import HotelDetail from './pages/agent/HotelDetail';
import Checkout from './pages/agent/Checkout';
import { BookingDetail, BookingList } from './pages/agent/Bookings';
import { GroupDetail, GroupList, GroupNew } from './pages/agent/Groups';
import { Agency, Finance, Saved, Support, SupportDetail } from './pages/agent/Account';

// Staff and partner bundles are loaded only when needed.
const AdminOverview = lazy(() => import('./pages/admin/Overview'));
const Ops = () => import('./pages/admin/Ops');
const Cat = () => import('./pages/admin/Catalogue');
const Con = () => import('./pages/admin/Contracts');
const Grp = () => import('./pages/admin/Groups');
const Net = () => import('./pages/admin/Network');
const L = <T extends Record<string, any>>(load: () => Promise<T>, name: keyof T) => lazy(async () => ({ default: (await load())[name] }));
const AdminBookings = L(Ops, 'AdminBookings'), AdminBookingDetail = L(Ops, 'AdminBookingDetail'), AdminFinance = L(Ops, 'AdminFinance');
const AdminHotels = L(Cat, 'AdminHotels'), AdminHotelEdit = L(Cat, 'AdminHotelEdit');
const AdminContracts = L(Con, 'AdminContracts'), AdminContractNew = L(Con, 'AdminContractNew'), AdminContractDetail = L(Con, 'AdminContractDetail');
const AdminGroups = L(Grp, 'AdminGroups'), AdminGroupDetail = L(Grp, 'AdminGroupDetail');
const AdminAgencies = L(Net, 'AdminAgencies'), AdminAgencyDetail = L(Net, 'AdminAgencyDetail'), AdminPricing = L(Net, 'AdminPricing'), AdminSuppliers = L(Net, 'AdminSuppliers');
const AdminApplications = L(Net, 'AdminApplications'), AdminSupport = L(Net, 'AdminSupport'), AdminSupportDetail = L(Net, 'AdminSupportDetail');
const AdminScenarios = L(Net, 'AdminScenarios'), AdminAudit = L(Net, 'AdminAudit'), AdminStaff = L(Net, 'AdminStaff');
const PartnerOverview = lazy(() => import('./pages/partner/Overview'));

const AGENT_NAV: NavGroup[] = [{ items: [
  { to: '/app', label: 'Overview', icon: 'overview', end: true },
  { to: '/app/search', label: 'Search hotels', icon: 'search' },
  { to: '/app/bookings', label: 'My bookings', icon: 'calendar' },
  { to: '/app/groups', label: 'Group Desk', icon: 'groups' },
  { to: '/app/saved', label: 'Saved hotels', icon: 'heart' },
  { to: '/app/finance', label: 'Invoices & payments', icon: 'receipt' },
  { to: '/app/agency', label: 'Agency profile', icon: 'building' },
  { to: '/app/support', label: 'Support', icon: 'help' },
] }];

const ADMIN_NAV: NavGroup[] = [
  { items: [{ to: '/admin', label: 'Overview', icon: 'chart', end: true }] },
  { label: 'Operations', items: [
    { to: '/admin/bookings', label: 'Bookings', icon: 'calendar' },
    { to: '/admin/groups', label: 'Group Desk', icon: 'groups' },
    { to: '/admin/support', label: 'Support', icon: 'help' },
    { to: '/admin/finance', label: 'Finance', icon: 'coins' },
  ] },
  { label: 'Supply', items: [
    { to: '/admin/hotels', label: 'Hotels', icon: 'building' },
    { to: '/admin/contracts', label: 'Contracts', icon: 'contract' },
    { to: '/admin/suppliers', label: 'Inventory sources', icon: 'plug' },
    { to: '/admin/pricing', label: 'Pricing & FX', icon: 'sliders' },
  ] },
  { label: 'Network', items: [
    { to: '/admin/agencies', label: 'Agencies', icon: 'user' },
    { to: '/admin/applications', label: 'Applications', icon: 'inbox' },
  ] },
  { label: 'Company', items: [
    { to: '/admin/scenarios', label: 'Scenarios', icon: 'chart' },
    { to: '/admin/audit', label: 'Audit log', icon: 'shield' },
    { to: '/admin/staff', label: 'Team', icon: 'groups' },
  ] },
];

const PARTNER_NAV: NavGroup[] = [{ items: [{ to: '/partner', label: 'Bookings & production', icon: 'calendar', end: true }] }];

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="partners/hotels" element={<PartnerApply kind="hotel" />} />
          <Route path="partners/distribution" element={<PartnerApply kind="distribution" />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="privacy" element={<Legal kind="privacy" />} />
          <Route path="terms" element={<Legal kind="terms" />} />
        </Route>
        <Route path="app" element={<PortalLayout roles={['agency_admin', 'agency_agent']} nav={AGENT_NAV} sub="Agent" />}>
          <Route index element={<Overview />} />
          <Route path="search" element={<Search />} />
          <Route path="hotels/:slug" element={<HotelDetail />} />
          <Route path="checkout/:offerId" element={<Checkout />} />
          <Route path="bookings" element={<BookingList />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
          <Route path="groups" element={<GroupList />} />
          <Route path="groups/new" element={<GroupNew />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="saved" element={<Saved />} />
          <Route path="finance" element={<Finance />} />
          <Route path="agency" element={<Agency />} />
          <Route path="support" element={<Support />} />
          <Route path="support/:id" element={<SupportDetail />} />
        </Route>
        <Route path="admin" element={<PortalLayout roles={['hb_admin', 'hb_ops', 'hb_finance']} nav={ADMIN_NAV} sub="Console" />}>
          <Route index element={<AdminOverview />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="bookings/:id" element={<AdminBookingDetail />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="hotels" element={<AdminHotels />} />
          <Route path="hotels/:id" element={<AdminHotelEdit />} />
          <Route path="contracts" element={<AdminContracts />} />
          <Route path="contracts/new" element={<AdminContractNew />} />
          <Route path="contracts/:id" element={<AdminContractDetail />} />
          <Route path="groups" element={<AdminGroups />} />
          <Route path="groups/:id" element={<AdminGroupDetail />} />
          <Route path="agencies" element={<AdminAgencies />} />
          <Route path="agencies/:id" element={<AdminAgencyDetail />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="suppliers" element={<AdminSuppliers />} />
          <Route path="applications" element={<AdminApplications />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="support/:id" element={<AdminSupportDetail />} />
          <Route path="scenarios" element={<AdminScenarios />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="staff" element={<AdminStaff />} />
        </Route>
        <Route path="partner" element={<PortalLayout roles={['hotel_partner']} nav={PARTNER_NAV} sub="Partner" />}>
          <Route index element={<PartnerOverview />} />
        </Route>
        <Route path="*" element={<PublicLayout />}><Route path="*" element={<div className="auth-shell"><div className="stack gap-3" style={{ textAlign: 'center' }}><h1>Page not found</h1><a href="/">Return home</a></div></div>} /></Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider><App /></ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
