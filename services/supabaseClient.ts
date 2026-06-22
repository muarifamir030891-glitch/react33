import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { config } from '../config';

// The Supabase URL and Key are now sourced from the central config file.
const supabaseUrl = config.supabase.url;
const supabaseAnonKey = config.supabase.anonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // This check is kept as a safeguard. It will trigger if config.ts is not filled out.
  throw new Error("Supabase URL and Anon Key must be provided in config.ts to initialize the client.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
