'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

export default function PendingCount() {
  const supabase = getSupabaseBrowserClient();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { count, error } = await supabase
        .schema('liwa')
        .from('v_pending_events_ui')
        .select('id', { count: 'exact', head: true });
      if (!error) setCount(count ?? 0);
    })();
  }, [supabase]);

  if (count === null) return null;

  return (
    <span className="ml-2 inline-flex items-center justify-center rounded-full text-xs px-2 py-1 bg-red-600/20 text-red-300">
      {count}
    </span>
  );
}
