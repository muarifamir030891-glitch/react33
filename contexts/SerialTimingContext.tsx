import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Heat } from '../types';
import { parseMsToTimeParts, formatTime } from '../constants';
import { useNotification } from '../components/ui/NotificationManager';

export type ArduinoStatus = 'connected' | 'disconnected' | 'error' | 'unavailable';

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'tx' | 'rx' | 'sys' | 'err';
}

interface SerialTimingContextType {
  // Connection State
  arduinoStatus: ArduinoStatus;
  isSerialConnected: boolean;
  selectedBaudRate: number;
  setSelectedBaudRate: (baud: number) => void;
  activeLanesSetting: number;
  setActiveLanesSetting: (lanes: number) => void;
  connectSerial: () => Promise<void>;
  disconnectSerial: () => Promise<void>;
  forceResetPort: () => Promise<void>;
  sendSerialCommand: (cmd: string) => Promise<void>;
  
  // Logs
  serialLogs: SerialLogEntry[];
  appendLog: (text: string, type: 'tx' | 'rx' | 'sys' | 'err') => void;
  clearLogs: () => void;

  // Stopwatch
  stopwatchTime: number;
  isStopwatchRunning: boolean;
  handleStartStop: () => void;
  handleReset: (clearCurrentHeatTimes?: boolean) => void;
  handleForceEndRace: () => void;

  // Active Context for Live Timing
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
  activeHeatIndex: number;
  setActiveHeatIndex: (index: number | ((prev: number) => number)) => void;
  activeHeats: Heat[];
  setActiveHeats: (heats: Heat[]) => void;
  times: Record<string, { min: string, sec: string, ms: string }>;
  setTimes: React.Dispatch<React.SetStateAction<Record<string, { min: string, sec: string, ms: string }>>>;
  dqSwimmers: Set<string>;
  setDqSwimmers: React.Dispatch<React.SetStateAction<Set<string>>>;
  nsSwimmers: Set<string>;
  setNsSwimmers: React.Dispatch<React.SetStateAction<Set<string>>>;
  flashingLane: string | null;
  setFlashingLane: (lane: string | null) => void;
  handleTapLane: (swimmerId: string) => void;
  handleToggleDq: (swimmerId: string, laneNumber: number) => void;
  handleToggleNs: (swimmerId: string) => void;
  handleTimeChange: (swimmerId: string, part: 'min' | 'sec' | 'ms', value: string) => void;
  goToHeat: (newIndex: number) => void;
}

const SerialTimingContext = createContext<SerialTimingContextType | undefined>(undefined);

