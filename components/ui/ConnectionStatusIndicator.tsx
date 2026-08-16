import React from 'react';
import { useEsp32, ArduinoStatus as Esp32ArduinoStatus } from '../../contexts/Esp32Context';

type InternetStatus = 'online' | 'offline';
type DbStatus = 'checking' | 'connected' | 'error' | 'offline' | 'reconnecting';
export type ArduinoStatus = Esp32ArduinoStatus;

interface ConnectionStatusIndicatorProps {
  internetStatus: InternetStatus;
  dbStatus: DbStatus;
  arduinoStatus?: ArduinoStatus;
  onOpenEsp32?: () => void;
}

const internetStatusConfig: Record<InternetStatus, { color: string; text: string }> = {
  online: { color: 'bg-green-500', text: 'Online' },
  offline: { color: 'bg-gray-400', text: 'Offline' },
};

const dbStatusConfig: Record<DbStatus, { color: string; text: string }> = {
  checking: { color: 'bg-yellow-400', text: 'Mengecek...' },
  connected: { color: 'bg-green-500', text: 'Terhubung' },
  error: { color: 'bg-red-500', text: 'Gagal' },
  offline: { color: 'bg-gray-400', text: 'Offline' },
  reconnecting: { color: 'bg-yellow-400', text: 'Menyambung...' },
};

const arduinoStatusConfig: Record<ArduinoStatus, { color: string; text: string }> = {
  connected: { color: 'bg-green-500', text: 'Terhubung' },
  disconnected: { color: 'bg-gray-400', text: 'Terputus' },
  error: { color: 'bg-red-500', text: 'Gagal' },
  unavailable: { color: 'bg-yellow-400', text: 'N/A' },
};

const Dot: React.FC<{ color: string; pulse: boolean }> = ({ color, pulse }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`} />
);

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  internetStatus,
  dbStatus,
  arduinoStatus: propArduinoStatus,
  onOpenEsp32,
}) => {
  const { status: contextArduinoStatus } = useEsp32();
  const currentArduinoStatus = propArduinoStatus || contextArduinoStatus;

  const internetConfig = internetStatusConfig[internetStatus];
  const dbConfig = dbStatusConfig[dbStatus];
  const arduinoConfig = arduinoStatusConfig[currentArduinoStatus];

  return (
    <div
      className="text-xs text-text-secondary px-3 py-2 bg-background rounded-md space-y-1.5 border border-border/40"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">Internet</span>
        <div className="flex items-center space-x-2">
          <Dot color={internetConfig.color} pulse={false} />
          <span>{internetConfig.text}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-medium">Database</span>
        <div className="flex items-center space-x-2">
          <Dot color={dbConfig.color} pulse={dbStatus === 'checking' || dbStatus === 'reconnecting'} />
          <span>{dbConfig.text}</span>
        </div>
      </div>
      <div
        className={`flex items-center justify-between ${onOpenEsp32 ? 'cursor-pointer hover:text-text-primary transition-colors' : ''}`}
        onClick={onOpenEsp32}
        title={onOpenEsp32 ? 'Klik untuk membuka menu ESP32' : undefined}
      >
        <span className="font-medium flex items-center gap-1">
          <span>ESP32 USB</span>
          {currentArduinoStatus === 'connected' && <span className="text-[10px] text-green-500 font-bold">●</span>}
        </span>
        <div className="flex items-center space-x-2">
          <Dot color={arduinoConfig.color} pulse={currentArduinoStatus === 'connected'} />
          <span className={currentArduinoStatus === 'connected' ? 'font-bold text-green-500' : ''}>
            {arduinoConfig.text}
          </span>
        </div>
      </div>
    </div>
  );
};
