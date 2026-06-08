import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Création paresseuse : le client n'est instancié qu'à la première utilisation
// réelle (côté navigateur, dans un effet/handler), jamais au prerender du build.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Variables Supabase manquantes : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  _client = createClient(url, anon, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

// Proxy : `supabase.from(...)` fonctionne comme avant, mais l'instanciation
// est différée jusqu'au premier accès à une propriété.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
