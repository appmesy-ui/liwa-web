import { createClient } from '@supabase/supabase-js';

export const supabaseBrowser = () => {
  // Usar SOLO las públicas en el navegador
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, anon);
};
