'use client';

import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { nhost } from './nhost';

const HASURA_HTTP = process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL as string;
const HASURA_WS = HASURA_HTTP.replace(/^http/, 'ws');

function makeClient() {
  const httpLink = new HttpLink({
    uri: HASURA_HTTP,
    fetch: async (uri, options: any) => {
      const token = nhost.getUserSession()?.accessToken;
      options.headers = {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      return fetch(uri as any, options);
    },
  });

  const wsLink =
    typeof window !== 'undefined'
      ? new GraphQLWsLink(
          createClient({
            url: HASURA_WS,
            connectionParams: () => {
              const token = nhost.getUserSession()?.accessToken;
              return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
            },
          }),
        )
      : null;

  const splitLink =
    typeof window !== 'undefined' && wsLink
      ? split(
          ({ query }) => {
            const def = getMainDefinition(query);
            return def.kind === 'OperationDefinition' && def.operation === 'subscription';
          },
          wsLink,
          httpLink,
        )
      : httpLink;

  return new ApolloClient({ link: splitLink, cache: new InMemoryCache() });
}

export const apolloClient = makeClient();
