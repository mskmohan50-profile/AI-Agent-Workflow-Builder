'use client';

import { useState } from 'react';
import { signInEmailPassword, signUpEmailPassword } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = mode === 'signin' ? await signInEmailPassword(email, password) : await signUpEmailPassword(email, password);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace('/workflows');
  }

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 rounded-xl bg-slate-900 border border-slate-800">
      <h1 className="text-xl font-semibold mb-4">AI Agent Workflow Builder</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full rounded bg-slate-800 px-3 py-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded bg-slate-800 px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="w-full rounded bg-indigo-600 hover:bg-indigo-500 py-2 font-medium" type="submit">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        className="text-sm text-slate-400 mt-3 underline"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
