/**
 * =================================================================
 * 🚀 AQUATIC SWIMTRACK CONFIGURATION 🚀
 * =================================================================
 * This file contains all the essential settings for your application.
 * Update these values to match your own project setup.
 *
 * INSTRUCTIONS:
 * 1. Fill in your Supabase URL and Public Anon Key.
 * 2. Customize the application and competition default names.
 * =================================================================
 */

export const config = {
  /**
   * Supabase Project Credentials
   * Found in your Supabase project's "Project Settings" > "API"
   */
  supabase: {
    url: "https://oyymqzfxjhjktbgcbzxw.supabase.co", // 👈 VITE_SUPABASE_URL
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eW1xemZ4amhqa3RiZ2Nienh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTQ4MzUsImV4cCI6MjA5Mzk3MDgzNX0.CvAbF7Q5yytAUHmTE5yeQbp6sOfRMDMxUsu5cIKeKD0", // 👈 VITE_SUPABASE_ANON_KEY
  },

  /**
   * Super Admin Credentials
   * This account bypasses database authentication and provides full access.
   * IMPORTANT: Use strong, unique credentials.
   */
  superAdmin: {
    email: "akuatiksulsel@gmail.com", // 👈 Change this for the super admin login
    password: "12345", // 👈 Change this for the super admin login
  },

  /**
   * Application Display Information
   * Used in page titles and headers.
   */
  app: {
    name: "R.E.A.C.T",
    title: "R.E.A.C.T",
    shortTitle: "REACT",
  },

  /**
   * Default Competition Settings
   * Used when initializing the competition for the first time or when clearing data.
   */
  competition: {
    defaultName: "My Swim Meet",
    defaultLanes: 8,
  },
};