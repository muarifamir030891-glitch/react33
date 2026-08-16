import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SwimEvent, Swimmer, Result, Heat, Entry, CompetitionInfo } from '../types';
import { getEventById, addOrUpdateEventResults } from '../services/databaseService';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { formatEventName, generateHeats, reconstructLockedHeats, formatTime, parseMsToTimeParts } from '../constants';
import { useNotification } from './ui/NotificationManager';
import { useEsp32, BAUD_RATE_OPTIONS, ArduinoStatus, ParsedSerialEvent } from '../contexts/Esp32Context';

interface LiveTimingViewProps {
  eventId: string;
  onBack: () => void;
  onDataUpdate: () => void;
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
  onStatusChange?: (status: ArduinoStatus) => void;
  onOpenEsp32Menu?: () => void;
}

const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const PauseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ResetIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9a9 9 0 0114.24-4.76L20 5M20 15a9 9 0 01-14.24 4.76L4 19" /></svg>;
const UsbIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>;
const TerminalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const CogIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

export const LiveTimingView: React.FC<LiveTimingViewProps> = ({
  eventId,
  onBack,
  onDataUpdate,
  swimmers,
  competitionInfo,
  onStatusChange,
  onOpenEsp32Menu,
}) => {
  const [event, setEvent] = useState<SwimEvent | null>(null);
  const [heats, setHeats] = useState<Heat[]>([]);
  const [currentHeatIndex, setCurrentHeatIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [times, setTimes] = useState<Record<string, { min: string; sec: string; ms: string }>>({});
  const [dqSwimmers, setDqSwimmers] = useState(new Set<string>());
  const [nsSwimmers, setNsSwimmers] = useState(new Set<string>());
  const [flashingLane, setFlashingLane] = useState<string | null>(null);
  const { addNotification } = useNotification();

  // Consume global ESP32 context
  const {
    status: esp32Status,
    isConnected: isSerialConnected,
    isSupported,
    baudRate,
    activeLanes,
    logs: serialLogs,
    setBaudRate,
    setActiveLanes,
    connect: connectSerial,
    disconnect: disconnectSerial,
    forceReset: forceResetPort,
    sendCommand: sendSerialCommand,
    mapPin,
    clearLogs: clearSerialLogs,
    subscribe: subscribeSerial,
  } = useEsp32();

  // Stopwatch state
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const animationFrameId = useRef<number | undefined>(undefined);
  const startTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);

  // Serial Terminal Logs & Modal UI
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  // Pin Remap Modal State
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapLogicalLane, setMapLogicalLane] = useState<number>(1);
  const [mapPhysicalPin, setMapPhysicalPin] = useState<number>(1);

  // Synchronized refs for real-time access
  const isStopwatchRunningRef = useRef(isStopwatchRunning);
  const stopwatchTimeRef = useRef(stopwatchTime);
  const currentHeatRef = useRef<Heat | null>(null);
  const heatsRef = useRef<Heat[]>([]);
  const currentHeatIndexRef = useRef<number>(0);
  const timesRef = useRef(times);
  const dqSwimmersRef = useRef(dqSwimmers);

  useEffect(() => {
    isStopwatchRunningRef.current = isStopwatchRunning;
    stopwatchTimeRef.current = stopwatchTime;
    heatsRef.current = heats;
    currentHeatIndexRef.current = currentHeatIndex;
    currentHeatRef.current = heats[currentHeatIndex] || null;
    timesRef.current = times;
    dqSwimmersRef.current = dqSwimmers;
  }, [isStopwatchRunning, stopwatchTime, heats, currentHeatIndex, times, dqSwimmers]);

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(esp32Status);
    }
  }, [esp32Status, onStatusChange]);

  useEffect(() => {
    if (isTerminalOpen && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serialLogs, isTerminalOpen]);

  const fetchAndSetupEvent = useCallback(async () => {
    setIsLoading(true);
    const eventData = await getEventById(eventId);
    if (eventData) {
      setEvent(eventData);
      const detailedEntries: Entry[] = eventData.entries
        .map(entry => ({ ...entry, swimmer: swimmers.find(s => s.id === entry.swimmerId)! }))
        .filter(e => e.swimmer);

      const lanes = competitionInfo?.numberOfLanes || activeLanes || 8;

      const generated = eventData.lanesLocked
        ? reconstructLockedHeats(detailedEntries)
        : generateHeats(detailedEntries, lanes);
      setHeats(generated);

      const initialTimes: Record<string, { min: string; sec: string; ms: string }> = {};
      const initialDq = new Set<string>();
      const initialNs = new Set<string>();
      detailedEntries.forEach(entry => {
        const existingResult = eventData.results.find(r => r.swimmerId === entry.swimmerId);
        if (existingResult) {
          if (existingResult.time === -1) {
            initialDq.add(entry.swimmerId);
            initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000' };
          } else if (existingResult.time === -2) {
            initialNs.add(entry.swimmerId);
            initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000' };
          } else if (existingResult.time < 0) {
            initialDq.add(entry.swimmerId);
            initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000' };
          } else {
            initialTimes[entry.swimmerId] = parseMsToTimeParts(existingResult.time);
          }
        } else {
          initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000' };
        }
      });
      setTimes(initialTimes);
      setDqSwimmers(initialDq);
      setNsSwimmers(initialNs);
    }
    setIsLoading(false);
  }, [eventId, swimmers, competitionInfo, activeLanes]);

  useEffect(() => {
    fetchAndSetupEvent();
  }, [fetchAndSetupEvent]);

  // Stopwatch Runner Effect
  useEffect(() => {
    const runStopwatch = (timestamp: number) => {
      const elapsed = timestamp - startTimeRef.current;
      setStopwatchTime(pausedTimeRef.current + elapsed);
      animationFrameId.current = requestAnimationFrame(runStopwatch);
    };

    if (isStopwatchRunning) {
      startTimeRef.current = performance.now();
      animationFrameId.current = requestAnimationFrame(runStopwatch);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isStopwatchRunning]);

  const handleTapLane = useCallback((swimmerId: string) => {
    const captureTime = isStopwatchRunningRef.current
      ? performance.now() - startTimeRef.current + pausedTimeRef.current
      : stopwatchTimeRef.current;

    if (captureTime > 0) {
      setTimes(prev => {
        const existing = prev[swimmerId];
        const existingMs =
          parseInt(existing?.min || '0') * 60000 +
          parseInt(existing?.sec || '0') * 1000 +
          parseInt(existing?.ms || '0');

        if (existingMs > 0) return prev; // Already finished

        return {
          ...prev,
          [swimmerId]: parseMsToTimeParts(captureTime),
        };
      });
    }

    setFlashingLane(swimmerId);
    setTimeout(() => setFlashingLane(null), 1500);
  }, []);

  // Subscribe to Global ESP32 Serial Events
  useEffect(() => {
    const unsubscribe = subscribeSerial((event: ParsedSerialEvent) => {
      if (event.type === 'START') {
        setStopwatchTime(0);
        pausedTimeRef.current = 0;
        startTimeRef.current = performance.now();
        setIsStopwatchRunning(true);
        addNotification('🚦 Sinyal Start (GO) diterima dari ESP32!', 'success', 2500);
      } else if (event.type === 'RESET') {
        setIsStopwatchRunning(false);
        setStopwatchTime(0);
        pausedTimeRef.current = 0;
        startTimeRef.current = 0;
        addNotification('🔄 Sinyal Reset diterima dari ESP32.', 'info', 2000);
      } else if (event.type === 'LANE_FINISH') {
        const curHeat = currentHeatRef.current;
        if (curHeat) {
          const assignment = curHeat.assignments.find(a => a.lane === event.lane);
          if (assignment) {
            const swimmerId = assignment.entry.swimmer.id;
            const timeParts = parseMsToTimeParts(event.timeMs);

            setTimes(prev => ({
              ...prev,
              [swimmerId]: timeParts,
            }));

            setFlashingLane(swimmerId);
            setTimeout(() => setFlashingLane(null), 2000);

            addNotification(
              `🏁 Lintasan ${event.lane} (${assignment.entry.swimmer.name}) Touchpad: ${formatTime(event.timeMs)}`,
              'success',
              4000
            );
          }
        }
      } else if (event.type === 'LANE_TAP') {
        const curHeat = currentHeatRef.current;
        if (curHeat) {
          const assignment = curHeat.assignments.find(a => a.lane === event.lane);
          if (assignment) {
            handleTapLane(assignment.entry.swimmer.id);
          }
        }
      } else if (event.type === 'DQ_CONFIRMED') {
        const curHeat = currentHeatRef.current;
        if (curHeat) {
          const ass = curHeat.assignments.find(a => a.lane === event.lane);
          if (ass) {
            setDqSwimmers(prev => new Set(prev).add(ass.entry.swimmer.id));
          }
        }
        addNotification(`⚠️ Lintasan ${event.lane} resmi didiskualifikasi (DQ) pada ESP32.`, 'warning', 3000);
      } else if (event.type === 'RACE_COMPLETE') {
        setIsStopwatchRunning(false);
        addNotification('🏁 Perlombaan seri ini telah selesai di ESP32. Silakan simpan hasil!', 'info', 4000);
      } else if (event.type === 'MAP_CONFIRMED') {
        addNotification(`🔀 Mapping Tombol Berhasil: Lintasan ${event.logicalLane} -> Pin Fisik ${event.physicalPin}.`, 'success', 4000);
        setIsMapModalOpen(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [subscribeSerial, addNotification, handleTapLane]);

  const handleStartStop = useCallback(() => {
    if (isStopwatchRunningRef.current) {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = undefined;
      }
      pausedTimeRef.current = stopwatchTimeRef.current;
      setIsStopwatchRunning(false);
      isStopwatchRunningRef.current = false;
    } else {
      if (isSerialConnected) {
        sendSerialCommand('S');
      }
      startTimeRef.current = performance.now();
      setIsStopwatchRunning(true);
      isStopwatchRunningRef.current = true;
    }
  }, [isSerialConnected, sendSerialCommand]);

  const handleReset = useCallback(
    (clearHeatTimes: boolean = false) => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = undefined;
      }

      setIsStopwatchRunning(false);
      isStopwatchRunningRef.current = false;
      setStopwatchTime(0);
      stopwatchTimeRef.current = 0;
      pausedTimeRef.current = 0;
      startTimeRef.current = 0;

      const curHeat = currentHeatRef.current;
      if (curHeat) {
        setTimes(prev => {
          const updated = { ...prev };
          curHeat.assignments.forEach(({ entry }) => {
            updated[entry.swimmer.id] = { min: '0', sec: '0', ms: '000' };
          });
          return updated;
        });
        setDqSwimmers(prev => {
          const updated = new Set(prev);
          curHeat.assignments.forEach(({ entry }) => updated.delete(entry.swimmer.id));
          return updated;
        });
        setNsSwimmers(prev => {
          const updated = new Set(prev);
          curHeat.assignments.forEach(({ entry }) => updated.delete(entry.swimmer.id));
          return updated;
        });
      }

      if (isSerialConnected) {
        sendSerialCommand('R');
      }

      addNotification('🔄 Stopwatch dan catatan waktu seri berhasil di-reset.', 'info', 2000);
    },
    [isSerialConnected, sendSerialCommand, addNotification]
  );

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

  const handleForceEndRace = () => {
    if (isSerialConnected) {
      sendSerialCommand('END');
    } else {
      setIsStopwatchRunning(false);
    }
    addNotification('Perintah penutupan lomba (END) dikirim.', 'info');
  };

  const handleSetLanes = async (count: number) => {
    await setActiveLanes(count);
  };

  const handleSendPinMap = async () => {
    if (!isSerialConnected) {
      addNotification('ESP32 belum terhubung via USB.', 'error');
      return;
    }
    const success = await mapPin(mapLogicalLane, mapPhysicalPin);
    if (success) {
      addNotification(`Mapping dikirim: Lintasan ${mapLogicalLane} -> Pin ${mapPhysicalPin}`, 'info');
    }
  };

  const handleTimeChange = (swimmerId: string, part: 'min' | 'sec' | 'ms', value: string) => {
    setTimes(prev => ({
      ...prev,
      [swimmerId]: { ...prev[swimmerId], [part]: value },
    }));
  };

  const handleToggleDq = (swimmerId: string, laneNumber: number) => {
    const newDqSwimmers = new Set(dqSwimmers);
    const newNsSwimmers = new Set(nsSwimmers);

    if (newDqSwimmers.has(swimmerId)) {
      newDqSwimmers.delete(swimmerId);
    } else {
      newDqSwimmers.add(swimmerId);
      newNsSwimmers.delete(swimmerId);
      if (isSerialConnected) {
        sendSerialCommand(`DQ:${laneNumber}`);
      }
    }
    setDqSwimmers(newDqSwimmers);
    setNsSwimmers(newNsSwimmers);
  };

  const handleToggleNs = (swimmerId: string) => {
    const newNsSwimmers = new Set(nsSwimmers);
    const newDqSwimmers = new Set(dqSwimmers);

    if (newNsSwimmers.has(swimmerId)) {
      newNsSwimmers.delete(swimmerId);
    } else {
      newNsSwimmers.add(swimmerId);
      newDqSwimmers.delete(swimmerId);
    }
    setNsSwimmers(newNsSwimmers);
    setDqSwimmers(newDqSwimmers);
  };

  const handleSaveResults = async () => {
    const currentHeat = heats[currentHeatIndex];
    if (!currentHeat) return;

    setIsSaving(true);
    try {
      const resultsToSave: Result[] = currentHeat.assignments.map(a => {
        const time = times[a.entry.swimmerId];
        if (dqSwimmers.has(a.entry.swimmerId)) {
          return { swimmerId: a.entry.swimmerId, time: -1 };
        }
        if (nsSwimmers.has(a.entry.swimmerId)) {
          return { swimmerId: a.entry.swimmerId, time: -2 };
        }
        if (!time) return { swimmerId: a.entry.swimmerId, time: -2 };
        const ms =
          parseInt(time.min || '0') * 60 * 1000 +
          parseInt(time.sec || '0') * 1000 +
          parseInt(time.ms || '0');

        if (ms === 0) {
          return { swimmerId: a.entry.swimmerId, time: -2 };
        }
        return { swimmerId: a.entry.swimmerId, time: ms };
      });

      await addOrUpdateEventResults(eventId, resultsToSave);
      addNotification(`Hasil untuk Seri ${currentHeat.heatNumber} berhasil disimpan.`, 'info');
      onDataUpdate();
      await fetchAndSetupEvent();
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

  const currentHeat = heats[currentHeatIndex];

  return (
    <div id="live-timing-container" className="space-y-6">
      {/* Header with Navigation & Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Button onClick={onBack} variant="secondary" className="mb-2">
            &larr; Kembali ke Nomor Lomba
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary">{formatEventName(event)}</h1>
          <p className="text-xs md:text-sm text-text-secondary">
            Timing Otomatis &amp; Sensor Touchpad ESP32 ({activeLanes} Lintasan Aktif)
          </p>
        </div>

        {/* ESP32 Header Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="live-timing-baud-select"
            aria-label="Pilih Baud Rate"
            value={baudRate}
            onChange={e => setBaudRate(Number(e.target.value))}
            disabled={isSerialConnected}
            className="bg-surface border border-border text-xs rounded-lg px-2.5 py-2 text-text-primary focus:ring-1 focus:ring-primary"
            title="Baud Rate Port Serial ESP32"
          >
            {BAUD_RATE_OPTIONS.map(b => (
              <option key={b} value={b}>
                {b} baud
              </option>
            ))}
          </select>

          <Button
            id="live-timing-connect-btn"
            onClick={isSerialConnected ? disconnectSerial : () => connectSerial()}
            variant={isSerialConnected ? 'primary' : 'secondary'}
            className={`flex items-center gap-2 text-xs py-2 px-3 ${
              isSerialConnected
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'border border-border'
            }`}
            title="Koneksi Web Serial USB"
          >
            <UsbIcon />
            <span>{isSerialConnected ? 'ESP32 Terhubung' : 'Hubungkan ESP32'}</span>
          </Button>

          <Button
            id="live-timing-open-terminal-btn"
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            variant="secondary"
            className="flex items-center gap-1.5 text-xs py-2 px-3"
            title="Buka Monitor Log Serial Real-time"
          >
            <TerminalIcon />
            <span>Log Serial ({serialLogs.length})</span>
          </Button>

          {onOpenEsp32Menu && (
            <Button
              id="live-timing-open-esp32-menu-btn"
              onClick={onOpenEsp32Menu}
              variant="secondary"
              className="text-xs py-2 px-2.5 flex items-center space-x-1"
              title="Buka Menu Konfigurasi Hardware ESP32 Lengkap"
            >
              <CogIcon />
              <span>Menu ESP32</span>
            </Button>
          )}

          <Button
            id="live-timing-reset-port-btn"
            onClick={forceResetPort}
            variant="secondary"
            className="text-xs py-2 px-2 text-text-secondary hover:text-red-400"
            title="Lepas dan reset status port USB jika terkunci"
          >
            🔄 Reset Port
          </Button>
        </div>
      </div>

      {/* Hardware Status & Quick Controls Bar */}
      <Card className="bg-surface border border-border/80 p-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                isSerialConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-text-primary">
                  {isSerialConnected ? 'ESP32 Active Control' : 'ESP32 Standby (Koneksi Global Port Terbuka)'}
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-background border border-border text-text-secondary">
                  {activeLanes} Lintasan Aktif
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {isSerialConnected
                  ? 'Menerima sinyal touch finish (LANE:X:timeMs), Start (S), Reset (R), dan DQ (DQ:X).'
                  : 'Klik "Hubungkan ESP32" sekali. Port akan tersimpan di variabel global dan tidak terputus saat berganti menu.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Lane Count Switcher */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {[6, 8, 10].map(count => (
                <button
                  key={count}
                  onClick={() => handleSetLanes(count)}
                  className={`px-2.5 py-1.5 font-bold transition-colors ${
                    activeLanes === count
                      ? 'bg-primary text-white'
                      : 'bg-background text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {count}L
                </button>
              ))}
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
              <span>Remap Pin</span>
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
              <span className="font-bold text-slate-200">ESP32 Live Serial Terminal ({baudRate} Baud)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSerialLogs}
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
              <p className="text-slate-600 italic">
                Belum ada aktivitas data serial. Hubungkan ESP32 untuk memonitor paket data real-time...
              </p>
            ) : (
              serialLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 text-[10px] flex-shrink-0">{log.timestamp}</span>
                  <span
                    className={
                      log.type === 'tx'
                        ? 'text-cyan-400'
                        : log.type === 'rx'
                        ? 'text-emerald-400 font-semibold'
                        : log.type === 'err'
                        ? 'text-red-400 font-bold'
                        : log.type === 'data'
                        ? 'text-purple-400'
                        : 'text-amber-300'
                    }
                  >
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
          <p className="text-7xl sm:text-8xl font-mono tracking-tighter text-primary font-bold">
            {formattedStopwatchTime}
          </p>

          <div className="flex flex-wrap justify-center items-center gap-3 mt-6">
            <Button
              id="live-timing-start-stop-btn"
              onClick={handleStartStop}
              className={`px-8 py-3 text-lg flex items-center gap-2 ${
                isStopwatchRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isStopwatchRunning ? <PauseIcon /> : <PlayIcon />}
              <span>{isStopwatchRunning ? 'Jeda Stopwatch' : 'Mulai (Start / S)'}</span>
            </Button>

            <Button
              id="live-timing-reset-btn"
              onClick={() => handleReset()}
              variant="secondary"
              className="px-6 py-3 text-lg flex items-center gap-2"
            >
              <ResetIcon />
              <span>Reset (R)</span>
            </Button>
          </div>

          <p className="text-xs text-text-secondary mt-3">
            {isSerialConnected
              ? '💡 Stopwatch otomatis tersinkronisasi saat tombol Start fisik (GPIO 4) ditekan pada hardware ESP32.'
              : '💡 Mode Stopwatch Manual aktif. Hubungkan ESP32 untuk pengoperasian sensor touchpad otomatis.'}
          </p>
        </div>
      </Card>

      {/* Heats Navigation & Active Lane Controller */}
      {heats.length > 0 && currentHeat ? (
        <>
          <Card className="p-4">
            <div className="flex justify-between items-center">
              <Button
                id="live-timing-prev-heat-btn"
                onClick={() => setCurrentHeatIndex(p => p - 1)}
                disabled={currentHeatIndex === 0}
                variant="secondary"
                size="sm"
              >
                &larr; Seri Sebelumnya
              </Button>

              <div className="text-center">
                <h2 className="text-xl md:text-2xl font-bold">
                  Seri {currentHeat.heatNumber} dari {heats.length}
                </h2>
                <p className="text-xs text-text-secondary font-mono">
                  {currentHeat.assignments.length} Perenang Terjadwal
                </p>
              </div>

              <Button
                id="live-timing-next-heat-btn"
                onClick={() => setCurrentHeatIndex(p => p + 1)}
                disabled={currentHeatIndex === heats.length - 1}
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
              const recordedMs = curTimeObj
                ? parseInt(curTimeObj.min || '0') * 60000 +
                  parseInt(curTimeObj.sec || '0') * 1000 +
                  parseInt(curTimeObj.ms || '0')
                : 0;
              const hasFinished = recordedMs > 0 && !isDisabled;

              return (
                <div
                  key={lane}
                  id={`live-lane-row-${lane}`}
                  className={`p-3 rounded-xl grid grid-cols-12 gap-3 items-center border transition-all duration-300 ${
                    isDq
                      ? 'bg-red-950/40 border-red-500/50'
                      : isNs
                      ? 'bg-slate-800/40 border-slate-700'
                      : hasFinished
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-surface border-border'
                  } ${isFlashing ? 'ring-4 ring-emerald-400 bg-emerald-500/20 scale-[1.01]' : ''}`}
                >
                  {/* Lane Number Badge */}
                  <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-sm ${
                        hasFinished
                          ? 'bg-emerald-500 text-white'
                          : isDq
                          ? 'bg-red-600 text-white'
                          : isNs
                          ? 'bg-slate-600 text-white'
                          : 'bg-background border border-border text-text-primary'
                      }`}
                    >
                      {lane}
                    </span>
                    <span className="text-[9px] uppercase font-bold text-text-secondary mt-0.5">Lane {lane}</span>
                  </div>

                  {/* Swimmer Details */}
                  <div className="col-span-10 sm:col-span-4 min-w-0">
                    <p className="font-bold text-sm sm:text-base text-text-primary uppercase truncate">
                      {entry.swimmer.name}
                    </p>
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
                      id={`ns-btn-${lane}`}
                      onClick={() => handleToggleNs(entry.swimmer.id)}
                      className={`px-2 py-1.5 rounded text-xs font-bold transition-colors ${
                        isNs ? 'bg-slate-500 text-white' : 'bg-slate-800/60 hover:bg-slate-700 text-slate-300'
                      }`}
                      title="Tandai Tidak Hadir (No Show)"
                    >
                      NS
                    </button>

                    <button
                      type="button"
                      id={`dq-btn-${lane}`}
                      onClick={() => handleToggleDq(entry.swimmer.id, lane)}
                      className={`px-2 py-1.5 rounded text-xs font-bold transition-colors ${
                        isDq ? 'bg-red-600 text-white ring-2 ring-red-400' : 'bg-amber-900/60 hover:bg-amber-800 text-amber-300'
                      }`}
                      title="Diskualifikasi perenang (Kirim sinyal DQ ke ESP32)"
                    >
                      DQ
                    </button>

                    <button
                      type="button"
                      id={`tap-btn-${lane}`}
                      onClick={() => handleTapLane(entry.swimmer.id)}
                      disabled={isDisabled}
                      className="h-9 px-3 rounded-lg flex items-center justify-center bg-primary hover:bg-primary-hover text-white disabled:bg-secondary disabled:cursor-not-allowed transition-all font-bold text-xs shadow"
                      aria-label={`Tap to record time for lane ${lane}`}
                      title="Catat Waktu Manual (Backup Touchpad)"
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
              Simpan catatan waktu seri ini ke basis data sebelum berpindah ke seri berikutnya.
            </p>

            <Button
              id="live-timing-save-results-btn"
              onClick={handleSaveResults}
              disabled={isSaving}
              className="w-full sm:w-auto px-8 py-3 text-base font-bold"
            >
              {isSaving ? <Spinner /> : 'Simpan Hasil Seri Ini'}
            </Button>
          </div>
        </>
      ) : (
        <Card className="mt-6 text-center py-12 text-text-secondary">
          <p className="text-lg font-semibold">Tidak ada atlet terdaftar untuk nomor lomba ini.</p>
          <p className="text-sm mt-1">Daftarkan peserta terlebih dahulu melalui menu Unggah Peserta atau Daftar Atlet.</p>
        </Card>
      )}

      {/* Modal: Remap Backup Pin on ESP32 */}
      {isMapModalOpen && (
        <Modal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          title="Konfigurasi Pin Cadangan ESP32 (Emergency Remap)"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              Jika tombol touchpad atau kabel sensor pada salah satu lintasan fisik mengalami kerusakan di tengah lomba, Anda dapat memetakan lintasan tersebut ke tombol cadangan tanpa mengubah firmware.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                  Lintasan Logis (Race)
                </label>
                <select
                  value={mapLogicalLane}
                  onChange={e => setMapLogicalLane(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-primary"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>
                      Lintasan {num}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                  Diarahkan ke Tombol Fisik
                </label>
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
              <code className="font-mono text-text-primary">
                MAP:{mapLogicalLane - 1}:{mapPhysicalPin - 1}
              </code>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="secondary" onClick={() => setIsMapModalOpen(false)}>
                Batal
              </Button>
              <Button variant="primary" onClick={handleSendPinMap}>
                Kirim Mapping ke ESP32
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
