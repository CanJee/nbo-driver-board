import { createClient } from '@/lib/supabase/server';
import { Lane, LANE_SELECT } from '@/lib/types';
import RosterImport from './RosterImport';

// Protected by the proxy middleware (redirects unauthenticated users to /login).
export default async function ImportPage() {
  const supabase = await createClient();

  // All lanes, hidden included: rows only map onto active lanes, but labels for
  // previously-imported data may need the hidden ones.
  const { data: lanes } = await supabase
    .from('lanes')
    .select(LANE_SELECT)
    .order('sort_order', { ascending: true });

  return <RosterImport lanes={(lanes as Lane[]) ?? []} />;
}
