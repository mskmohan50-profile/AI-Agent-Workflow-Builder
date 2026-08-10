'use client';

import { ApolloProvider } from '@apollo/client';
import { AuthProvider } from '@/lib/auth';
import { apolloClient } from '@/lib/apollo';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
    </AuthProvider>
  );
}
