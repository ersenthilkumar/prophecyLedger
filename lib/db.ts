import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _client: NeonQueryFunction<false, false> | undefined;

function getClient(): NeonQueryFunction<false, false> {
  if (!_client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _client = neon(process.env.DATABASE_URL);
  }
  return _client;
}

// Proxy defers initialization to first query, so the build succeeds without DATABASE_URL
export const sql = new Proxy(function () {} as unknown as NeonQueryFunction<false, false>, {
  apply(_t, _this, args) {
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_t, prop) {
    return (getClient() as unknown as Record<string, unknown>)[prop as string];
  },
});
