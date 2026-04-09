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
  await supabase.auth.signOut();
  redirect('/login');
}
