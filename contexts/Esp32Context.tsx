import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

export type ArduinoStatus = 'connected' | 'disconnected' | 'error' | 'unavailable';

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'tx' | 'rx' | 'sys' | 'err' | 'data';
}

export type ParsedSerialEvent =
  | { type: 'START'; raw: string }
  | { type: 'RESET'; raw: string }
  | { type: 'LANE_FINISH'; lane: number; timeMs: number; raw: string }
  | { type: 'LANE_TAP'; lane: number; raw: string }
  | { type: 'DQ_CONFIRMED'; lane: number; raw: string }
  | { type: 'LANES_SET'; lanes: number; raw: string }
  | { type: 'MAP_CONFIRMED'; logicalLane: number; physicalPin: number; raw: string }
  | { type: 'RACE_COMPLETE'; reason?: string; raw: string }
  | { type: 'RAW'; text: string };

type SerialListener = (event: ParsedSerialEvent) => void;

interface Esp32ContextType {
  status: ArduinoStatus;
  isSupported: boolean;
  isConnected: boolean;
  baudRate: number;
  activeLanes: number;
  logs: SerialLogEntry[];
  lastEvent: ParsedSerialEvent | null;
  setBaudRate: (baud: number) => void;
  setActiveLanes: (lanes: number) => Promise<boolean>;
  connect: (customBaud?: number) => Promise<boolean>;
  disconnect: () => Promise<void>;
  forceReset: () => Promise<void>;
  sendCommand: (command: string) => Promise<boolean>;
  mapPin: (logicalLane: number, physicalPin: number) => Promise<boolean>;
  clearLogs: () => void;
  subscribe: (listener: SerialListener) => () => void;
  simulateIncomingData: (line: string) => void;
}

const Esp32Context = createContext<Esp32ContextType | undefined>(undefined);

export const BAUD_RATE_OPTIONS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

