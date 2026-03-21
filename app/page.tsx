import { createClient } from '@/lib/supabase/server';
import Board from '@/components/board/Board';
import { Driver } from '@/lib/types';

export default async function Home() {
  const supabase = await createClient();

  const { data: drivers } = await supabase
    .from('drivers')
    .select('*')
    .is('checked_out_at', null)
    .order('lane_order', { ascending: true });

  const { data: dispatchers } = await supabase
    .from('dispatcher_assignments')
    .select('*');

  return (
    <Board
      initialDrivers={(drivers as Driver[]) ?? []}
      initialDispatchers={dispatchers ?? []}
    />
  );
}
