
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
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_phone text;`;

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">SQL Editor</h1>

            <Card className="border-yellow-500/50 bg-yellow-500/5 mb-6">
                <div className="flex items-start space-x-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <h2 className="text-xl font-bold text-yellow-600 dark:text-yellow-400">Pembaruan Database Diperlukan</h2>
                        <p className="text-text-secondary mt-2">
                            Gunakan tombol di bawah untuk membuka SQL Editor di dasbor Supabase Anda, lalu salin dan jalankan perintah migrasi di bawah untuk mengaktifkan fitur **Cek-in Atlet**.
                        </p>
                    </div>
                </div>
            </Card>

            <Card>
                <h2 className="text-2xl font-bold mb-4">Migrasi Data Cek-in, Pembayaran & Kontak</h2>
                <p className="text-text-secondary">Salin perintah ini untuk memastikan semua tabel mendukung fitur terbaru:</p>
                <CodeBlock>{addCheckinFieldQuery}</CodeBlock>
                <div className="mt-6">
                    <Button onClick={() => window.open(supabaseSqlEditorUrl, '_blank')}>
                        Buka Supabase SQL Editor
                    </Button>
                </div>
            </Card>
        </div>
    );
};
