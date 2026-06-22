# R.E.A.C.T (Real-time Evaluation for Aquatic Competition & Timing)

R.E.A.C.T adalah platform modern, real-time, dan komprehensif untuk manajemen kompetisi renang. Dirancang untuk skalabilitas, aplikasi ini tidak hanya mengelola satu event secara efisien tetapi juga siap dikembangkan menjadi database karir atlet terpusat. Mulai dari pendaftaran online, penjadwalan nomor lomba, pencatatan waktu langsung (live timing), hingga publikasi hasil, R.E.A.C.T menyediakan semua yang dibutuhkan oleh panitia penyelenggara.

## Fitur Unggulan

- **Pengaturan Kompetisi**: Konfigurasi detail acara, tanggal, logo, dan aturan kompetisi.
- **Sistem Biaya Dinamis**: Admin dapat mengatur kompetisi sebagai **GRATIS** (menyembunyikan formulir bayar) atau **BERBAYAR** (meminta bukti transfer).
- **Pendaftaran Mandiri & Kolektif**: Atlet bisa mendaftar sendiri-sendiri atau klub mendaftar secara massal menggunakan file Excel yang didukung dropdown otomatis.
- **Manajemen Nomor & Jadwal Lomba**: Buat nomor lomba perorangan dan estafet, lalu atur ke dalam sesi dengan penjadwal *drag-and-drop*.
- **Live Timing (Arduino Integration)**: Antarmuka intuitif untuk menjalankan seri (*heat*), lengkap dengan stopwatch manual atau otomatis via Arduino Uno (USB).
- **Hasil Real-time**: Hasil diperbarui secara *real-time* dan dapat dilihat di halaman publik.
- **Manajemen Data**:
    - Impor/Ekspor nomor lomba dan rekor melalui Excel.
    - Fungsi backup dan restore seluruh database menggunakan file JSON.
- **Otentikasi Aman**: Kontrol akses berbasis peran (Admin, Super Admin) yang didukung oleh Supabase Auth.

---
## Tindakan yang Diperlukan

### **1. Untuk Pengguna Baru**
Jalankan skrip SQL lengkap yang tersedia di file `schema.sql` atau salin dari bagian di bawah ini pada menu **SQL Editor** di dasbor Supabase Anda.

### **2. Untuk Pengguna Lama (Migrasi)**
Gunakan menu **SQL Editor** di dalam aplikasi untuk mendapatkan perintah `ALTER TABLE` spesifik guna mengaktifkan fitur terbaru (Cek-in, Pembayaran, PIC) tanpa merusak data yang sudah ada.

---

## Panduan Instalasi Database (Supabase)

### Langkah 1: Jalankan Skema SQL Lengkap
Buka **SQL Editor** di Supabase, buat **New Query**, lalu salin dan jalankan skrip ini (atau ambil dari file `schema.sql` di root proyek):

```sql
-- Seluruh skrip SQL di bawah ini bersifat Idempotent (Aman dijalankan berulang kali)
-- Menggunakan klausa IF NOT EXISTS untuk mencegah error pada database yang sudah ada.

-- 1. Create custom types for enums
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

-- MIGRASI (competition_info)
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

-- MIGRASI (swimmers)
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

-- MIGRASI (event_entries)
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

-- 9. Setup RLS (Row Level Security)
ALTER TABLE public.competition_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- 10. Policies with existence check (Idempotent)
DO $$ BEGIN
    -- Public Read
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

    -- Admin Full Access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'competition_info') THEN
        CREATE POLICY "Admin full access" ON public.competition_info FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'swimmers') THEN
        CREATE POLICY "Admin full access" ON public.swimmers FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'events') THEN
        CREATE POLICY "Admin full access" ON public.events FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'event_entries') THEN
        CREATE POLICY "Admin full access" ON public.event_entries FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'event_results') THEN
        CREATE POLICY "Admin full access" ON public.event_results FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'records') THEN
        CREATE POLICY "Admin full access" ON public.records FOR ALL USING (auth.role() = 'authenticated');
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

-- 12. Fix Trigger
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
```

---

## 🚀 Panduan Lengkap Re-Deploy (Ke Akun/Email Lain)

Jika Anda ingin memindahkan atau menginstal ulang aplikasi ini di akun Supabase dan Netlify yang baru, ikuti panduan langkah-demi-langkah ini agar tidak terjadi error.

