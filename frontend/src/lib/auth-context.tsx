'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { nhost } from './nhost';

interface StoredUser {
  id: string;
}

interface AuthState {
  userId: string | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthState>({ userId: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, isLoading: true });

  useEffect(() => {
    const session = nhost.getUserSession();
    setState({ userId: (session?.user as StoredUser | undefined)?.id ?? null, isLoading: false });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuthenticationStatus() {
  const { userId, isLoading } = useContext(AuthContext);
  return { isAuthenticated: !!userId, isLoading };
}

export function useUserId(): string | null {
  return useContext(AuthContext).userId;
}

export function useSignOut() {
  const signOut = useCallback(() => {
    nhost.clearSession();
    window.location.href = '/login';
  }, []);
  return { signOut };
}
