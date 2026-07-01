
import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { config } from '../config';

const ClipboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);


const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [copied, setCopied] = useState(false);
    const textToCopy = children?.toString() || '';

    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="relative mt-4">
            <pre className="bg-background p-4 rounded-md text-sm text-text-primary whitespace-pre-wrap font-mono overflow-x-auto">
                <code>{children}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 rounded-md bg-surface hover:bg-border transition-colors text-text-secondary"
                title="Salin ke clipboard"
            >
                {copied ? <CheckIcon /> : <ClipboardIcon />}
            </button>
        </div>
    );
};

export const SqlEditorView: React.FC = () => {
    const projectRef = config.supabase.url.replace('https://', '').split('.')[0];
    const supabaseSqlEditorUrl = `https://app.supabase.com/project/${projectRef}/sql/new`;

    const addCheckinFieldQuery = `-- Menambahkan kolom checked_in ke tabel pendaftaran acara
ALTER TABLE public.event_entries ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE;

-- Menambahkan kolom biaya ke tabel informasi kompetisi
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS fee_per_event integer DEFAULT 0;

-- Menambahkan kolom bukti bayar dan kontak PIC ke tabel perenang
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS payment_proof text;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS payment_amount integer;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_phone text;

-- Menambahkan kolom untuk mengunci lintasan peserta
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lanes_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.event_entries ADD COLUMN IF NOT EXISTS heat_number INTEGER;
ALTER TABLE public.event_entries ADD COLUMN IF NOT EXISTS lane_number INTEGER;

-- TABEL BUKTI BAYAR BARU (TIDAK MENYIMPAN GAMBAR LANGSUNG DI DATABASE)
CREATE TABLE IF NOT EXISTS public.payment_proofs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- AKTIFKAN RLS UNTUK TABLE payment_proofs
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- SETUP BUCKET UNTUK STORAGE SUPABASE (payment-proofs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- STORAGE POLICIES UNTUK BUCKET payment-proofs
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
END $$;`;

    const disableRlsQuery = `-- REKOMENDASI: Menonaktifkan RLS (Row-Level Security)
-- Jalankan ini untuk memberikan akses penuh (Create, Read, Update, Delete) ke semua fitur secara instan
ALTER TABLE IF EXISTS public.competition_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.swimmers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.records DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.swimmer_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registration_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_proofs DISABLE ROW LEVEL SECURITY;`;

    const permissiveRlsQuery = `-- ALTERNATIF: Menyetel Kebijakan RLS Terbuka (Public CRUD)
-- Jalankan ini jika Anda ingin RLS tetap aktif, tetapi memperbolehkan akses penuh ke siapa sajaCustom

-- 1. Hapus aturan lama (agar tidak tumpang tindih)
DROP POLICY IF EXISTS "Public read access" ON public.competition_info;
DROP POLICY IF EXISTS "Admin full access" ON public.competition_info;
DROP POLICY IF EXISTS "Public read access" ON public.swimmers;
DROP POLICY IF EXISTS "Admin full access" ON public.swimmers;
DROP POLICY IF EXISTS "Public read access" ON public.events;
DROP POLICY IF EXISTS "Admin full access" ON public.events;
DROP POLICY IF EXISTS "Public read access" ON public.event_entries;
DROP POLICY IF EXISTS "Admin full access" ON public.event_entries;
DROP POLICY IF EXISTS "Public read access" ON public.event_results;
DROP POLICY IF EXISTS "Admin full access" ON public.event_results;
DROP POLICY IF EXISTS "Public read access" ON public.records;
DROP POLICY IF EXISTS "Admin full access" ON public.records;
DROP POLICY IF EXISTS "Public read access" ON public.swimmer_payments;
DROP POLICY IF EXISTS "Admin full access" ON public.swimmer_payments;
DROP POLICY IF EXISTS "Public read access" ON public.registration_logs;
DROP POLICY IF EXISTS "Admin full access" ON public.registration_logs;
DROP POLICY IF EXISTS "Public read access" ON public.payment_proofs;
DROP POLICY IF EXISTS "Admin full access" ON public.payment_proofs;
DROP POLICY IF EXISTS "Full access to everyone" ON public.payment_proofs;

-- 2. Pastikan RLS diaktifkan
ALTER TABLE public.competition_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimmer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- 3. Buat aturan akses penuh untuk semua role (public / anon / authenticated)
CREATE POLICY "Full access to everyone" ON public.competition_info FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.swimmers FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.events FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.event_entries FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.event_results FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.records FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.swimmer_payments FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.registration_logs FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Full access to everyone" ON public.payment_proofs FOR ALL TO public USING (true) WITH CHECK (true);`;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold mb-6">SQL Editor</h1>

            <Card className="border-red-500/50 bg-red-500/5">
                <div className="flex items-start space-x-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <h2 className="text-xl font-bold text-red-600 dark:text-red-400">PENTING: Akses Database Supabase (Error RLS)</h2>
                        <p className="text-text-secondary mt-2">
                            Jika Anda mengalami error seperti <strong className="text-red-500">"new row violates row-level security policy"</strong> saat menyimpan data (Create/Update/Delete) atau pendaftaran online, hal ini terjadi karena aturan Row-Level Security (RLS) di Supabase memblokir akses pengguna yang belum masuk lewat Supabase Auth.
                        </p>
                        <p className="text-text-secondary mt-2">
                            Pilih salah satu solusi di bawah ini, salin kodenya, dan jalankan di **Supabase SQL Editor** untuk mengaktifkan akses penuh (Create, Read, Update, Delete) secara instan.
                        </p>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-green-500/30">
                    <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">Metode 1: Nonaktifkan RLS (Sangat Direkomendasikan)</h3>
                    <p className="text-sm text-text-secondary">
                        Ini adalah cara paling mudah dan dijamin 100% menyelesaikan masalah izin atau kebuntuan otorisasi. Ini membiarkan aplikasi web bebas melakukan operasi CRUD tanpa batasan dari server Supabase.
                    </p>
                    <CodeBlock>{disableRlsQuery}</CodeBlock>
                </Card>

                <Card className="border-blue-500/30">
                    <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-2">Metode 2: Kebijakan RLS Terbuka (Public CRUD)</h3>
                    <p className="text-sm text-text-secondary">
                        Gunakan metode ini jika Anda ingin pertahankan Row-Level Security (RLS) aktif namun memperbolehkan seluruh pengunjung (termasuk pendaftar tamu & silsilah admin cadangan) untuk membaca dan memodifikasi data.
                    </p>
                    <CodeBlock>{permissiveRlsQuery}</CodeBlock>
                </Card>
            </div>

            <Card>
                <h2 className="text-2xl font-bold mb-4">Migrasi Dasar (Cek-in, Biaya & Kontak)</h2>
                <p className="text-text-secondary">Salin perintah ini untuk memastikan semua tabel mendukung versi kolom terbaru:</p>
                <CodeBlock>{addCheckinFieldQuery}</CodeBlock>
            </Card>

            <div className="flex justify-center pt-4">
                <Button size="lg" onClick={() => window.open(supabaseSqlEditorUrl, '_blank')}>
                    Buka Supabase SQL Editor
                </Button>
            </div>
        </div>
    );
};
