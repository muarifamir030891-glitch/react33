
import React, { useState, useEffect, useCallback } from 'react';
import type { Swimmer, SwimEvent, CompetitionInfo } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { formatEventName, romanize } from '../constants';
import { getPublicData, updateCheckinStatus } from '../services/databaseService';
import { useNotification } from './ui/NotificationManager';

interface CheckinViewProps {
    swimmerId: string;
    onBackToLogin: () => void;
}

export const CheckinView: React.FC<CheckinViewProps> = ({ swimmerId, onBackToLogin }) => {
    const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
    const [events, setEvents] = useState<SwimEvent[]>([]);
    const [competitionInfo, setCompetitionInfo] = useState<CompetitionInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { addNotification } = useNotification();

    const fetchData = useCallback(async () => {
        try {
            const data = await getPublicData();
            const foundSwimmer = data.swimmers.find((s: Swimmer) => s.id === swimmerId);
            if (foundSwimmer) {
                setSwimmer(foundSwimmer);
                const swimmerEvents = data.events.filter((e: SwimEvent) => 
                    e.entries.some(en => en.swimmerId === swimmerId)
                );
                setEvents(swimmerEvents);
                setCompetitionInfo(data.competitionInfo);
            }
        } catch (err) {
            console.error("Gagal memuat data check-in:", err);
            addNotification("Gagal memuat data. Periksa koneksi.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [swimmerId, addNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCheckin = async (eventId: string, currentStatus: boolean) => {
        if (processingId) return;
        
        setProcessingId(eventId);
        try {
            const newStatus = !currentStatus;
            await updateCheckinStatus(eventId, swimmerId, newStatus);
            
            setEvents(prev => prev.map(ev => {
                if (ev.id === eventId) {
                    return {
                        ...ev,
                        entries: ev.entries.map(en => 
                            en.swimmerId === swimmerId ? { ...en, checked_in: newStatus } : en
                        )
                    };
                }
                return ev;
            }));
            
            addNotification(newStatus ? "Berhasil Cek-in!" : "Cek-in dibatalkan", "success");
        } catch (err: any) {
            addNotification("Gagal melakukan cek-in: " + err.message, "error");
        } finally {
            setProcessingId(null);
        }
    };

    if (isLoading) return <div className="min-h-screen flex justify-center items-center"><Spinner /></div>;
    
    if (!swimmer) return (
        <div className="min-h-screen flex flex-col justify-center items-center p-6 text-center">
            <h2 className="text-2xl font-bold text-red-500 mb-4">Data Atlet Tidak Ditemukan</h2>
            <Button onClick={onBackToLogin}>Kembali ke Beranda</Button>
        </div>
    );

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <Card className="text-center shadow-xl border-t-4 border-t-primary overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-400 to-primary opacity-50" />
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="h-16 mx-auto mb-4 object-contain" />}
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">PANITIA CHECK-IN</p>
                    <h1 className="text-3xl font-black uppercase text-text-primary mb-2 tracking-tight leading-tight">{swimmer.name}</h1>
                    <p className="text-lg font-bold text-primary uppercase mb-4 opacity-80">{swimmer.club}</p>
                    
                    <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-4 bg-background/30 -mx-6 px-6">
                        <div className="py-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Kelamin</p>
                            <p className="font-black text-sm">{swimmer.gender === 'Male' ? 'PUTRA' : 'PUTRI'}</p>
                        </div>
                        <div className="py-2 border-x border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Tahun</p>
                            <p className="font-black text-sm">{swimmer.birthYear}</p>
                        </div>
                        <div className="py-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">KU</p>
                            <p className="font-black text-sm">{swimmer.ageGroup || '-'}</p>
                        </div>
                    </div>
                </Card>

                <Card className="shadow-lg">
                    <h2 className="text-xl font-black mb-6 flex items-center gap-2 uppercase italic tracking-tighter text-text-primary">
                        <span className="bg-primary text-white p-1.5 rounded-lg shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </span>
                        DAFTAR NOMOR ACARA
                    </h2>

                    <div className="space-y-4">
                        {events.map((event) => {
                            const entry = event.entries.find(en => en.swimmerId === swimmerId);
                            const isChecked = entry?.checked_in || false;
                            const isSyncing = processingId === event.id;
                            
                            return (
                                <div 
                                    key={event.id} 
                                    className={`relative p-5 rounded-2xl border-2 transition-all duration-300 ${
                                        isChecked 
                                        ? 'bg-green-50/50 border-green-500/30' 
                                        : 'bg-surface border-border hover:border-primary/40'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-black text-base uppercase tracking-tight transition-all duration-300 ${
                                                isChecked ? 'text-green-700 line-through opacity-50' : 'text-text-primary'
                                            }`}>
                                                {formatEventName(event)}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="text-[10px] font-bold text-text-secondary opacity-60 uppercase bg-gray-100 px-2 py-0.5 rounded">
                                                    SESI {romanize(event.sessionNumber || 0)}
                                                </span>
                                                {isChecked && (
                                                    <span className="text-[9px] font-black text-green-600 uppercase tracking-widest animate-pulse">
                                                        ✓ SUDAH LOMPAT
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <button 
                                            onClick={() => handleCheckin(event.id, isChecked)}
                                            disabled={isSyncing}
                                            className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-md ${
                                                isChecked 
                                                ? 'bg-green-500 text-white border-b-4 border-green-700' 
                                                : 'bg-primary text-white border-b-4 border-primary-hover hover:brightness-110'
                                            }`}
                                        >
                                            {isSyncing ? <Spinner /> : (
                                                isChecked ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <span className="font-black text-[10px] leading-tight">ABSEN<br/>DI SINI</span>
                                                )
                                            )}
                                        </button>
                                    </div>
                                    
                                    <div className="mt-4 pt-3 border-t border-dashed border-gray-100 grid grid-cols-2 gap-2">
                                        <div className="text-left">
                                            <p className="text-[8px] font-bold text-gray-400 uppercase">Seed Time</p>
                                            <p className="text-xs font-mono font-bold text-text-secondary">{entry ? (entry.seedTime === 0 ? "NT" : "Tercatat") : "-"}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-bold text-gray-400 uppercase">Status</p>
                                            <p className={`text-xs font-black uppercase ${isChecked ? 'text-green-500' : 'text-blue-500'}`}>
                                                {isChecked ? "Selesai" : "Menunggu"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {events.length === 0 && (
                            <div className="text-center py-12 px-6 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                <p className="text-gray-400 italic text-sm">Atlet ini tidak terdaftar di nomor lomba manapun pada database kami.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-10 space-y-3">
                        <p className="text-[9px] text-center text-gray-400 italic mb-4">
                            Catatan: Menekan tombol "ABSEN" akan menandai atlet sebagai hadir untuk nomor acara tersebut secara permanen di sistem R.E.A.C.T.
                        </p>
                        <Button onClick={onBackToLogin} variant="secondary" className="w-full h-12 rounded-xl font-bold shadow-sm">KEMBALI KE BERANDA</Button>
                    </div>
                </Card>

                <footer className="text-center opacity-40 text-[9px] font-black uppercase tracking-[0.3em] pb-10 flex flex-col items-center gap-2">
                    <div className="w-8 h-1 bg-primary rounded-full mb-2" />
                    <span>SMART SCAN CHECK-IN SYSTEM</span>
                    <span>POWERED BY R.E.A.C.T v1.2</span>
                </footer>
            </div>
        </div>
    );
};
