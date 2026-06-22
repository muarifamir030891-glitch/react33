
import React from 'react';
import { Card } from './ui/Card';

export const UserManagementView: React.FC<{ onDataUpdate: () => void }> = () => {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Manajemen Akun Admin</h1>

            <Card>
                <div className="text-center p-8">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-xl font-bold text-text-primary">Manajemen Akun via Supabase</h2>
                    <p className="text-text-secondary mt-2">
                        Untuk keamanan, penambahan, pengeditan, dan penghapusan akun admin sekarang dikelola langsung melalui dasbor Supabase Anda.
                    </p>
                    <p className="text-text-secondary mt-2">
                        Silakan buka proyek Supabase Anda, navigasi ke bagian <strong className="font-semibold text-text-primary">Authentication</strong> untuk mengelola pengguna.
                    </p>
                </div>
            </Card>
        </div>
    );
};
