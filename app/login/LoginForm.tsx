'use client';

import { useFormStatus } from 'react-dom';
import { login } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-opacity"
      style={{ backgroundColor: 'var(--brand)', opacity: pending ? 0.7 : 1 }}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Signing in...
        </span>
      ) : (
        'Sign In'
      )}
    </button>
  );
}

export default function LoginForm({ hasError }: { hasError: boolean }) {
  return (
    <form action={login} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-bold uppercase tracking-widest text-fg-faint mb-1.5"
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
          className="w-full px-3 py-2.5 rounded-lg text-sm text-fg-strong outline-none"
          style={{
            backgroundColor: 'var(--surface-input)',
            border: `1px solid ${hasError ? 'var(--brand)' : 'var(--edge)'}`,
          }}
          placeholder="••••••••"
        />
      </div>

      {hasError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Incorrect access code. Please try again.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
