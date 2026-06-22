import React, { useState, useEffect, useCallback } from 'react';
import type { SwimEvent, Swimmer, Result, EventEntry, SwimRecord } from '../types';
import { RecordType } from '../types';
import { getEventById, getSwimmers, recordEventResults, getSwimmerById, getRecords } from '../services/databaseService';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { formatEventName, formatTime } from '../constants';
import { useNotification } from './ui/NotificationManager';

interface EventDetailViewProps {
  eventId: string;
  onBack: () => void;
  onDataUpdate: () => void;
}

interface DetailedEntry extends EventEntry {
    swimmer: Swimmer;
}

const RecordDisplayRow: React.FC<{ record: SwimRecord | undefined, type: string }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    const typeColor = type.toUpperCase() === 'PORPROV' ? 'text-blue-400' : 'text-red-400';

    if (!record) {
        return (
            <div className="bg-background rounded-lg p-3 text-sm text-text-secondary uppercase tracking-wider">
                <span className={`font-bold ${typeColor}`}>{typeText}</span>
                <span className="mx-2">|</span>
                <span>TIDAK ADA REKOR TERCATAT</span>
            </div>
        );
    }

    const parts = [
        typeText,
        formatTime(record.time),
        record.holderName,
        record.yearSet,
        record.locationSet,
    ].filter(Boolean);

    return (
        <div className="bg-background rounded-lg p-3 text-sm text-text-primary uppercase tracking-wider flex flex-wrap items-baseline gap-x-2">
             <span className={`font-bold ${typeColor}`}>{parts[0]}</span>
             {parts.slice(1).map((part, index) => (
                <React.Fragment key={index}>
                    <span className="text-text-secondary">|</span>
                    <span className={index === 0 ? 'font-mono font-bold text-base' : (index === 1 ? 'font-semibold' : '')}>{part}</span>
                </React.Fragment>
             ))}
        </div>
    );
};

