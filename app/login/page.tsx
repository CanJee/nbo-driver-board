import Image from 'next/image';
import { login } from './actions';

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
      style={{ backgroundColor: '#0D1117' }}
    >
      <div className="w-full max-w-sm px-4">
        <div className="flex justify-center mb-8">
          <Image
            src="/NBO-Dark.png"
            alt="National Bank Open"
            width={200}
            height={73}
            style={{ height: 'auto' }}
            priority
          />
        </div>

        <div
          className="rounded-xl p-8"
          style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}
        >
          <h1 className="text-lg font-bold text-white mb-1 text-center">
            Transportation Dispatch
          </h1>
          <p className="text-sm text-slate-400 mb-6 text-center">
            Enter your access code to continue
          </p>

          <form action={login} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5"
              >
                Access Code
              </label>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none focus:ring-1"
                style={{
                  backgroundColor: '#0D1117',
                  border: `1px solid ${hasError ? '#E41C23' : '#2D3748'}`,
                }}
                placeholder="••••••••"
              />
            </div>

            {hasError && (
              <p className="text-sm text-red-400">
                Incorrect access code. Please try again.
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: '#E41C23' }}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