export const Esp32Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [status, setStatus] = useState<ArduinoStatus>('disconnected');
  const [baudRate, setBaudRateState] = useState<number>(115200);
  const [activeLanes, setActiveLanesState] = useState<number>(8);
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);
  const [lastEvent, setLastEvent] = useState<ParsedSerialEvent | null>(null);

  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isReadingRef = useRef<boolean>(false);
  const keepReadingRef = useRef<boolean>(false);
  const listenersRef = useRef<Set<SerialListener>>(new Set());

  // Check Web Serial API support
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      setIsSupported(true);
      setStatus(prev => (prev === 'unavailable' ? 'disconnected' : prev));
    } else {
      setIsSupported(false);
      setStatus('unavailable');
    }
  }, []);

  const appendLog = useCallback((text: string, type: 'tx' | 'rx' | 'sys' | 'err' | 'data') => {
    const now = new Date();
    const timeStr =
      now.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0');

    const entry: SerialLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timeStr,
      text,
      type,
    };

    setLogs(prev => [...prev.slice(-200), entry]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const subscribe = useCallback((listener: SerialListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const dispatchEvent = useCallback((event: ParsedSerialEvent) => {
    setLastEvent(event);
    listenersRef.current.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in serial listener:', err);
      }
    });
  }, []);

  const parseAndDispatchData = useCallback(
    (rawData: string) => {
      const trimmed = rawData.trim();
      if (!trimmed) return;

      appendLog(`RX <- ${trimmed}`, 'rx');

      // 1. Start Signal ("S", "GO", "START")
      if (trimmed === 'S' || trimmed === 'GO' || trimmed.startsWith('GO') || trimmed === 'START') {
        dispatchEvent({ type: 'START', raw: trimmed });
        return;
      }

      // 2. Reset Signal ("R", "READY", "R_ACK", "RESET")
      if (trimmed === 'R' || trimmed === 'READY' || trimmed === 'R_ACK' || trimmed === 'RESET') {
        dispatchEvent({ type: 'RESET', raw: trimmed });
        return;
      }

      // 3. Lane Finish Signal: "LANE:<laneNumber>:<timeMs>" e.g., "LANE:1:25430"
      if (trimmed.startsWith('LANE:')) {
        const parts = trimmed.split(':');
        if (parts.length >= 3) {
          const laneNumber = parseInt(parts[1], 10);
          const timeMs = parseInt(parts[2], 10);
          if (!isNaN(laneNumber) && !isNaN(timeMs)) {
            dispatchEvent({ type: 'LANE_FINISH', lane: laneNumber, timeMs, raw: trimmed });
            return;
          }
        }
      }

      // 4. Disqualification confirmation: "DQ_OK:<lane>"
      if (trimmed.startsWith('DQ_OK:')) {
        const laneNum = parseInt(trimmed.substring(6), 10);
        if (!isNaN(laneNum)) {
          dispatchEvent({ type: 'DQ_CONFIRMED', lane: laneNum, raw: trimmed });
          return;
        }
      }

      // 5. Active lanes set response: "SET_LANES_OK:<lanes>"
      if (trimmed.startsWith('SET_LANES_OK:')) {
        const count = parseInt(trimmed.substring(13), 10);
        if (!isNaN(count)) {
          setActiveLanesState(count);
          dispatchEvent({ type: 'LANES_SET', lanes: count, raw: trimmed });
          return;
        }
      }

      // 6. Port Mapping response: "MAP_OK:<logical>:<physical>"
      if (trimmed.startsWith('MAP_OK:')) {
        const parts = trimmed.split(':');
        const logicalLane = parseInt(parts[1], 10) + 1;
        const physicalPin = parseInt(parts[2], 10) + 1;
        dispatchEvent({ type: 'MAP_CONFIRMED', logicalLane, physicalPin, raw: trimmed });
        return;
      }

      // 7. Race completed / closed
      if (trimmed === 'RACE_COMPLETE' || trimmed === 'END_ACK' || trimmed === 'RACE_TIMEOUT') {
        dispatchEvent({ type: 'RACE_COMPLETE', reason: trimmed, raw: trimmed });
        return;
      }

      // 8. Backward compatibility with single digit lane finish: "1" to "10"
      const singleLane = parseInt(trimmed, 10);
      if (!isNaN(singleLane) && singleLane >= 1 && singleLane <= 10 && trimmed.length <= 2) {
        dispatchEvent({ type: 'LANE_TAP', lane: singleLane, raw: trimmed });
        return;
      }

      // Fallback
      dispatchEvent({ type: 'RAW', text: trimmed });
    },
    [appendLog, dispatchEvent]
  );

  const simulateIncomingData = useCallback(
    (line: string) => {
      appendLog(`[SIMULASI] ${line}`, 'data');
      parseAndDispatchData(line);
    },
    [appendLog, parseAndDispatchData]
  );

  const sendCommand = useCallback(
    async (command: string): Promise<boolean> => {
      if (!portRef.current || !portRef.current.writable) {
        appendLog(`ERR TX [${command}]: ESP32 belum terhubung via USB.`, 'err');
        return false;
      }

      let writer: any = null;
      try {
        const textEncoder = new TextEncoder();
        writer = portRef.current.writable.getWriter();
        await writer.write(textEncoder.encode(command + '\n'));
        appendLog(`TX -> ${command}`, 'tx');
        return true;
      } catch (err: any) {
        console.error('Gagal mengirim data serial ke ESP32:', err);
        appendLog(`ERR TX [${command}]: ${err.message}`, 'err');
        return false;
      } finally {
        if (writer) {
          try {
            writer.releaseLock();
          } catch {
            // Ignored
          }
        }
      }
    },
    [appendLog]
  );

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (error) {
        console.warn('Error cancelling reader:', error);
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
        console.warn('Error closing port:', error);
      }
      portRef.current = null;
    }

    setStatus('disconnected');
    appendLog('Sistem Serial ESP32 Terputus.', 'sys');
  }, [appendLog]);

  const forceReset = useCallback(async () => {
    keepReadingRef.current = false;
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch {}
      try {
        readerRef.current.releaseLock();
      } catch {}
      readerRef.current = null;
    }
    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch {}
      portRef.current = null;
    }
    setStatus('disconnected');
    appendLog('Port Serial di-reset & dilepaskan paksa.', 'sys');
  }, [appendLog]);

  const connect = useCallback(
    async (customBaud?: number): Promise<boolean> => {
      const selectedBaud = customBaud || baudRate;

      if (typeof navigator === 'undefined' || !('serial' in navigator)) {
        setStatus('unavailable');
        appendLog('Web Serial API tidak didukung pada browser ini. Harap gunakan Google Chrome atau Edge.', 'err');
        return false;
      }

      // If already connected, do not re-request port
      if (status === 'connected' && portRef.current && portRef.current.readable) {
        appendLog(`ESP32 sudah dalam keadaan terhubung (${selectedBaud} baud).`, 'sys');
        return true;
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
            await port.open({ baudRate: selectedBaud });
          } catch (openErr: any) {
            if (openErr.name === 'InvalidStateError' || openErr.message?.includes('already open')) {
              console.warn('Port is already open in browser, reusing connection.');
            } else {
              throw openErr;
            }
          }
        }

        setStatus('connected');
        keepReadingRef.current = true;
        isReadingRef.current = true;
        appendLog(`ESP32 Terhubung pada Baud Rate ${selectedBaud} bps. Menunggu sinyal hardware...`, 'sys');

        // Send initial sync
        setTimeout(() => {
          sendCommand(`LANES:${activeLanes}`);
        }, 300);

        // Start background reading stream
        (async () => {
          const decoder = new TextDecoder();
          let buffer = '';

          while (keepReadingRef.current && portRef.current && portRef.current.readable) {
            let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
            try {
              reader = portRef.current.readable.getReader();
              readerRef.current = reader;

              while (keepReadingRef.current) {
                const { value, done } = await reader.read();
                if (done) {
                  break;
                }
                if (value) {
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    parseAndDispatchData(line);
                  }
                }
              }
            } catch (readErr: any) {
              if (keepReadingRef.current) {
                console.warn('Serial read loop exception:', readErr);
              }
              break;
            } finally {
              if (reader) {
                try {
                  reader.releaseLock();
                } catch {
                  // Ignored
                }
              }
              readerRef.current = null;
            }
          }
          isReadingRef.current = false;
        })();

        return true;
      } catch (error: any) {
        console.error('Serial connection error:', error);
        if (error.name !== 'NotFoundError') {
          appendLog(`Gagal terhubung ke ESP32: ${error.message}`, 'err');
          setStatus('error');
        }
        return false;
      }
    },
    [baudRate, status, activeLanes, appendLog, sendCommand, parseAndDispatchData]
  );

  const setBaudRate = useCallback((baud: number) => {
    setBaudRateState(baud);
  }, []);

  const setActiveLanes = useCallback(
    async (lanes: number): Promise<boolean> => {
      setActiveLanesState(lanes);
      if (status === 'connected') {
        return await sendCommand(`LANES:${lanes}`);
      }
      return true;
    },
    [status, sendCommand]
  );

  const mapPin = useCallback(
    async (logicalLane: number, physicalPin: number): Promise<boolean> => {
      // Hardware uses 0-indexed values
      const cmd = `MAP:${logicalLane - 1}:${physicalPin - 1}`;
      return await sendCommand(cmd);
    },
    [sendCommand]
  );

  return (
    <Esp32Context.Provider
      value={{
        status,
        isSupported,
        isConnected: status === 'connected',
        baudRate,
        activeLanes,
        logs,
        lastEvent,
        setBaudRate,
        setActiveLanes,
        connect,
        disconnect,
        forceReset,
        sendCommand,
        mapPin,
        clearLogs,
        subscribe,
        simulateIncomingData,
      }}
    >
      {children}
    </Esp32Context.Provider>
  );
};

export const useEsp32 = (): Esp32ContextType => {
  const context = useContext(Esp32Context);
  if (!context) {
    throw new Error('useEsp32 must be used within an Esp32Provider');
  }
  return context;
};
