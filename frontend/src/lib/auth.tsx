'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { nhost } from './nhost';
import type { StoredSession } from '@nhost/nhost-js/session';

interface AuthState {
  session: StoredSession | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: nhost.getUserSession(), isLoading: true });

  useEffect(() => {
    setState({ session: nhost.getUserSession(), isLoading: false });
    const unsubscribe = nhost.sessionStorage.onChange((session) => {
      setState({ session, isLoading: false });
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuthenticationStatus() {
  const { session, isLoading } = useContext(AuthContext);
  return { isAuthenticated: !!session, isLoading };
}

export function useUserId(): string | undefined {
  const { session } = useContext(AuthContext);
  return session?.user?.id;
}

export function useSignOut() {
  const signOut = useCallback(async () => {
    const session = nhost.getUserSession();
    if (session?.refreshTokenId) {
      await nhost.auth.signOut({ refreshToken: session.refreshTokenId }).catch(() => {});
    }
    nhost.clearSession();
  }, []);
  return { signOut };
}

export async function signInEmailPassword(email: string, password: string) {
  const res = await nhost.auth.signInEmailPassword({ email, password });
  if (res.status >= 300) {
    return { error: (res.body as any)?.message ?? 'Sign in failed' };
  }
  return { error: null };
}

export async function signUpEmailPassword(email: string, password: string) {
  const res = await nhost.auth.signUpEmailPassword({ email, password });
  if (res.status >= 300) {
    return { error: (res.body as any)?.message ?? 'Sign up failed' };
  }
  return { error: null };
}
