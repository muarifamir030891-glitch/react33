-- R.E.A.C.T Full Database Schema
-- Version: 1.2.5
-- Description: Complete schema including Competition Info, Swimmers, Events, Results, and Records.

-- 1. Create custom types for enums (Safe Execution)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swim_style') THEN
        CREATE TYPE public.swim_style AS ENUM ('Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Medley', 'Papan Luncur');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN
        CREATE TYPE public.gender AS ENUM ('Men''s', 'Women''s', 'Mixed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swimmer_gender') THEN
        CREATE TYPE public.swimmer_gender AS ENUM ('Male', 'Female');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_type') THEN
        CREATE TYPE public.record_type AS ENUM ('PORPROV', 'Nasional');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('SUPER_ADMIN', 'ADMIN');
    END IF;
END $$;

-- 2. Table for Competition Information
CREATE TABLE IF NOT EXISTS public.competition_info (
    id bigint PRIMARY KEY DEFAULT 1,
    event_name text NOT NULL,
    event_date date NOT NULL,
    event_logo text,
    sponsor_logo text,
    is_registration_open boolean NOT NULL DEFAULT false,
    number_of_lanes integer NOT NULL DEFAULT 8,
    registration_deadline timestamp with time zone,
    age_groups text,
    is_free boolean DEFAULT true,
    recipient_name text,
    account_number text,
    fee_per_event integer DEFAULT 0
);

-- MIGRATION SUPPORT: Ensure columns exist for older databases
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS fee_per_event integer DEFAULT 0;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS age_groups text;

-- 3. Table for Swimmers
CREATE TABLE IF NOT EXISTS public.swimmers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    birth_year integer NOT NULL,
    gender public.swimmer_gender NOT NULL,
    club text NOT NULL,
    age_group text,
    payment_proof text,
    payment_amount integer,
    pic_name text,
    pic_phone text
);

-- MIGRATION SUPPORT: Ensure columns exist for older databases
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS payment_proof text;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS payment_amount integer;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_phone text;

-- 4. Table for Swim Events
CREATE TABLE IF NOT EXISTS public.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    distance integer NOT NULL,
    style public.swim_style NOT NULL,
    gender public.gender NOT NULL,
    session_number integer,
    heat_order integer,
    session_date_time timestamp with time zone,
    relay_legs integer,
    category text
);

-- 5. Table for Event Entries
CREATE TABLE IF NOT EXISTS public.event_entries (
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    seed_time bigint NOT NULL,
    checked_in BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (event_id, swimmer_id)
);

-- MIGRATION SUPPORT: Ensure columns exist for older databases
ALTER TABLE public.event_entries ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE;

-- 6. Table for Event Results
CREATE TABLE IF NOT EXISTS public.event_results (
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    "time" bigint NOT NULL,
    PRIMARY KEY (event_id, swimmer_id)
);

-- 7. Table for Swim Records
CREATE TABLE IF NOT EXISTS public.records (
    id text PRIMARY KEY,
    "type" public.record_type NOT NULL,
    gender public.gender NOT NULL,
    distance integer NOT NULL,
    style public.swim_style NOT NULL,
    "time" bigint NOT NULL,
    holder_name text NOT NULL,
    year_set integer NOT NULL,
    location_set text,
    relay_legs integer,
    category text
);

-- 8. Table for User Roles
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "role" public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 9. Table for Swimmer Payments History
CREATE TABLE IF NOT EXISTS public.swimmer_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    payment_proof text,
    payment_amount integer,
    created_at timestamp with time zone DEFAULT now()
);

-- 10. Table for Events History (Self Registration logs)
-- This facilitates tracking multiple registration events
CREATE TABLE IF NOT EXISTS public.registration_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    registration_date timestamp with time zone DEFAULT now(),
    payment_proof text,
    payment_amount integer,
    pic_name text,
    pic_phone text,
    event_ids uuid[] -- Store which events were registered in this session
);

-- 11. Setup RLS (Row Level Security)
ALTER TABLE public.competition_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimmer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_logs ENABLE ROW LEVEL SECURITY;

-- 12. Policies with existence check (Idempotent)
DO $$ BEGIN
    -- Public Read Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'competition_info') THEN
        CREATE POLICY "Public read access" ON public.competition_info FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'swimmers') THEN
        CREATE POLICY "Public read access" ON public.swimmers FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'events') THEN
        CREATE POLICY "Public read access" ON public.events FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'event_entries') THEN
        CREATE POLICY "Public read access" ON public.event_entries FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'event_results') THEN
        CREATE POLICY "Public read access" ON public.event_results FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'records') THEN
        CREATE POLICY "Public read access" ON public.records FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'swimmer_payments') THEN
        CREATE POLICY "Public read access" ON public.swimmer_payments FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'registration_logs') THEN
        CREATE POLICY "Public read access" ON public.registration_logs FOR SELECT USING (true);
    END IF;

    -- Admin Full Access Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'competition_info') THEN
        CREATE POLICY "Admin full access" ON public.competition_info FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'swimmers') THEN
        CREATE POLICY "Admin full access" ON public.swimmers FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'events') THEN
        CREATE POLICY "Admin full access" ON public.events FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'event_entries') THEN
        CREATE POLICY "Admin full access" ON public.event_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'event_results') THEN
        CREATE POLICY "Admin full access" ON public.event_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'records') THEN
        CREATE POLICY "Admin full access" ON public.records FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'swimmer_payments') THEN
        CREATE POLICY "Admin full access" ON public.swimmer_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'registration_logs') THEN
        CREATE POLICY "Admin full access" ON public.registration_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 11. Auth Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, role)
  VALUES (new.id, 'ADMIN');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Fix Trigger Existence Error (Drop if exists then create)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 13. Initial Data
INSERT INTO public.competition_info (id, event_name, event_date, number_of_lanes, is_free)
VALUES (1, 'R.E.A.C.T Championship', CURRENT_DATE, 8, true)
ON CONFLICT (id) DO UPDATE 
SET event_name = EXCLUDED.event_name,
    is_free = COALESCE(competition_info.is_free, EXCLUDED.is_free);

-- 14. Table for Payment Proof File Paths (Supabase Storage)
CREATE TABLE IF NOT EXISTS public.payment_proofs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for payment_proofs
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'payment_proofs') THEN
        CREATE POLICY "Public read access" ON public.payment_proofs FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'payment_proofs') THEN
        CREATE POLICY "Admin full access" ON public.payment_proofs FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Full access to everyone' AND tablename = 'payment_proofs') THEN
        CREATE POLICY "Full access to everyone" ON public.payment_proofs FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Setup storage bucket for 'payment-proofs' (making it public so urls work)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for bucket 'payment-proofs'
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Select payment-proofs' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Public Select payment-proofs" ON storage.objects FOR SELECT TO public USING (bucket_id = 'payment-proofs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Insert payment-proofs' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Public Insert payment-proofs" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'payment-proofs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Delete payment-proofs' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Public Delete payment-proofs" ON storage.objects FOR DELETE TO public USING (bucket_id = 'payment-proofs');
    END IF;
END $$;

