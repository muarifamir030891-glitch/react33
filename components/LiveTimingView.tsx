import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SwimEvent, Swimmer, Result, Heat, Entry, CompetitionInfo } from '../types';
import { getEventById, addOrUpdateEventResults, getSwimmers } from '../services/databaseService';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { formatEventName, generateHeats, reconstructLockedHeats, formatTime, parseMsToTimeParts } from '../constants';
import { useNotification } from './ui/NotificationManager';
import { useSerialTiming } from '../contexts/SerialTimingContext';

type ArduinoStatus = 'connected' | 'disconnected' | 'error' | 'unavailable';

interface LiveTimingViewProps {
  eventId: string;
  onBack: () => void;
  onDataUpdate: () => void;
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
  onStatusChange?: (status: ArduinoStatus) => void;
  events?: SwimEvent[];
  onSelectEvent?: (eventId: string) => void;
}

const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const PauseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ResetIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9a9 9 0 0114.24-4.76L20 5M20 15a9 9 0 01-14.24 4.76L4 19" /></svg>;
const UsbIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>;
const TerminalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const CogIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

export const LiveTimingView: React.FC<LiveTimingViewProps> = ({ eventId, onBack, onDataUpdate, swimmers, competitionInfo, onStatusChange, events = [], onSelectEvent }) => {
    const {
        arduinoStatus,
        isSerialConnected,
        selectedBaudRate,
        setSelectedBaudRate,
        activeLanesSetting,
        setActiveLanesSetting,
        connectSerial,
        forceResetPort,
        sendSerialCommand,
        serialLogs,
        clearLogs,
        stopwatchTime,
        isStopwatchRunning,
        handleStartStop,
        handleReset,
        handleForceEndRace,
        activeEventId,
        setActiveEventId,
        activeHeatIndex,
        setActiveHeatIndex,
        activeHeats,
        setActiveHeats,
        times,
        setTimes,
        dqSwimmers,
        nsSwimmers,
        flashingLane,
        handleTapLane,
        handleToggleDq,
        handleToggleNs,
        handleTimeChange,
        goToHeat
    } = useSerialTiming();

    const [event, setEvent] = useState<SwimEvent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { addNotification } = useNotification();

    // Serial Terminal Logs UI
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const terminalBottomRef = useRef<HTMLDivElement>(null);

    // Pin Remap Modal State
    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [mapLogicalLane, setMapLogicalLane] = useState<number>(1);
    const [mapPhysicalPin, setMapPhysicalPin] = useState<number>(1);

    useEffect(() => {
        if (onStatusChange) {
            onStatusChange(arduinoStatus);
        }
    }, [arduinoStatus, onStatusChange]);

    useEffect(() => {
        if (isTerminalOpen && terminalBottomRef.current) {
            terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [serialLogs, isTerminalOpen]);

    const fetchAndSetupEvent = useCallback(async () => {
        setIsLoading(true);
        try {
            const eventData = await getEventById(eventId);
            if (eventData) {
                setEvent(eventData);

                // Ensure swimmer data is available even if initial prop was empty
                let allSwimmers = swimmers;
                if (!allSwimmers || allSwimmers.length === 0) {
                    try {
                        allSwimmers = await getSwimmers();
                    } catch (err) {
                        console.warn("Could not fetch swimmers directly:", err);
                        allSwimmers = [];
                    }
                }

                const detailedEntries: Entry[] = eventData.entries
                    .map(entry => ({...entry, swimmer: allSwimmers.find(s => s.id === entry.swimmerId)!}))
                    .filter(e => e.swimmer);
                
                const lanes = competitionInfo?.numberOfLanes || 8;
                setActiveLanesSetting(lanes >= 10 ? 10 : 8);

                let generated = eventData.lanesLocked
                    ? reconstructLockedHeats(detailedEntries)
                    : generateHeats(detailedEntries, lanes);

                // If no entries are registered, create a standby test heat so the user can test ESP32 touchpads & timer
                if (generated.length === 0) {
                    const totalLanes = lanes >= 10 ? 10 : 8;
                    generated = [{
                        heatNumber: 1,
                        assignments: Array.from({ length: totalLanes }, (_, i) => ({
                            lane: i + 1,
                            entry: {
                                swimmerId: `test-lane-${i + 1}`,
                                seedTime: 0,
                                heatNumber: 1,
                                laneNumber: i + 1,
                                swimmer: {
                                    id: `test-lane-${i + 1}`,
                                    name: `Lintasan ${i + 1} (Mode Siap Sensor)`,
                                    club: 'ESP32 Touchpad Test',
                                    birthDate: '2000-01-01',
                                    gender: eventData.gender,
                                    photoUrl: ''
                                }
                            }
                        }))
                    }];
                }

                // Only override if event changed or heats are empty
                if (activeEventId !== eventId || activeHeats.length === 0) {
                    setActiveEventId(eventId);
                    setActiveHeats(generated);
                    setActiveHeatIndex(0);

                    const initialTimes: Record<string, { min: string, sec: string, ms: string }> = {};
                    const initialDq = new Set<string>();
                    const initialNs = new Set<string>();

                    detailedEntries.forEach(entry => { 
                        const existingResult = eventData.results.find(r => r.swimmerId === entry.swimmerId);
                        if (existingResult) {
                            if (existingResult.time === -1) {
                                initialDq.add(entry.swimmerId);
                                initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                            } else if (existingResult.time === -2) {
                                initialNs.add(entry.swimmerId);
                                initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                            } else if (existingResult.time < 0) {
                                initialDq.add(entry.swimmerId);
                                initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                            } else {
                                initialTimes[entry.swimmerId] = parseMsToTimeParts(existingResult.time);
                            }
                        } else {
                            initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                        }
                    });

                    // Also initialize placeholder test lanes if any
                    generated.forEach(heat => {
                        heat.assignments.forEach(({ entry }) => {
                            if (!initialTimes[entry.swimmer.id]) {
                                initialTimes[entry.swimmer.id] = { min: '0', sec: '0', ms: '000'};
                            }
                        });
                    });

                    setTimes(initialTimes);
                }
            }
        } catch (error) {
            console.error("Error setting up event timing:", error);
        } finally {
            setIsLoading(false);
        }
    }, [eventId, swimmers, competitionInfo, activeEventId, activeHeats.length, setActiveEventId, setActiveHeats, setActiveHeatIndex, setActiveLanesSetting, setTimes]);
    
    useEffect(() => {
        fetchAndSetupEvent();
    }, [fetchAndSetupEvent]);

    // Keyboard Shortcuts (R for reset, S/Space for start-pause)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                return;
            }

            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                handleReset();
            } else if (e.key === 's' || e.key === 'S' || e.code === 'Space') {
                e.preventDefault();
                handleStartStop();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleStartStop, handleReset]);

    const handleSetLanes = (count: number) => {
        setActiveLanesSetting(count);
        if (isSerialConnected) {
            sendSerialCommand(`LANES:${count}`);
        }
    };

    const handleSendPinMap = () => {
        const logicalIndex = mapLogicalLane - 1;
        const physicalIndex = mapPhysicalPin - 1;
        if (isSerialConnected) {
            sendSerialCommand(`MAP:${logicalIndex}:${physicalIndex}`);
        } else {
            addNotification("ESP32 belum terhubung via USB.", "error");
        }
    };

    const handleSaveResults = async (autoAdvance: boolean = false) => {
        const currentHeat = activeHeats[activeHeatIndex];
        if (!currentHeat) return;
        
        setIsSaving(true);
        try {
            const resultsToSave: Result[] = currentHeat.assignments
                .map(a => {
                    const time = times[a.entry.swimmerId];
                    if (dqSwimmers.has(a.entry.swimmerId)) {
                        return { swimmerId: a.entry.swimmerId, time: -1 };
                    }
                    if (nsSwimmers.has(a.entry.swimmerId)) {
                        return { swimmerId: a.entry.swimmerId, time: -2 };
                    }
                    if (!time) return { swimmerId: a.entry.swimmerId, time: -2 };
                    const ms = (parseInt(time.min || '0') * 60 * 1000) + (parseInt(time.sec || '0') * 1000) + parseInt(time.ms || '0');
                    
                    if (ms === 0) {
                        return { swimmerId: a.entry.swimmerId, time: -2 };
                    }
                    return { swimmerId: a.entry.swimmerId, time: ms };
                });
            
            await addOrUpdateEventResults(eventId, resultsToSave);
            addNotification(`Hasil Seri ${currentHeat.heatNumber} berhasil disimpan.`, 'success');
            onDataUpdate();
            await fetchAndSetupEvent();

            // If requested to proceed to next heat
            if (autoAdvance && activeHeatIndex < activeHeats.length - 1) {
                goToHeat(activeHeatIndex + 1);
            }
        } catch (error: any) {
            addNotification(`Gagal menyimpan hasil: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const formattedStopwatchTime = useMemo(() => {
        if (stopwatchTime === 0 && !isStopwatchRunning) {
            return '00:00.00';
        }
        return formatTime(stopwatchTime);
    }, [stopwatchTime, isStopwatchRunning]);

    if (isLoading) return <div className="flex justify-center mt-8"><Spinner /></div>;
    if (!event) return <p>Nomor lomba tidak ditemukan.</p>;
    
    const currentHeat = activeHeats[activeHeatIndex];

    return (
        <div className="space-y-6">
            {/* Header with Navigation & Title */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={onBack} variant="secondary" size="sm">&larr; Kembali ke Nomor Lomba</Button>
                        {events.length > 1 && onSelectEvent && (
                            <select
                                aria-label="Ganti Nomor Lomba"
                                value={eventId}
                                onChange={e => onSelectEvent(e.target.value)}
                                className="bg-surface border border-border text-xs rounded-lg px-2.5 py-1.5 font-medium text-text-primary focus:ring-1 focus:ring-primary max-w-xs truncate"
                                title="Pilih nomor lomba lain"
                            >
                                {events.map(ev => (
                                    <option key={ev.id} value={ev.id}>
                                        {formatEventName(ev)} ({ev.entries.length} atlet)
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold text-text-primary pt-1">{formatEventName(event)}</h1>
                    <p className="text-xs md:text-sm text-text-secondary">Antarmuka Kontrol Timing Otomatis &amp; Sensor ESP32 (8 / 10 Lintasan)</p>
                </div>

                {/* ESP32 Main Action Header Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        aria-label="Pilih Baud Rate"
                        value={selectedBaudRate}
                        onChange={e => setSelectedBaudRate(Number(e.target.value))}
                        disabled={isSerialConnected}
                        className="bg-surface border border-border text-xs rounded-lg px-2 py-2 text-text-primary focus:ring-1 focus:ring-primary"
                        title="Baud Rate Port Serial"
                    >
                        <option value={115200}>ESP32 (115200 Baud)</option>
                        <option value={9600}>Arduino Uno (9600 Baud)</option>
                    </select>

                    <Button 
                        onClick={connectSerial} 
                        variant={isSerialConnected ? "primary" : "secondary"}
                        className={`flex items-center gap-2 text-xs py-2 px-3 ${isSerialConnected ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border border-border'}`}
                        title="Hubungkan ke mikrokontroler ESP32 via Web Serial USB"
                    >
                        <UsbIcon />
                        <span>{isSerialConnected ? 'ESP32 Terhubung' : 'Hubungkan ESP32'}</span>
                    </Button>

                    <Button
                        onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                        variant="secondary"
                        size="sm"
                        className="flex items-center gap-1.5 text-xs py-2 px-3"
                        title="Buka Monitor Log Serial"
                    >
                        <TerminalIcon />
                        <span>Log Serial</span>
                    </Button>

                    <Button
                        onClick={forceResetPort}
                        variant="secondary"
                        size="sm"
                        className="text-xs py-2 px-2 text-text-secondary hover:text-red-400"
                        title="Lepas dan reset status port USB Serial jika terjadi kendala / port terkunci"
                    >
                        🔄 Reset Port
                    </Button>
                </div>
            </div>

            {/* Hardware Status & Quick Controls Bar */}
            <Card className="bg-surface border border-border/80 p-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${isSerialConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-text-primary">
                                    {isSerialConnected ? 'ESP32 Active Control' : 'ESP32 Disconnected (Mode Manual Standby)'}
                                </span>
                                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-background border border-border text-text-secondary">
                                    {activeLanesSetting} Lintasan Aktif
                                </span>
                            </div>
                            <p className="text-xs text-text-secondary">
                                {isSerialConnected 
                                    ? 'Menerima sinyal touch finish (LANE:X:timeMs), Start (S), Reset (R), dan DQ (DQ:X). Koneksi tetap aktif walau Anda membuka menu lain.'
                                    : 'Sambungkan kabel USB ESP32 ke laptop/PC dan klik tombol "Hubungkan ESP32" di atas.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        {/* Lane Count Switcher */}
                        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                            <button
                                onClick={() => handleSetLanes(8)}
                                className={`px-2.5 py-1.5 font-bold transition-colors ${activeLanesSetting === 8 ? 'bg-primary text-white' : 'bg-background text-text-secondary hover:text-text-primary'}`}
                            >
                                8 Lintasan
                            </button>
                            <button
                                onClick={() => handleSetLanes(10)}
                                className={`px-2.5 py-1.5 font-bold transition-colors ${activeLanesSetting === 10 ? 'bg-primary text-white' : 'bg-background text-text-secondary hover:text-text-primary'}`}
                            >
                                10 Lintasan
                            </button>
                        </div>

                        {/* Force End Button */}
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleForceEndRace}
                            disabled={!isStopwatchRunning && !isSerialConnected}
                            className="text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                            title="Tutup paksa perlombaan jika ada perenang DNS / sensor macet"
                        >
                            ⏹️ Tutup Race (END)
                        </Button>

                        {/* Remap Pin Modal Button */}
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setIsMapModalOpen(true)}
                            className="text-xs flex items-center gap-1"
                            title="Konfigurasi pengalihan pin cadangan jika tombol fisik/touchpad rusak"
                        >
                            <CogIcon />
                            <span>Remap Pin Cadangan</span>
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Serial Terminal Log Console (Collapsible) */}
            {isTerminalOpen && (
                <Card className="bg-slate-950 text-slate-100 font-mono text-xs border border-slate-800 p-4">
                    <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <TerminalIcon />
                            <span className="font-bold text-slate-200">ESP32 Live Serial Terminal (115200 Baud)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={clearLogs}
                                className="text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 text-[10px]"
                            >
                                Bersihkan Log
                            </button>
                            <button 
                                onClick={() => setIsTerminalOpen(false)}
                                className="text-slate-400 hover:text-slate-200 text-sm font-bold px-1.5"
                            >
                                &times;
                            </button>
                        </div>
                    </div>
                    <div className="h-44 overflow-y-auto space-y-1 pr-1 select-text">
                        {serialLogs.length === 0 ? (
                            <p className="text-slate-600 italic">Belum ada aktivitas data serial. Hubungkan ESP32 untuk memonitor paket real-time...</p>
                        ) : (
                            serialLogs.map(log => (
                                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                                    <span className="text-slate-500 text-[10px] flex-shrink-0">{log.timestamp}</span>
                                    <span className={
                                        log.type === 'tx' ? 'text-cyan-400' :
                                        log.type === 'rx' ? 'text-emerald-400' :
                                        log.type === 'err' ? 'text-red-400 font-bold' : 'text-amber-300'
                                    }>
                                        {log.text}
                                    </span>
                                </div>
                            ))
                        )}
                        <div ref={terminalBottomRef} />
                    </div>
                </Card>
            )}

            {/* Master Stopwatch Display & Controls */}
            <Card className="p-6">
                <div className="text-center">
                    <p className="text-7xl sm:text-8xl font-mono tracking-tighter text-primary font-bold">{formattedStopwatchTime}</p>
                    
                    <div className="flex flex-wrap justify-center items-center gap-3 mt-6">
                        <Button 
                            onClick={handleStartStop} 
                            className={`px-8 py-3 text-lg flex items-center gap-2 ${isStopwatchRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                        >
                            {isStopwatchRunning ? <PauseIcon /> : <PlayIcon />}
                            <span>{isStopwatchRunning ? 'Jeda Stopwatch' : 'Mulai (Start / S)'}</span>
                        </Button>
                        
                        <Button 
                            onClick={() => handleReset(true)} 
                            variant="secondary" 
                            className="px-6 py-3 text-lg flex items-center gap-2"
                        >
                            <ResetIcon />
                            <span>Reset (R)</span>
                        </Button>
                    </div>

                    <p className="text-xs text-text-secondary mt-3">
                        {isSerialConnected 
                            ? '💡 Stopwatch otomatis tersinkronisasi saat tombol Start fisik (GPIO 4) ditekan pada hardware ESP32. Koneksi tetap menyala meskipun Anda berpindah menu.'
                            : '💡 Mode Stopwatch Manual aktif. Hubungkan ESP32 untuk pengoperasian sensor otomatis.'}
                    </p>
                </div>
            </Card>

            {/* Heats Navigation & Active Lane Controller */}
            {activeHeats.length > 0 && currentHeat ? (
                <>
                <Card className="p-4">
                    <div className="flex justify-between items-center">
                        <Button 
                            onClick={() => goToHeat(activeHeatIndex - 1)} 
                            disabled={activeHeatIndex === 0}
                            variant="secondary"
                            size="sm"
                        >
                            &larr; Seri Sebelumnya
                        </Button>
                        
                        <div className="text-center">
                            <h2 className="text-xl md:text-2xl font-bold">Seri {currentHeat.heatNumber} dari {activeHeats.length}</h2>
                            <p className="text-xs text-text-secondary font-mono">{currentHeat.assignments.length} Perenang Terjadwal</p>
                        </div>

                        <Button 
                            onClick={() => goToHeat(activeHeatIndex + 1)} 
                            disabled={activeHeatIndex === activeHeats.length - 1}
                            variant="secondary"
                            size="sm"
                        >
                            Seri Berikutnya &rarr;
                        </Button>
                    </div>
                </Card>

                {/* Lanes Grid */}
                <div className="space-y-3">
                    {currentHeat.assignments.map(({ lane, entry }) => {
                        const isDq = dqSwimmers.has(entry.swimmer.id);
                        const isNs = nsSwimmers.has(entry.swimmer.id);
                        const isDisabled = isDq || isNs;
                        const isFlashing = flashingLane === entry.swimmer.id;

                        const curTimeObj = times[entry.swimmer.id];
                        const recordedMs = curTimeObj ? (parseInt(curTimeObj.min || '0') * 60000) + (parseInt(curTimeObj.sec || '0') * 1000) + parseInt(curTimeObj.ms || '0') : 0;
                        const hasFinished = recordedMs > 0 && !isDisabled;

                        return (
                            <div 
                                key={lane} 
                                className={`p-3 rounded-xl grid grid-cols-12 gap-3 items-center border transition-all duration-300 ${
                                    isDq ? 'bg-red-950/40 border-red-500/50' : 
                                    isNs ? 'bg-slate-800/40 border-slate-700' : 
                                    hasFinished ? 'bg-emerald-950/20 border-emerald-500/40' : 
                                    'bg-surface border-border'
                                } ${isFlashing ? 'ring-4 ring-emerald-400 bg-emerald-500/20 scale-[1.01]' : ''}`}
                            >
                                {/* Lane Number Badge */}
                                <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center">
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-sm ${
                                        hasFinished ? 'bg-emerald-500 text-white' : 
                                        isDq ? 'bg-red-600 text-white' : 
                                        isNs ? 'bg-slate-600 text-white' : 
                                        'bg-background border border-border text-text-primary'
                                    }`}>
                                        {lane}
                                    </span>
                                    <span className="text-[9px] uppercase font-bold text-text-secondary mt-0.5">Lane {lane}</span>
                                </div>

                                {/* Swimmer Details */}
                                <div className="col-span-10 sm:col-span-4 min-w-0">
                                    <p className="font-bold text-sm sm:text-base text-text-primary uppercase truncate">{entry.swimmer.name}</p>
                                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                                        <span className="uppercase truncate">{entry.swimmer.club}</span>
                                        <span>•</span>
                                        <span className="font-mono text-[10px]">Seed: {formatTime(entry.seedTime)}</span>
                                    </div>
                                    {hasFinished && (
                                        <span className="inline-block mt-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                            ✓ FINISHED: {formatTime(recordedMs)}
                                        </span>
                                    )}
                                </div>

                                {/* High-Precision Time Inputs */}
                                <div className="col-span-7 sm:col-span-4 flex items-center bg-background rounded-lg p-1.5 border border-border shadow-inner">
                                    <div className="flex-1 min-w-0">
                                        <Input 
                                            aria-label="Menit" 
                                            label="" 
                                            id={`min-${entry.swimmer.id}`} 
                                            type="number" 
                                            min="0" 
                                            value={times[entry.swimmer.id]?.min || '0'} 
                                            onChange={e => handleTimeChange(entry.swimmer.id, 'min', e.target.value)} 
                                            disabled={isDisabled} 
                                            className="text-center font-mono font-bold text-sm"
                                        />
                                    </div>
                                    <span className="px-1 font-bold text-text-secondary">:</span>
                                    <div className="flex-1 min-w-0">
                                        <Input 
                                            aria-label="Detik" 
                                            label="" 
                                            id={`sec-${entry.swimmer.id}`} 
                                            type="number" 
                                            min="0" 
                                            max="99" 
                                            value={times[entry.swimmer.id]?.sec || '0'} 
                                            onChange={e => handleTimeChange(entry.swimmer.id, 'sec', e.target.value)} 
                                            disabled={isDisabled} 
                                            className="text-center font-mono font-bold text-sm"
                                        />
                                    </div>
                                    <span className="px-1 font-bold text-text-secondary">.</span>
                                    <div className="flex-1 min-w-0">
                                        <Input 
                                            aria-label="Milidetik" 
                                            label="" 
                                            id={`ms-${entry.swimmer.id}`} 
                                            type="number" 
                                            min="0" 
                                            max="999" 
                                            value={times[entry.swimmer.id]?.ms || '0'} 
                                            onChange={e => handleTimeChange(entry.swimmer.id, 'ms', e.target.value)} 
                                            disabled={isDisabled} 
                                            className="text-center font-mono font-bold text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Status and Actions (DQ, NS, TAP) */}
                                <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-1.5">
                                    <button 
                                        type="button"
                                        onClick={() => handleToggleNs(entry.swimmer.id)} 
                                        className={`px-2 py-1.5 rounded text-xs font-bold transition-colors ${isNs ? 'bg-slate-500 text-white' : 'bg-slate-800/60 hover:bg-slate-700 text-slate-300'}`}
                                        title="Tandai Tidak Hadir (No Show)"
                                    >
                                        NS
                                    </button>
                                    
                                    <button 
                                        type="button"
                                        onClick={() => handleToggleDq(entry.swimmer.id, lane)} 
                                        className={`px-2 py-1.5 rounded text-xs font-bold transition-colors ${isDq ? 'bg-red-600 text-white ring-2 ring-red-400' : 'bg-amber-900/60 hover:bg-amber-800 text-amber-300'}`}
                                        title="Diskualifikasi perenang (Kirim sinyal DQ ke ESP32)"
                                    >
                                        DQ
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleTapLane(entry.swimmer.id)}
                                        disabled={isDisabled}
                                        className="h-9 px-3 rounded-lg flex items-center justify-center bg-primary hover:bg-primary-hover text-white disabled:bg-secondary disabled:cursor-not-allowed transition-all font-bold text-xs shadow"
                                        aria-label={`Tap to record time for lane ${lane}`}
                                        title="Catat Waktu Manual (Backup)"
                                    >
                                        TAP
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Save Results Button */}
                <div className="mt-8 pt-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-text-secondary">
                        Simpan catatan waktu seri ini ke basis data. Memilih lanjut ke seri berikutnya akan otomatis mereset timer ke 00:00.00.
                    </p>

                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <Button 
                            onClick={() => handleSaveResults(false)} 
                            disabled={isSaving} 
                            variant="secondary"
                            className="w-full sm:w-auto px-5 py-3 text-sm font-bold"
                        >
                            {isSaving ? <Spinner /> : 'Simpan Hasil Seri Ini'}
                        </Button>

                        {activeHeatIndex < activeHeats.length - 1 && (
                            <Button 
                                onClick={() => handleSaveResults(true)} 
                                disabled={isSaving} 
                                className="w-full sm:w-auto px-6 py-3 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                            >
                                {isSaving ? <Spinner /> : `Simpan & Lanjut ke Seri ${activeHeats[activeHeatIndex + 1]?.heatNumber || (activeHeatIndex + 2)} (Reset Timer) ➔`}
                            </Button>
                        )}
                    </div>
                </div>
                </>
            ) : (
                <Card className="mt-6 text-center py-12 text-text-secondary">
                    <p className="text-lg font-semibold">Tidak ada atlet terdaftar untuk nomor lomba ini.</p>
                    <p className="text-sm mt-1">Daftarkan peserta terlebih dahulu melalui menu Unggah Peserta atau Daftar Atlet.</p>
                </Card>
            )}

            {/* Modal: Remap Backup Pin on ESP32 */}
            <Modal
                isOpen={isMapModalOpen}
                onClose={() => setIsMapModalOpen(false)}
                title="Konfigurasi Pin Cadangan ESP32 (Emergency Remap)"
            >
                <div className="space-y-4">
                    <p className="text-xs text-text-secondary">
                        Jika tombol touchpad atau kabel sensor pada salah satu lintasan fisik mengalami kerusakan di tengah lomba, Anda dapat memetakan lintasan tersebut ke tombol cadangan (GPIO 16 / 17) tanpa mengubah firmware.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-text-secondary mb-1">Lintasan Logis (Race)</label>
                            <select
                                value={mapLogicalLane}
                                onChange={e => setMapLogicalLane(Number(e.target.value))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-primary"
                            >
                                {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                                    <option key={num} value={num}>Lintasan {num}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase text-text-secondary mb-1">Diarahkan ke Tombol Fisik</label>
                            <select
                                value={mapPhysicalPin}
                                onChange={e => setMapPhysicalPin(Number(e.target.value))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-primary"
                            >
                                <option value={1}>Tombol 1 (GPIO 13)</option>
                                <option value={2}>Tombol 2 (GPIO 14)</option>
                                <option value={3}>Tombol 3 (GPIO 27)</option>
                                <option value={4}>Tombol 4 (GPIO 26)</option>
                                <option value={5}>Tombol 5 (GPIO 25)</option>
                                <option value={6}>Tombol 6 (GPIO 33)</option>
                                <option value={7}>Tombol 7 (GPIO 32)</option>
                                <option value={8}>Tombol 8 (GPIO 15)</option>
                                <option value={9}>Tombol 9 (GPIO 16 - CADANGAN 1)</option>
                                <option value={10}>Tombol 10 (GPIO 17 - CADANGAN 2)</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-text-secondary">
                        <span className="font-bold text-primary block mb-1">Perintah Serial:</span>
                        <code className="font-mono text-text-primary">MAP:{mapLogicalLane - 1}:{mapPhysicalPin - 1}</code>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-border">
                        <Button variant="secondary" onClick={() => setIsMapModalOpen(false)}>Batal</Button>
                        <Button variant="primary" onClick={handleSendPinMap}>Kirim Mapping ke ESP32</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
