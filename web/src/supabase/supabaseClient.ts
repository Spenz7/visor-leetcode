import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

function createMockClient() {
  const auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (_cb: any) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async (_opts: any) => ({ error: null, data: null }),
  };

  function queryBuilder(): any {
    const qb: any = {
      select: () => qb,
      eq: () => qb,
      ilike: () => qb,
      order: () => qb,
      limit: () => qb,
      range: () => qb,
      single: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      delete: () => qb,
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: null, error: null, count: 0 }).then(
          resolve,
          reject,
        ),
    };
    return qb;
  }

  return { from: (_table: string) => queryBuilder(), auth };
}

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : (createMockClient() as any);
