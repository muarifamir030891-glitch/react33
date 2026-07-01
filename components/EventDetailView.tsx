import React, { useState, useEffect, useCallback } from 'react';
import type { SwimEvent, Swimmer, Result, EventEntry, SwimRecord, CompetitionInfo } from '../types';
import { RecordType } from '../types';
import { getEventById, getSwimmers, recordEventResults, getSwimmerById, getRecords, lockEventLanes, unlockEventLanes, assignSwimmerLane } from '../services/databaseService';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { formatEventName, formatTime, generateHeats, reconstructLockedHeats } from '../constants';
import { useNotification } from './ui/NotificationManager';

interface EventDetailViewProps {
  eventId: string;
  onBack: () => void;
  onDataUpdate: () => void;
  competitionInfo: CompetitionInfo | null;
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

export const EventDetailView: React.FC<EventDetailViewProps> = ({ eventId, onBack, onDataUpdate, competitionInfo }) => {
    const [event, setEvent] = useState<SwimEvent | null>(null);
    const [detailedEntries, setDetailedEntries] = useState<DetailedEntry[]>([]);
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTimeModalOpen, setTimeModalOpen] = useState(false);
    const [times, setTimes] = useState<Record<string, { min: string, sec: string, ms: string }>>({});
    
    // Lane management states
    const [isAssignModalOpen, setAssignModalOpen] = useState(false);
    const [swimmerToAssign, setSwimmerToAssign] = useState<DetailedEntry | null>(null);
    const [assignHeat, setAssignHeat] = useState<number>(1);
    const [assignLane, setAssignLane] = useState<number>(1);
    const [isProcessingAction, setIsProcessingAction] = useState(false);

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

    const handleLockLanes = async () => {
        if (!event) return;
        const confirmLock = window.confirm(
            "Apakah Anda yakin ingin mengunci lintasan untuk nomor lomba ini? Setelah dikunci, lintasan peserta tidak akan bergeser lagi saat buku acara dicetak."
        );
        if (!confirmLock) return;

        setIsProcessingAction(true);
        try {
            const lanesCount = competitionInfo?.numberOfLanes || 8;
            const currentHeats = generateHeats(detailedEntries, lanesCount);
            
            const assignments = currentHeats.flatMap(h => 
                h.assignments.map(a => ({
                    swimmerId: a.entry.swimmerId,
                    heatNumber: h.heatNumber,
                    laneNumber: a.lane
                }))
            );

            await lockEventLanes(eventId, assignments);
            addNotification('Lintasan lomba berhasil dikunci.', 'info');
            onDataUpdate();
            await fetchEventDetails();
        } catch (error: any) {
            addNotification(`Gagal mengunci lintasan: ${error.message}`, 'error');
        } finally {
            setIsProcessingAction(false);
        }
    };

    const handleUnlockLanes = async () => {
        if (!event) return;
        const confirmUnlock = window.confirm(
            "Apakah Anda yakin ingin membuka kunci lintasan? Seluruh lintasan akan diatur ulang secara dinamis berdasarkan catatan waktu unggulan (seed time)."
        );
        if (!confirmUnlock) return;

        setIsProcessingAction(true);
        try {
            await unlockEventLanes(eventId);
            addNotification('Kunci lintasan berhasil dibuka.', 'info');
            onDataUpdate();
            await fetchEventDetails();
        } catch (error: any) {
            addNotification(`Gagal membuka kunci: ${error.message}`, 'error');
        } finally {
            setIsProcessingAction(false);
        }
    };

