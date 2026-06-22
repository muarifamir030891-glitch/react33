
import { supabase } from './supabaseClient';
import type { User } from '../types';
import { config } from '../config';

const AUTH_KEY = 'swimcomp_auth_user';

export const login = async (email?: string, password?: string): Promise<User | null> => {
  if (!email || !password) {
      throw new Error("Email dan kata sandi wajib diisi.");
  }

  // Step 1: Try real Supabase Auth first
  // This ensures that even if credentials match the config, we still get a real JWT if the user exists in Supabase.
  const { data: authSession, error: authError } = await (supabase.auth as any).signInWithPassword({
    email: email,
    password: password,
  });
  
  if (!authError && authSession?.user) {
    const authUser = authSession.user;
    
    // Fetch their role from our public.users table.
    const { data: profileData } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();

    const finalUser: User = {
      ...authUser,
      role: (profileData as { role: 'SUPER_ADMIN' | 'ADMIN' })?.role || 'ADMIN',
    };

    sessionStorage.setItem(AUTH_KEY, JSON.stringify(finalUser));
    return finalUser;
  }

  // Step 2: Fallback to local Super Admin check if Supabase login fails OR user doesn't exist yet.
  if (email === config.superAdmin.email && password === config.superAdmin.password) {
    const superAdminUser: User = {
      id: 'super-admin-local',
      role: 'SUPER_ADMIN',
      email: config.superAdmin.email,
      app_metadata: { provider: 'local' },
      user_metadata: { full_name: 'Super Admin (Local Fallback)' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    };
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(superAdminUser));
    return superAdminUser;
  }

  // Step 3: If both failed, throw the Supabase error.
  if (authError) {
    console.error("Supabase Auth sign-in failed:", authError.name, authError.message);
    if (authError.message.includes("Invalid login credentials")) {
      throw new Error("Login Gagal: Kredensial tidak valid. PERIKSA: Email dan kata sandi Anda. Jika ini akun baru, pastikan email sudah dikonfirmasi.");
    }
    throw new Error(authError.message);
  }
  
  return null;
};

export const logout = async (): Promise<void> => {
  sessionStorage.removeItem(AUTH_KEY);
  // FIX: Replaced `logout` with `signOut` for compatibility with Supabase JS v2.
  // Using (supabase.auth as any) to bypass potential type definition mismatches.
  const { error } = await (supabase.auth as any).signOut();
  if (error) {
    console.error("Error logging out:", error.message);
  }
};

export const getCurrentUser = (): User | null => {
  const data = sessionStorage.getItem(AUTH_KEY);
  try {
    const user = data ? JSON.parse(data) : null;
    return user;
  } catch (error) {
    console.error("Failed to parse user from session storage", error);
    return null;
  }
};

export const isLoggedIn = (): boolean => {
  return getCurrentUser() !== null;
};
