import { createServiceClient } from '@/lib/supabase/service';
import { DispatcherAssignment, Driver } from '@/lib/types';

/**
 * SERVER ONLY — the one place viewer-mode board data is loaded, shared by the
 * /view page's first render and the /view/data poll so the two can never drift
 * apart on either the ordering or the redaction below.
 */

export interface ViewerBoardData {
  drivers: Driver[];
  dispatchers: DispatcherAssignment[];
}

/**
 * Personal contact details are removed before the rows leave the server.
 *
 * Doing it here rather than hiding the field in the UI is the point: viewer mode
 * is handed out far more widely than the dispatcher login, and a number that was
 * only hidden by CSS would still sit in the page payload for anyone who opened
 * devtools. Dispatchers keep tap-to-call/copy on the real board, which is the
 * only place the number is actually needed.
 *
 * Blanked rather than deleted so the rows stay shaped like `Driver` and the
 * board components need no viewer-specific types. Search stops matching phones
 * on its own as a result (matchDriver needs 3+ digits to match).
 */
function redactForViewers(driver: Driver): Driver {
  return { ...driver, phone: '', walkie_number: null };
}

export async function loadViewerBoardData(): Promise<ViewerBoardData> {
  const supabase = createServiceClient();

  const [driversResult, dispatchersResult] = await Promise.all([
    supabase
      .from('drivers')
      .select('*')
      .is('checked_out_at', null)
      // Same two-key ordering as the dispatcher board: checked_in_at breaks
      // lane_order ties deterministically so cards can't swap places between polls.
      .order('lane_order', { ascending: true })
      .order('checked_in_at', { ascending: true }),
    supabase.from('dispatcher_assignments').select('*'),
  ]);

  if (driversResult.error) throw driversResult.error;
  if (dispatchersResult.error) throw dispatchersResult.error;

  return {
    drivers: ((driversResult.data as Driver[]) ?? []).map(redactForViewers),
    dispatchers: (dispatchersResult.data as DispatcherAssignment[]) ?? [],
  };
}
