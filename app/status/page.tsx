import StatusDashboard from './StatusDashboard';

// Protected by the proxy middleware (redirects unauthenticated users to /login).
//
// Deliberately renders no data of its own: the page's whole job is to test what
// the VIEWING DEVICE can reach, and it must keep working when that device can't
// reach the database at all. The auth check runs on Vercel's edge, not from the
// venue's network, so this page still loads when the board can't.
export const metadata = {
  title: 'Connection Status — NBO Transportation Dispatch',
};

export default function StatusPage() {
  return <StatusDashboard />;
}
