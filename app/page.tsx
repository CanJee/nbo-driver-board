import { createClient } from '@/lib/supabase/server';
import Board from '@/components/board/Board';
import { Driver, Lane, LANE_SELECT } from '@/lib/types';

export default async function Home() {
  const supabase = await createClient();

  const { data: drivers } = await supabase
    .from('drivers')
    .select('*')
    .is('checked_out_at', null)
    // Matches the client-side refetch in Board: checked_in_at breaks lane_order
    // ties deterministically so cards can't swap places between loads.
    .order('lane_order', { ascending: true })
    .order('checked_in_at', { ascending: true });

  const { data: dispatchers } = await supabase
    .from('dispatcher_assignments')
    .select('*');

  // Every lane row, hidden included — Board filters to active for the columns;
  // the full list drives labels for legacy data and the Lanes manager.
  const { data: lanes } = await supabase
    .from('lanes')
    .select(LANE_SELECT)
    .order('sort_order', { ascending: true });

  return (
    <Board
      initialDrivers={(drivers as Driver[]) ?? []}
      initialDispatchers={dispatchers ?? []}
      initialLanes={(lanes as Lane[]) ?? []}
    />
  );
}
