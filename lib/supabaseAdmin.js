import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = () => {
  // Usar SOLO en servidor (route handlers / server actions)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error('Faltan vars de entorno de Supabase en el servidor');
  }
  return createClient(url, service, { auth: { persistSession: false } });
};
