
import React, { useState, useEffect } from 'react';
import { RegistrationLog, SwimEvent } from '../types';
import { getAllRegistrationLogs, getEvents } from '../services/databaseService';
import { formatEventName } from '../constants';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

export const RegistrationLogsView: React.FC = () => {
    const [logs, setLogs] = useState<RegistrationLog[]>([]);
    const [filteredLogs, setFilteredLogs] = useState<RegistrationLog[]>([]);
    const [events, setEvents] = useState<SwimEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredLogs(logs);
        } else {
            const term = searchTerm.toLowerCase();
            setFilteredLogs(logs.filter(log => 
                (log.swimmerName?.toLowerCase().includes(term)) ||
                (log.picName?.toLowerCase().includes(term)) ||
                (log.picPhone?.toLowerCase().includes(term))
            ));
        }
    }, [searchTerm, logs]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [fetchedLogs, fetchedEvents] = await Promise.all([
                getAllRegistrationLogs(),
                getEvents()
            ]);
            setLogs(fetchedLogs);
            setFilteredLogs(fetchedLogs);
            setEvents(fetchedEvents);
        } catch (error) {
            console.error("Error loading logs:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-primary">Riwayat Log Pendaftaran</h2>
                <div className="w-full md:w-64">
                    <Input 
                        placeholder="Cari nama atlet/PIC..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                    />
                </div>
            </div>

            <Card className="overflow-hidden border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-surface text-text-secondary uppercase text-xs font-semibold">
                            <tr>
                                <th className="p-4">Waktu Pendaftaran</th>
                                <th className="p-4">Atlet/Tim</th>
                                <th className="p-4">PIC & Kontak</th>
                                <th className="p-4">Nomor Lomba</th>
                                <th className="p-4 text-right">Nominal</th>
                                <th className="p-4 text-center">Bukti Bayar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-text-secondary">
                                        Tidak ada data pendaftaran ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-background-soft transition-colors text-sm">
                                        <td className="p-4">
                                            <div className="font-medium">{new Date(log.registrationDate).toLocaleDateString('id-ID')}</div>
                                            <div className="text-xs text-text-secondary">{new Date(log.registrationDate).toLocaleTimeString('id-ID')}</div>
                                        </td>
                                        <td className="p-4 font-semibold text-primary">
                                            {log.swimmerName || 'Unknown'}
                                        </td>
                                        <td className="p-4">
                                            <div className="text-xs font-semibold">{log.picName || '-'}</div>
                                            <div className="text-xs text-text-secondary">{log.picPhone || '-'}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1 max-w-xs">
                                                {log.eventIds?.map(eid => {
                                                    const ev = events.find(e => e.id === eid);
                                                    return ev ? (
                                                        <span key={eid} className="bg-surface px-1.5 py-0.5 rounded text-[10px] border border-border whitespace-nowrap">
                                                            {formatEventName(ev)}
                                                        </span>
                                                    ) : null;
                                                })}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-mono">
                                            Rp {(log.paymentAmount || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center text-center">
                                            {log.paymentProof ? (
                                                <button 
                                                    onClick={() => setSelectedImage(log.paymentProof)}
                                                    className="inline-flex items-center text-primary hover:underline group"
                                                >
                                                    <div className="w-10 h-10 rounded border border-border overflow-hidden bg-surface mr-2">
                                                        <img src={log.paymentProof} alt="Proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                    </div>
                                                    <span className="text-xs">Lihat</span>
                                                </button>
                                            ) : (
                                                <span className="text-text-secondary text-xs italic">Tanpa Bukti</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Image Preview Modal */}
            {selectedImage && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
                    <div className="relative max-w-4xl w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <button 
                            className="absolute -top-10 right-0 text-white hover:text-primary p-2 transition-colors"
                            onClick={() => setSelectedImage(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <img 
                            src={selectedImage} 
                            alt="Bukti Transfer Beresolusi Tinggi" 
                            className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl border-2 border-primary"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
