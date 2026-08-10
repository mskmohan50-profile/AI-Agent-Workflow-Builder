'use client';

import { useAuthenticationStatus } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? '/workflows' : '/login');
  }, [isAuthenticated, isLoading, router]);

  return <div className="p-8 text-slate-400">Loading…</div>;
}
