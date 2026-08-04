'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

// Single shared dispatcher account — create this user once in the Supabase Auth dashboard.
// The email is not shown to users; they only enter the password.
const DISPATCHER_EMAIL = process.env.DISPATCHER_EMAIL ?? 'dispatcher@nbotennis.com';

export async function login(formData: FormData) {
  const password = formData.get('password') as string;

  if (!password) {
    redirect('/login?error=1');
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: DISPATCHER_EMAIL,
    password,
  });

  if (error) {
    redirect('/login?error=1');
  }

  redirect('/');
}

export async function logout() {
  const supabase = await createClient();
  // Every screen shares ONE dispatcher account, and signOut() defaults to
  // scope 'global', which revokes every device's session at once — so a
  // volunteer signing out at shift end quietly killed the login on every
  // other laptop and TV within the hour. 'local' ends only this device's
  // session; rotating the account password is still the kick-everyone lever.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login');
}
