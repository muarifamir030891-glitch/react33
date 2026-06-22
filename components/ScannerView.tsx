
import React, { useEffect, useRef } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useNotification } from './ui/NotificationManager';

declare var Html5QrcodeScanner: any;

interface ScannerViewProps {
    onBack: () => void;
    onDetected: (swimmerId: string) => void;
}

export const ScannerView: React.FC<ScannerViewProps> = ({ onBack, onDetected }) => {
    const scannerRef = useRef<any>(null);
    const { addNotification } = useNotification();

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            "qr-reader",
            { 
                fps: 10, 
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                showTorchButtonIfSupported: true
            },
            /* verbose= */ false
        );

        const onScanSuccess = (decodedText: string) => {
            try {
                // Example URL: http://.../?view=checkin&id=UUID
                const url = new URL(decodedText);
                const id = url.searchParams.get('id');
                const view = url.searchParams.get('view');

                if (view === 'checkin' && id) {
                    scanner.clear();
                    onDetected(id);
                } else {
                    addNotification("QR Code bukan kartu atlet R.E.A.C.T yang valid.", "error");
                }
            } catch (e) {
                addNotification("Gagal membaca data QR Code.", "error");
            }
        };

        scanner.render(onScanSuccess, (err: any) => {
            // Silently ignore scan errors (no QR in frame)
        });

        scannerRef.current = scanner;

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch((e: any) => console.error(e));
            }
        };
    }, [onDetected, addNotification]);

    return (
        <div className="max-w-xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black italic text-primary uppercase tracking-tighter">SCAN KARTU</h1>
                <Button variant="secondary" onClick={onBack}>Tutup Scanner</Button>
            </div>

            <Card className="p-0 overflow-hidden shadow-2xl border-4 border-primary/20">
                <div id="qr-reader" className="w-full"></div>
            </Card>

            <div className="text-center p-6 bg-surface border border-border rounded-2xl">
                <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                <h3 className="font-bold text-lg mb-1">Arahkan Kamera ke QR Code</h3>
                <p className="text-sm text-text-secondary">Posisikan kode di dalam kotak pemindai untuk proses cek-in otomatis.</p>
            </div>
        </div>
    );
};