    const handleAssignLaneSubmit = async () => {
        if (!swimmerToAssign) return;
        try {
            await assignSwimmerLane(eventId, swimmerToAssign.swimmerId, assignHeat, assignLane);
            addNotification(`Berhasil menempatkan ${swimmerToAssign.swimmer.name} pada Seri ${assignHeat} Lintasan ${assignLane}.`, 'info');
            setAssignModalOpen(false);
            setSwimmerToAssign(null);
            onDataUpdate();
            await fetchEventDetails();
        } catch (error: any) {
            addNotification(`Gagal menempatkan atlet: ${error.message}`, 'error');
        }
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

    const lanesCount = competitionInfo?.numberOfLanes || 8;
    const heats = event.lanesLocked
        ? reconstructLockedHeats(detailedEntries)
        : generateHeats(detailedEntries, lanesCount);

    const maxHeatNumber = heats.length > 0 ? Math.max(...heats.map(h => h.heatNumber)) : 1;
    const heatOptions = Array.from({ length: maxHeatNumber + 1 }, (_, i) => i + 1); // allow creating a new heat

    // Calculate occupied lanes for the selected heat inside the assignment form
    const occupiedLanesInSelectedHeat = new Set(
        heats.find(h => h.heatNumber === assignHeat)?.assignments.map(a => a.lane) || []
    );
    const emptyLanesInSelectedHeat = Array.from({ length: lanesCount }, (_, i) => i + 1)
        .filter(lane => !occupiedLanesInSelectedHeat.has(lane));

    // Handle automatically setting a valid empty lane when heat selection changes
    useEffect(() => {
        if (isAssignModalOpen) {
            const occupied = new Set(
                heats.find(h => h.heatNumber === assignHeat)?.assignments.map(a => a.lane) || []
            );
            const empty = Array.from({ length: lanesCount }, (_, i) => i + 1)
                .filter(lane => !occupied.has(lane));
            
            if (empty.length > 0) {
                setAssignLane(empty[0]);
            } else {
                setAssignLane(1);
            }
        }
    }, [assignHeat, isAssignModalOpen, heats, lanesCount]);

    // Unassigned additions (only relevant if lanes are locked)
    const unassignedEntries = event.lanesLocked
        ? detailedEntries.filter(e => !e.heatNumber || e.heatNumber <= 0 || !e.laneNumber || e.laneNumber <= 0)
        : [];
    
    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <Button onClick={onBack} variant="secondary">
                    &larr; Kembali ke Daftar Lomba
                </Button>
                
                <div className="flex items-center gap-3">
                    {event.lanesLocked ? (
                        <>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                                Lintasan Dikunci (Official)
                            </span>
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={handleUnlockLanes} 
                                disabled={isProcessingAction}
                            >
                                Buka Kunci
                            </Button>
                        </>
                    ) : (
                        <>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v2h2V7a5 5 0 00-5-5z" />
                                </svg>
                                Lintasan Dinamis (Draf)
                            </span>
                            <Button 
                                variant="primary" 
                                size="sm" 
                                onClick={handleLockLanes} 
                                disabled={isProcessingAction || detailedEntries.length === 0}
                            >
                                Kunci Lintasan
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <h1 className="text-3xl font-bold">{formatEventName(event)}</h1>

            <div className="mt-6 space-y-2">
                <RecordDisplayRow type={RecordType.PORPROV} record={porprovRecord} />
                <RecordDisplayRow type={RecordType.NASIONAL} record={nasionalRecord} />
            </div>

            {/* Unassigned Swimmers Section */}
            {unassignedEntries.length > 0 && (
                <Card className="border-amber-500/50 bg-amber-500/5 mt-6">
                    <div className="flex items-center gap-2 mb-2 text-amber-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <h2 className="text-lg font-bold">Peserta Tambahan Belum Memiliki Lintasan ({unassignedEntries.length})</h2>
                    </div>
                    <p className="text-sm text-text-secondary mb-4">
                        Atlet berikut didaftarkan setelah lintasan dikunci resmi. Tempatkan mereka secara manual pada lintasan yang masih kosong.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {unassignedEntries.map(entry => (
                            <div key={entry.swimmerId} className="flex justify-between items-center p-3 bg-surface rounded-lg border border-border">
                                <div className="truncate pr-2">
                                    <p className="font-bold uppercase text-sm text-text-primary truncate">{entry.swimmer.name}</p>
                                    <p className="text-xs text-text-secondary uppercase truncate">{entry.swimmer.club}</p>
                                </div>
                                <Button 
                                    size="sm" 
                                    onClick={() => {
                                        setSwimmerToAssign(entry);
                                        const initialHeat = heats.length > 0 ? heats[0].heatNumber : 1;
                                        setAssignHeat(initialHeat);
                                        setAssignModalOpen(true);
                                    }}
                                >
                                    Tempatkan
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Main view Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                
                {/* Heats Visual Layout */}
                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-xl font-bold text-text-primary">Struktur Seri &amp; Lintasan</h2>
                    
                    {event.lanesLocked ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {heats.map(heat => (
                                <div key={heat.heatNumber} className="border border-border rounded-xl overflow-hidden bg-surface">
                                    <div className="bg-primary/10 text-primary p-3 font-bold uppercase text-xs border-b border-border flex justify-between items-center">
                                        <span>Seri {heat.heatNumber}</span>
                                        <span className="text-[10px] font-mono text-text-secondary bg-surface px-2 py-0.5 rounded-full">
                                            {heat.assignments.length} / {lanesCount} Lintasan Terisi
                                        </span>
                                    </div>
                                    <div className="divide-y divide-border/60">
                                        {Array.from({ length: lanesCount }, (_, i) => i + 1).map(lane => {
                                            const ass = heat.assignments.find(a => a.lane === lane);
                                            return (
                                                <div key={lane} className="flex justify-between items-center p-2.5 text-xs">
                                                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-background border border-border rounded-full font-mono font-bold text-[10px] text-text-secondary">
                                                            {lane}
                                                        </span>
                                                        {ass ? (
                                                            <div className="truncate">
                                                                <span className="font-semibold text-text-primary uppercase block truncate">{ass.entry.swimmer.name}</span>
                                                                <span className="text-[10px] text-text-secondary uppercase block truncate">{ass.entry.swimmer.club}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-text-secondary/30 italic text-[11px]">Lintasan Kosong</span>
                                                        )}
                                                    </div>
                                                    {ass && (
                                                        <span className="font-mono text-text-secondary text-[10px] bg-background px-1.5 py-0.5 rounded">
                                                            {formatTime(ass.entry.seedTime)}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {heats.length === 0 && (
                                <div className="col-span-2 text-center py-12 border border-dashed border-border rounded-xl">
                                    <p className="text-text-secondary italic">Tidak ada seri atau lintasan resmi yang terbentuk.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {heats.map(heat => (
                                <div key={heat.heatNumber} className="border border-border rounded-xl overflow-hidden bg-surface">
                                    <div className="bg-primary/5 text-primary p-3 font-bold uppercase text-xs border-b border-border">
                                        Seri {heat.heatNumber} (Alokasi Dinamis)
                                    </div>
                                    <div className="divide-y divide-border/60">
                                        {heat.assignments.map(ass => (
                                            <div key={ass.lane} className="flex justify-between items-center p-2.5 text-xs">
                                                <div className="flex items-center space-x-2.5">
                                                    <span className="w-5 h-5 flex items-center justify-center bg-background border border-border rounded-full font-mono font-bold text-[10px] text-text-secondary">{ass.lane}</span>
                                                    <div>
                                                        <span className="font-semibold text-text-primary uppercase block">{ass.entry.swimmer.name}</span>
                                                        <span className="text-[10px] text-text-secondary uppercase block">{ass.entry.swimmer.club}</span>
                                                    </div>
                                                </div>
                                                <span className="font-mono text-text-secondary text-[10px] bg-background px-1.5 py-0.5 rounded">{formatTime(ass.entry.seedTime)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar: Registered List & Results */}
                <div className="space-y-6">
                    <Card>
                        <h2 className="text-xl font-bold mb-4">Daftar Atlet Terdaftar ({detailedEntries.length})</h2>
                        <ul className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                            {detailedEntries.length > 0 ? detailedEntries.map(entry => (
                                <li key={entry.swimmerId} className="flex flex-col p-2 border-b border-border/50 last:border-0 text-sm">
                                    <span className="font-bold uppercase text-text-primary">{entry.swimmer.name}</span>
                                    <div className="flex justify-between text-xs text-text-secondary mt-0.5">
                                        <span className="uppercase">{entry.swimmer.club}</span>
                                        <span className="font-mono">Seed: {formatTime(entry.seedTime)}</span>
                                    </div>
                                </li>
                            )) : <p className="text-text-secondary text-sm italic">Belum ada atlet terdaftar.</p>}
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
                                       <li key={result.swimmerId} className="flex justify-between p-2 rounded-md bg-background text-sm">
                                           <span><strong>{rank > 0 ? `${rank}.` : '-'}</strong> {swimmer?.name || 'Unknown'}</span>
                                           <span className="font-mono">{formatTime(result.time)}</span>
                                       </li>
                                   )
                               })}
                            </ol>
                        ) : <p className="text-text-secondary text-sm italic">Belum ada hasil dicatat.</p>}
                    </Card>
                </div>

            </div>
            
            {/* Modal: Catat Waktu Lomba */}
            <Modal isOpen={isTimeModalOpen} onClose={() => setTimeModalOpen(false)} title="Catat Waktu Lomba">
                <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                    {detailedEntries.map(entry => (
                        <div key={entry.swimmerId} className="grid grid-cols-4 items-end gap-2 border-b border-border/40 pb-2">
                           <label className="col-span-4 text-xs font-bold uppercase text-text-primary">{entry.swimmer.name}</label>
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

            {/* Modal: Manual Lane Placement */}
            <Modal 
                isOpen={isAssignModalOpen} 
                onClose={() => {
                    setAssignModalOpen(false);
                    setSwimmerToAssign(null);
                }} 
                title="Tempatkan Peserta Tambahan"
            >
                {swimmerToAssign && (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs uppercase text-text-secondary font-bold">Nama Atlet</p>
                            <p className="font-bold text-text-primary text-base uppercase">{swimmerToAssign.swimmer.name}</p>
                            <p className="text-sm text-text-secondary uppercase">{swimmerToAssign.swimmer.club}</p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold uppercase text-text-secondary mb-1">Pilih Seri (Heat)</label>
                                <select 
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    value={assignHeat}
                                    onChange={e => setAssignHeat(Number(e.target.value))}
                                >
                                    {heatOptions.map(h => (
                                        <option key={h} value={h}>
                                            {h <= maxHeatNumber ? `Seri ${h}` : `+ Buat Seri Baru (Seri ${h})`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-text-secondary mb-1">Pilih Lintasan (Lane)</label>
                                {emptyLanesInSelectedHeat.length > 0 ? (
                                    <select 
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                        value={assignLane}
                                        onChange={e => setAssignLane(Number(e.target.value))}
                                    >
                                        {emptyLanesInSelectedHeat.map(lane => (
                                            <option key={lane} value={lane}>
                                                Lintasan {lane}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <p className="text-xs font-semibold text-red-500 bg-red-500/10 p-2 rounded">
                                        Tidak ada lintasan kosong di Seri {assignHeat}. Silakan pilih seri lain atau buat seri baru.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-border">
                            <Button 
                                variant="secondary" 
                                onClick={() => {
                                    setAssignModalOpen(false);
                                    setSwimmerToAssign(null);
                                }}
                            >
                                Batal
                            </Button>
                            <Button 
                                variant="primary" 
                                onClick={handleAssignLaneSubmit}
                                disabled={emptyLanesInSelectedHeat.length === 0}
                            >
                                Simpan Penempatan
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};