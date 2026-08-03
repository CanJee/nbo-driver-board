import type { Metadata } from 'next';
import NboLogo from '@/components/ui/NboLogo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import ViewerLoginForm from './ViewerLoginForm';

// The board is staff-only even in view mode, so keep it out of search results.
export const metadata: Metadata = {
  title: 'NBO Dispatch Board - View Only',
  robots: { index: false, follow: false },
};

export default async function ViewerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ?? null;

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--surface-page)' }}
    >
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm px-4">
        <div className="flex justify-center mb-8">
          <NboLogo width={200} height={73} />
        </div>

        <div
          className="rounded-xl p-8"
          style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
        >
          <h1 className="text-lg font-bold text-fg-strong mb-1 text-center">
            Transportation Board
          </h1>
          <p className="text-sm text-fg-muted mb-6 text-center">
            View only. Enter the viewer code to watch the live board.
          </p>

          <ViewerLoginForm error={error} />
        </div>
      </div>
    </div>
  );
}
