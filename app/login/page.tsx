import Image from 'next/image';
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

          <LoginForm hasError={hasError} />
        </div>
      </div>
    </div>
  );
}