### 1. Persiapan Database (Supabase)
1.  **Buat Project Baru**: Masuk ke [Supabase](https://supabase.com/), buat project baru, dan tunggu hingga proses inisialisasi selesai.
2.  **SQL Editor**:
    *   Klik menu **SQL Editor** di sidebar kiri.
    *   Klik **New Query**.
    *   Buka file `schema.sql` yang ada di root folder aplikasi ini atau salin dari bagian **Langkah 1** di atas.
    *   Salin seluruh isi SQL tersebut dan tempelkan ke SQL Editor Supabase.
    *   Klik **Run**. Ini akan membuat tabel, tipe data (enum), trigger admin otomatis, dan kebijakan keamanan (RLS).
3.  **Mendapatkan Kredensial API**:
    *   Di dasbor Supabase, klik ikon Gerigi (**Project Settings**) di bagian paling bawah sidebar kiri.
    *   Pilih menu **API**.
    *   Di bagian **Project API Keys**, Anda akan menemukan:
        *   `URL`: Ini adalah **SUPABASE_URL**. Gunakan ini di `config.ts` dan Netlify.
        *   `anon (public)` key: Ini adalah **SUPABASE_ANON_KEY**. Gunakan ini di `config.ts`.
        *   `service_role (secret)` key: Klik tombol "Reveal" untuk melihatnya. Ini adalah **SUPABASE_SERVICE_KEY**. **PENTING**: Jangan pernah bagikan key ini atau menggunakannya di kode sisi klien. Gunakan hanya di Environment Variables Netlify.
4.  **Manajemen Admin (Authentication)**:
    *   Klik ikon Orang (**Authentication**) di sidebar kiri.
    *   Pilih menu **Users**. Di sini Anda bisa melihat daftar user yang sudah mendaftar.
    *   Jika Anda ingin memberikan akses Admin secara manual:
        1. Catat **User ID** (UUID) dari user yang ingin dijadikan admin.
        2. Buka **Table Editor** > pilih tabel `users`.
        3. Masukkan ID tadi dan set kolom `role` menjadi `ADMIN` atau `SUPER_ADMIN`.

### 2. Konfigurasi Kode Lokal
1.  **Ganti Nama File**: Cari file `config.ts.txt` di root folder aplikasi. Ubah namanya menjadi `config.ts`.
2.  **Isi Kredensial**: Buka `config.ts` dan ganti bagian berikut dengan data dari Supabase Anda:
    ```typescript
    supabase: {
      url: "URL_SUPABASE_ANDA", 
      anonKey: "ANON_KEY_ANDA",
    },
    superAdmin: {
      email: "email-admin@anda.com", // Email bebas untuk login admin pertama kali
      password: "password-anda",      // Password kuat pilihan Anda
    }
    ```

### 3. Pengaturan Autentikasi (PENTING)
Agar tidak terjadi error saat login atau pendaftaran:
1.  Di Supabase, buka menu **Authentication** > **URL Configuration**.
2.  Di bagian **Site URL**, masukkan URL domain aplikasi Anda (misal: `https://nama-app-anda.netlify.app`).
3.  Di bagian **Redirect URLs**, tambahkan juga URL yang sama.
4.  Buka **Authentication** > **Providers** > **Email**. 
5.  **MATIKAN/DISABLE** pilihan berikut:
    *   **Confirm Email** (Agar pendaftaran admin langsung aktif)
    *   **Secure email Change** (Agar perubahan email lebih mudah jika diperlukan)
6.  Pastikan **External Providers** (Google, dsb) belum diaktifkan kecuali Anda sudah melakukan konfigurasi tambahan.

### 4. Deployment (Netlify)
Jika Anda menggunakan Netlify:
1.  **Hubungkan Repository**: Upload kode Anda ke GitHub/GitLab, lalu hubungkan ke Netlify.
2.  **Setting Environment Variables**:
    Di Dashboard Netlify, buka **Site Settings** > **Environment variables**, lalu tambahkan:
    *   `SUPABASE_URL`: (Gunakan Project URL dari Supabase)
    *   `SUPABASE_SERVICE_KEY`: (Gunakan service_role secret key dari Supabase)
3.  **Build Settings**:
    *   Build Command: `npm run build`
    *   Publish directory: `dist`
4.  **Menambahkan Fungsi Backend**:
    Aplikasi ini menggunakan Netlify Functions. Pastikan folder `netlify/functions` ada di root project Anda saat diupload.

### 5. Cara Login Pertama Kali sebagai Admin
1.  Buka aplikasi yang sudah dijalankan/dideploy.
2.  Klik tombol **Login Admin**.
3.  Pilih tab **Daftar** atau klik **Belum punya akun? Daftar**.
4.  Daftar menggunakan email yang Anda tentukan di `config.ts` (atau email lain).
5.  **Pemberian Akses Super Admin**:
    Jika akun pertama belum otomatis jadi admin, Anda bisa masuk ke Supabase **Table Editor**, pilih tabel `users`, lalu tambahkan ID user Anda (ambil dari menu Authentication) dan set role-nya menjadi `SUPER_ADMIN`.

### 6. Tips Menghindari Error Common
*   **Error 500 / Database Error**: Pastikan variabel `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` sudah terpasang di Netlify Environment Variables.
*   **Error Permission Denied**: Pastikan Anda sudah menjalankan seluruh skrip SQL di `schema.sql` termasuk bagian RLS dan Policies.
*   **Logo Tidak Muncul**: Logo disimpan di tabel `competition_info`. Anda bisa mengupload ulang logo melalui menu Pengaturan Admin di aplikasi.
*   **Fungsi Netlify Tidak Jalan**: Pastikan Anda telah menginstal `netlify-cli` secara lokal jika ingin mencoba `netlify dev`. Di cloud, Netlify otomatis mendeteksi folder `netlify/functions`.

### 7. Pengolahan Data Cadangan (Backup & Restore)
Jika fungsi Backup/Restore tidak bekerja:
1. Pastikan Anda sudah login sebagai Admin.
2. Periksa apakah `SUPABASE_SERVICE_KEY` di Netlify memiliki akses yang cukup (harus menggunakan `service_role` key, bukan `anon` key untuk operasi tertentu jika RLS sangat ketat).
3. Pastikan file JSON backup mengikuti struktur yang diekspor oleh aplikasi ini.

---
**Selamat Menggunakan R.E.A.C.T!** platform renang paling modern dan akurat untuk kompetisi Anda.