export const SerialTimingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addNotification } = useNotification();

  // Arduino Status
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>(() => {
    return typeof navigator !== 'undefined' && "serial" in navigator ? 'disconnected' : 'unavailable';
  });
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [selectedBaudRate, setSelectedBaudRate] = useState<number>(115200);
  const [activeLanesSetting, setActiveLanesSetting] = useState<number>(8);

  // Serial references
  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isReadingRef = useRef<boolean>(false);
  const keepReadingRef = useRef<boolean>(false);

  // Serial Logs
  const [serialLogs, setSerialLogs] = useState<SerialLogEntry[]>([]);

  // Stopwatch state
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const animationFrameId = useRef<number | undefined>(undefined);
  const startTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);

  // Active Timing State (Preserved across views)
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeHeatIndex, setActiveHeatIndex] = useState(0);
  const [activeHeats, setActiveHeats] = useState<Heat[]>([]);
  const [times, setTimes] = useState<Record<string, { min: string, sec: string, ms: string }>>({});
  const [dqSwimmers, setDqSwimmers] = useState<Set<string>>(new Set());
  const [nsSwimmers, setNsSwimmers] = useState<Set<string>>(new Set());
  const [flashingLane, setFlashingLane] = useState<string | null>(null);

  // Synchronized refs for real-time serial listener callbacks
  const isStopwatchRunningRef = useRef(isStopwatchRunning);
  const stopwatchTimeRef = useRef(stopwatchTime);
  const activeHeatsRef = useRef(activeHeats);
  const activeHeatIndexRef = useRef(activeHeatIndex);
  const currentHeatRef = useRef<Heat | null>(null);
  const timesRef = useRef(times);
  const dqSwimmersRef = useRef(dqSwimmers);

  useEffect(() => {
    isStopwatchRunningRef.current = isStopwatchRunning;
    stopwatchTimeRef.current = stopwatchTime;
    activeHeatsRef.current = activeHeats;
    activeHeatIndexRef.current = activeHeatIndex;
    currentHeatRef.current = activeHeats[activeHeatIndex] || null;
    timesRef.current = times;
    dqSwimmersRef.current = dqSwimmers;
  }, [isStopwatchRunning, stopwatchTime, activeHeats, activeHeatIndex, times, dqSwimmers]);

  const appendLog = useCallback((text: string, type: 'tx' | 'rx' | 'sys' | 'err') => {
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
    const entry: SerialLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timeStr,
      text,
      type
    };
    setSerialLogs(prev => [...prev.slice(-150), entry]);
  }, []);

  const clearLogs = useCallback(() => {
    setSerialLogs([]);
  }, []);

  // Continuous Stopwatch RAF Loop (Persists across view changes)
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
        animationFrameId.current = undefined;
      }
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isStopwatchRunning]);

  // Send Command to ESP32
  const sendSerialCommand = useCallback(async (command: string) => {
    if (!portRef.current || !portRef.current.writable) {
      return;
    }
    let writer: any = null;
    try {
      const textEncoder = new TextEncoder();
      writer = portRef.current.writable.getWriter();
      await writer.write(textEncoder.encode(command + "\n"));
      appendLog(`TX -> ${command}`, 'tx');
    } catch (err: any) {
      console.error("Gagal mengirim data serial ke ESP32:", err);
      appendLog(`ERR TX [${command}]: ${err.message}`, 'err');
      addNotification(`Gagal mengirim ke ESP32: ${err.message}`, "error");
    } finally {
      if (writer) {
        try {
          writer.releaseLock();
        } catch (e) {}
      }
    }
  }, [appendLog, addNotification]);

  // Handle Lane Tap Manually
  const handleTapLane = useCallback((swimmerId: string) => {
    const captureTime = isStopwatchRunningRef.current
      ? (performance.now() - startTimeRef.current + pausedTimeRef.current)
      : stopwatchTimeRef.current;

    if (captureTime > 0) {
      setTimes(prev => {
        const existing = prev[swimmerId];
        const existingMs = (parseInt(existing?.min || '0') * 60000) + (parseInt(existing?.sec || '0') * 1000) + parseInt(existing?.ms || '0');
        if (existingMs > 0) return prev;

        return {
          ...prev,
          [swimmerId]: parseMsToTimeParts(captureTime)
        };
      });
    }

    setFlashingLane(swimmerId);
    setTimeout(() => setFlashingLane(null), 1500);
  }, []);

  // Process data from ESP32
  const processSerialData = useCallback((data: string) => {
    const trimmed = data.trim();

    // 1. Start Signal ("S" or "GO")
    if (trimmed === "S" || trimmed === "GO" || trimmed.startsWith("GO")) {
      setStopwatchTime(0);
      pausedTimeRef.current = 0;
      startTimeRef.current = performance.now();
      setIsStopwatchRunning(true);
      isStopwatchRunningRef.current = true;
      addNotification("🚦 Sinyal Start (GO) diterima dari ESP32!", "success", 2500);
      return;
    }

    // 2. Reset Signal ("R" or "READY" or "R_ACK")
    if (trimmed === "R" || trimmed === "READY" || trimmed === "R_ACK") {
      setIsStopwatchRunning(false);
      isStopwatchRunningRef.current = false;
      setStopwatchTime(0);
      pausedTimeRef.current = 0;
      startTimeRef.current = 0;
      if (trimmed !== "R_ACK") {
        addNotification("🔄 Sistem Reset diterima dari ESP32.", "info", 2000);
      }
      return;
    }

    // 3. Lane Finish Signal: "LANE:<laneNumber>:<timeMs>"
    if (trimmed.startsWith("LANE:")) {
      const parts = trimmed.split(":");
      if (parts.length >= 3) {
        const laneNumber = parseInt(parts[1], 10);
        const timeMs = parseInt(parts[2], 10);

        if (!isNaN(laneNumber) && !isNaN(timeMs)) {
          const currentHeat = currentHeatRef.current;
          if (currentHeat) {
            const assignment = currentHeat.assignments.find(a => a.lane === laneNumber);
            if (assignment) {
              const swimmerId = assignment.entry.swimmer.id;
              const timeParts = parseMsToTimeParts(timeMs);

              setTimes(prev => ({
                ...prev,
                [swimmerId]: timeParts
              }));

              setFlashingLane(swimmerId);
              setTimeout(() => setFlashingLane(null), 2000);

              addNotification(
                `🏁 Lintasan ${laneNumber} (${assignment.entry.swimmer.name}) Touchpad: ${formatTime(timeMs)}`,
                "success",
                4000
              );
            }
          }
        }
      }
      return;
    }

    // 4. Disqualification confirmation: "DQ_OK:<lane>"
    if (trimmed.startsWith("DQ_OK:")) {
      const laneNum = parseInt(trimmed.substring(6), 10);
      const currentHeat = currentHeatRef.current;
      if (currentHeat) {
        const ass = currentHeat.assignments.find(a => a.lane === laneNum);
        if (ass) {
          setDqSwimmers(prev => new Set(prev).add(ass.entry.swimmer.id));
        }
      }
      addNotification(`⚠️ Lintasan ${laneNum} didiskualifikasi (DQ) pada ESP32.`, "warning", 3000);
      return;
    }

    // 5. Race completed / closed: "RACE_COMPLETE", "END_ACK", "RACE_TIMEOUT"
    if (trimmed === "RACE_COMPLETE" || trimmed === "END_ACK" || trimmed === "RACE_TIMEOUT") {
      setIsStopwatchRunning(false);
      isStopwatchRunningRef.current = false;
      if (trimmed === "RACE_TIMEOUT") {
        addNotification("⏱️ Race Auto-Timeout (10 Menit) tercapai di ESP32.", "warning", 4000);
      } else {
        addNotification("🏁 Perlombaan seri ini telah selesai di ESP32. Silakan simpan hasil!", "info", 4000);
      }
      return;
    }

    // 6. Active lanes set response: "SET_LANES_OK:<lanes>"
    if (trimmed.startsWith("SET_LANES_OK:")) {
      const count = parseInt(trimmed.substring(13), 10);
      setActiveLanesSetting(count);
      addNotification(`Konfigurasi ${count} Lintasan Aktif dikonfirmasi ESP32.`, "info", 2000);
      return;
    }

    // 7. Port Mapping response: "MAP_OK:<logical>:<physical>"
    if (trimmed.startsWith("MAP_OK:")) {
      const parts = trimmed.split(":");
      const logicalLane = parseInt(parts[1], 10) + 1;
      const physicalPin = parseInt(parts[2], 10) + 1;
      addNotification(`🔀 Mapping Tombol Berhasil: Lintasan ${logicalLane} diarahkan ke Tombol Fisik ${physicalPin}.`, "success", 4000);
      return;
    }

    // 8. Backward compatibility with single digit lane finish: "1" to "10"
    const singleLane = parseInt(trimmed, 10);
    if (!isNaN(singleLane) && singleLane > 0 && singleLane <= 10) {
      const currentHeat = currentHeatRef.current;
      if (currentHeat) {
        const assignment = currentHeat.assignments.find(a => a.lane === singleLane);
        if (assignment) {
          handleTapLane(assignment.entry.swimmer.id);
        }
      }
    }
  }, [addNotification, handleTapLane]);

  // Disconnect Serial
  const disconnectSerial = useCallback(async () => {
    keepReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (error) {
        console.warn("Error cancelling reader:", error);
      }
    }

    let waitCount = 0;
    while (isReadingRef.current && waitCount < 10) {
      await new Promise(resolve => setTimeout(resolve, 50));
      waitCount++;
    }

    if (portRef.current) {
      try {
        if (portRef.current.readable || portRef.current.writable) {
          await portRef.current.close();
        }
      } catch (error) {
        console.warn("Error closing port:", error);
      }
    }

    setIsSerialConnected(false);
    setArduinoStatus('disconnected');
    appendLog("Sistem Serial ESP32 Terputus.", "sys");
    addNotification("ESP32 terputus.", "info");
  }, [appendLog, addNotification]);

  // Force Reset Port
  const forceResetPort = useCallback(async () => {
    keepReadingRef.current = false;
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (e) {}
      try {
        readerRef.current.releaseLock();
      } catch (e) {}
      readerRef.current = null;
    }
    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (e) {}
      portRef.current = null;
    }
    setIsSerialConnected(false);
    setArduinoStatus('disconnected');
    appendLog("Port Serial di-reset & dilepaskan paksa.", "sys");
    addNotification("Port USB berhasil di-reset. Silakan hubungkan kembali.", "info");
  }, [appendLog, addNotification]);

  // Connect Serial
  const connectSerial = useCallback(async () => {
    if (!("serial" in navigator)) {
      addNotification("Browser ini tidak mendukung Web Serial API. Gunakan Chrome / Edge desktop.", "error");
      setArduinoStatus('unavailable');
      return;
    }

    if (isSerialConnected) {
      await disconnectSerial();
      return;
    }

    try {
      let port = portRef.current;
      if (!port) {
        port = await (navigator as any).serial.requestPort();
        portRef.current = port;
      }

      const isAlreadyOpen = Boolean(port.readable || port.writable);
      if (!isAlreadyOpen) {
        try {
          await port.open({ baudRate: selectedBaudRate });
        } catch (openErr: any) {
          if (openErr.name === 'InvalidStateError' || openErr.message?.includes('already open')) {
            console.warn("Port already open, reusing.");
          } else {
            throw openErr;
          }
        }
      }

      setIsSerialConnected(true);
      setArduinoStatus('connected');
      keepReadingRef.current = true;
      isReadingRef.current = true;
      appendLog(`ESP32 Terhubung pada Baud Rate ${selectedBaudRate} bps. Menunggu sinyal...`, 'sys');
      addNotification(`ESP32 terhubung (${selectedBaudRate} baud). Sistem aktif di seluruh halaman!`, "success");

      setTimeout(() => {
        sendSerialCommand(`LANES:${activeLanesSetting}`);
      }, 300);

      const decoder = new TextDecoder();
      let buffer = "";

      while (keepReadingRef.current && portRef.current && portRef.current.readable) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        try {
          reader = portRef.current.readable.getReader();
          readerRef.current = reader;

          while (keepReadingRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.length > 0) {
                  appendLog(`RX <- ${cleanLine}`, 'rx');
                  processSerialData(cleanLine);
                }
              }
            }
          }
        } catch (readErr: any) {
          if (keepReadingRef.current) {
            console.warn("Serial read error:", readErr);
          }
          break;
        } finally {
          if (reader) {
            try {
              reader.releaseLock();
            } catch (e) {}
          }
          readerRef.current = null;
        }
      }
    } catch (error: any) {
      console.error("Serial connection error:", error);
      if (error.name !== 'NotFoundError') {
        appendLog(`ERR: ${error.message}`, 'err');
        addNotification(`Gagal terhubung ke ESP32: ${error.message}`, "error");
        setArduinoStatus('error');
      }
      setIsSerialConnected(false);
    } finally {
      isReadingRef.current = false;
    }
  }, [isSerialConnected, selectedBaudRate, activeLanesSetting, disconnectSerial, appendLog, addNotification, sendSerialCommand, processSerialData]);

  // Start / Stop Stopwatch
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
        sendSerialCommand("S");
      }
      startTimeRef.current = performance.now();
      setIsStopwatchRunning(true);
      isStopwatchRunningRef.current = true;
    }
  }, [isSerialConnected, sendSerialCommand]);

  // Reset Stopwatch
  const handleReset = useCallback((clearCurrentHeatTimes: boolean = false) => {
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
      sendSerialCommand("R");
    }

    addNotification("🔄 Stopwatch dan catatan waktu seri di-reset.", "info", 2000);
  }, [isSerialConnected, sendSerialCommand, addNotification]);

  const handleForceEndRace = useCallback(() => {
    if (isSerialConnected) {
      sendSerialCommand("END");
    } else {
      setIsStopwatchRunning(false);
      isStopwatchRunningRef.current = false;
    }
    addNotification("Perintah penutupan lomba (END) dikirim.", "info");
  }, [isSerialConnected, sendSerialCommand, addNotification]);

  const handleToggleDq = useCallback((swimmerId: string, laneNumber: number) => {
    setDqSwimmers(prev => {
      const next = new Set(prev);
      if (next.has(swimmerId)) {
        next.delete(swimmerId);
      } else {
        next.add(swimmerId);
        if (isSerialConnected) {
          sendSerialCommand(`DQ:${laneNumber}`);
        }
      }
      return next;
    });
    setNsSwimmers(prev => {
      const next = new Set(prev);
      next.delete(swimmerId);
      return next;
    });
  }, [isSerialConnected, sendSerialCommand]);

  const handleToggleNs = useCallback((swimmerId: string) => {
    setNsSwimmers(prev => {
      const next = new Set(prev);
      if (next.has(swimmerId)) {
        next.delete(swimmerId);
      } else {
        next.add(swimmerId);
      }
      return next;
    });
    setDqSwimmers(prev => {
      const next = new Set(prev);
      next.delete(swimmerId);
      return next;
    });
  }, []);

  const handleTimeChange = useCallback((swimmerId: string, part: 'min' | 'sec' | 'ms', value: string) => {
    setTimes(prev => ({
      ...prev,
      [swimmerId]: { ...prev[swimmerId], [part]: value }
    }));
  }, []);

  const goToHeat = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= activeHeatsRef.current.length) return;

    // 1. Stop and reset stopwatch animation
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

    // 2. Switch heat index
    setActiveHeatIndex(newIndex);
    activeHeatIndexRef.current = newIndex;
    const targetHeat = activeHeatsRef.current[newIndex];
    currentHeatRef.current = targetHeat || null;

    // 3. Reset hardware timer on ESP32
    if (isSerialConnected) {
      sendSerialCommand("R");
    }

    if (targetHeat) {
      addNotification(`Switched ke Seri ${targetHeat.heatNumber}. Timer & ESP32 otomatis di-reset ke 00:00.00.`, "info", 2500);
    }
  }, [isSerialConnected, sendSerialCommand, addNotification]);

  return (
    <SerialTimingContext.Provider
      value={{
        arduinoStatus,
        isSerialConnected,
        selectedBaudRate,
        setSelectedBaudRate,
        activeLanesSetting,
        setActiveLanesSetting,
        connectSerial,
        disconnectSerial,
        forceResetPort,
        sendSerialCommand,
        serialLogs,
        appendLog,
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
        setDqSwimmers,
        nsSwimmers,
        setNsSwimmers,
        flashingLane,
        setFlashingLane,
        handleTapLane,
        handleToggleDq,
        handleToggleNs,
        handleTimeChange,
        goToHeat
      }}
    >
      {children}
    </SerialTimingContext.Provider>
  );
};

export const useSerialTiming = (): SerialTimingContextType => {
  const context = useContext(SerialTimingContext);
  if (!context) {
    throw new Error('useSerialTiming must be used within a SerialTimingProvider');
  }
  return context;
};
