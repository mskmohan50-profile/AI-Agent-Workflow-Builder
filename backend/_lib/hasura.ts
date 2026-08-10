const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT as string;
const HASURA_GRAPHQL_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET as string;

export async function gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  if (!HASURA_GRAPHQL_ENDPOINT || !HASURA_GRAPHQL_ADMIN_SECRET) {
    throw new Error('HASURA_GRAPHQL_ENDPOINT / HASURA_GRAPHQL_ADMIN_SECRET not set');
  }

  const res = await fetch(HASURA_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data: T; errors?: any };
  if (json.errors) {
    throw new Error(`Hasura error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}
