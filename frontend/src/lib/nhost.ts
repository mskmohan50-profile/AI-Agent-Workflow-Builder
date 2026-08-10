import { createClient } from '@nhost/nhost-js';

export const nhost = createClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN ?? 'localhost',
  region: process.env.NEXT_PUBLIC_NHOST_REGION ?? '',
});
