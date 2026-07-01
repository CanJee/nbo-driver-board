import RosterImport from './RosterImport';

// Protected by the proxy middleware (redirects unauthenticated users to /login).
export default function ImportPage() {
  return <RosterImport />;
}