export const EventDetailView: React.FC<EventDetailViewProps> = ({ eventId, onBack, onDataUpdate }) => {
    const [event, setEvent] = useState<SwimEvent | null>(null);
    const [detailedEntries, setDetailedEntries] = useState<DetailedEntry[]>([]);
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTimeModalOpen, setTimeModalOpen] = useState(false);
    const [times, setTimes] = useState<Record<string, { min: string, sec: string, ms: string }>>({});
    const { addNotification } = useNotification();

    const fetchEventDetails = useCallback(async () => {
        setIsLoading(true);
        const [eventData, recordsData] = await Promise.all([
            getEventById(eventId),
            getRecords()
        ]);

        if (eventData) {
            setEvent(eventData);
            setRecords(recordsData);
            const entryDetails = await Promise.all(
                eventData.entries.map(async (entry) => {
                    const swimmer = await getSwimmerById(entry.swimmerId);
                    return { ...entry, swimmer: swimmer! };
                })
            );
            const filteredEntries = entryDetails.filter(e => e.swimmer);
            setDetailedEntries(filteredEntries);
            
            const initialTimes: Record<string, { min: string, sec: string, ms: string }> = {};
            filteredEntries.forEach(entry => { initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '0'}; });
            setTimes(initialTimes);
        }
        setIsLoading(false);
    }, [eventId]);

    useEffect(() => {
        fetchEventDetails();
    }, [fetchEventDetails]);


    const handleRecordTimes = async () => {
        // FIX: Add explicit type annotation to the map parameters to resolve type inference issues where `time` was `unknown`.
        const results: Result[] = Object.entries(times).map(([swimmerId, time]: [string, { min: string; sec: string; ms: string }]) => {
            const ms = (parseInt(time.min || '0') * 60 * 1000) + (parseInt(time.sec || '0') * 1000) + parseInt(time.ms || '0');
            return { swimmerId, time: ms };
        }).filter(r => r.time > 0);
        
        try {
            await recordEventResults(eventId, results);
            addNotification('Hasil lomba berhasil disimpan.', 'info');
            setTimeModalOpen(false);
            onDataUpdate();
            fetchEventDetails();
        } catch (error: any) {
            addNotification(`Gagal menyimpan hasil: ${error.message}`, 'error');
        }
    };

    const handleTimeChange = (swimmerId: string, part: 'min' | 'sec' | 'ms', value: string) => {
        setTimes(prev => ({
            ...prev,
            [swimmerId]: { ...prev[swimmerId], [part]: value }
        }));
    };

    const sortedResults = event 
        ? [...event.results].sort((a, b) => {
            if (a.time < 0) return 1;
            if (b.time < 0) return -1;
            if (a.time === 0) return 1;
            if (b.time === 0) return -1;
            return a.time - b.time;
          })
        : [];

    if (isLoading) return <p>Memuat detail nomor lomba...</p>;
    if (!event) return <p>Nomor lomba tidak ditemukan.</p>;

    const porprovRecord = records.find(r =>
        r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() &&
        r.gender === event.gender &&
        r.distance === event.distance &&
        r.style === event.style &&
        (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
        (r.category ?? null) === (event.category ?? null)
    );

    const nasionalRecord = records.find(r =>
        r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() &&
        r.gender === event.gender &&
        r.distance === event.distance &&
        r.style === event.style &&
        (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
        (r.category ?? null) === (event.category ?? null)
    );
    
    return (
        <div>
            <Button onClick={onBack} variant="secondary" className="mb-4">
                &larr; Kembali ke Daftar Lomba
            </Button>
            <h1 className="text-3xl font-bold">{formatEventName(event)}</h1>

            <div className="mt-6 space-y-2">
                <RecordDisplayRow type={RecordType.PORPROV} record={porprovRecord} />
                <RecordDisplayRow type={RecordType.NASIONAL} record={nasionalRecord} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Atlet Terdaftar</h2>
                    <ul className="space-y-2">
                        {detailedEntries.length > 0 ? detailedEntries.map(entry => (
                            <li key={entry.swimmerId} className="flex justify-between p-2 border-b border-border last:border-0">
                                <span>{entry.swimmer.name} ({entry.swimmer.club})</span>
                                <span className="font-mono text-text-secondary">Seed: {formatTime(entry.seedTime)}</span>
                            </li>
                        )) : <p className="text-text-secondary">Belum ada atlet terdaftar.</p>}
                    </ul>
                </Card>

                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">Hasil Lomba</h2>
                        <Button onClick={() => setTimeModalOpen(true)} disabled={detailedEntries.length === 0}>
                            Catat Waktu
                        </Button>
                    </div>
                    {sortedResults.length > 0 ? (
                        <ol className="space-y-2">
                           {sortedResults.map((result, index) => {
                               const swimmer = detailedEntries.find(e => e.swimmerId === result.swimmerId)?.swimmer;
                               const rank = result.time > 0 ? index + 1 : 0;
                               return (
                                   <li key={result.swimmerId} className="flex justify-between p-2 rounded-md bg-background">
                                       <span><strong>{rank > 0 ? `${rank}.` : '-'}</strong> {swimmer?.name || 'Unknown'}</span>
                                       <span className="font-mono">{formatTime(result.time)}</span>
                                   </li>
                               )
                           })}
                        </ol>
                    ) : <p className="text-text-secondary">Belum ada hasil dicatat.</p>}
                </Card>
            </div>
            
            <Modal isOpen={isTimeModalOpen} onClose={() => setTimeModalOpen(false)} title="Catat Waktu Lomba">
                <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                    {detailedEntries.map(entry => (
                        <div key={entry.swimmerId} className="grid grid-cols-4 items-end gap-2">
                           <label className="col-span-4 text-text-secondary">{entry.swimmer.name}</label>
                           <div className="col-span-1">
                             <Input label="Min" id={`min-${entry.swimmerId}`} type="number" min="0" value={times[entry.swimmerId]?.min || '0'} onChange={e => handleTimeChange(entry.swimmerId, 'min', e.target.value)} />
                           </div>
                           <div className="col-span-1">
                            <Input label="Sec" id={`sec-${entry.swimmerId}`} type="number" min="0" max="99" value={times[entry.swimmerId]?.sec || '0'} onChange={e => handleTimeChange(entry.swimmerId, 'sec', e.target.value)} />
                           </div>
                           <div className="col-span-1">
                            <Input label="ms" id={`ms-${entry.swimmerId}`} type="number" min="0" max="999" value={times[entry.swimmerId]?.ms || '0'} onChange={e => handleTimeChange(entry.swimmerId, 'ms', e.target.value)} />
                           </div>
                        </div>
                    ))}
                    <div className="flex justify-end pt-2">
                        <Button onClick={handleRecordTimes}>Simpan Hasil</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};