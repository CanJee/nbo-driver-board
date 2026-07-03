import NboLogo from '@/components/ui/NboLogo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import LoginForm from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = Boolean(params.error);

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
            Transportation Dispatch
          </h1>
          <p className="text-sm text-fg-muted mb-6 text-center">
            Enter your access code to continue
          </p>

          <LoginForm hasError={hasError} />
        </div>
      </div>
    </div>
  );
}
