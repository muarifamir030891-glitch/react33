import React, { useState, useRef, useEffect } from 'react';
import { useEsp32, BAUD_RATE_OPTIONS } from '../contexts/Esp32Context';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Modal } from './ui/Modal';
import { useNotification } from './ui/NotificationManager';
import { View } from '../types';

interface Esp32ViewProps {
  onNavigateToTiming?: () => void;
  navigateTo?: (view: View) => void;
}

const UsbIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
);

const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const CogIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

export const Esp32View: React.FC<Esp32ViewProps> = ({ onNavigateToTiming, navigateTo }) => {
  const {
    status,
    isSupported,
    isConnected,
    baudRate,
    activeLanes,
    logs,
    setBaudRate,
    setActiveLanes,
    connect,
    disconnect,
    forceReset,
    sendCommand,
    mapPin,
    clearLogs,
    simulateIncomingData,
  } = useEsp32();

  const { addNotification } = useNotification();
  const [customCommand, setCustomCommand] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapLogicalLane, setMapLogicalLane] = useState<number>(1);
  const [mapPhysicalPin, setMapPhysicalPin] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'control' | 'terminal' | 'guide'>('control');

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleConnectToggle = async () => {
    if (!isSupported) {
      addNotification('Web Serial API tidak didukung oleh browser ini. Gunakan Google Chrome atau MS Edge pada Desktop.', 'error');
      return;
    }

    setIsConnecting(true);
    try {
      if (isConnected) {
        await disconnect();
        addNotification('Koneksi ESP32 diputuskan.', 'info');
      } else {
        const success = await connect();
        if (success) {
          addNotification(`ESP32 Berhasil Terhubung pada ${baudRate} baud! Koneksi akan tetap aktif saat berpindah menu.`, 'success', 5000);
        } else if (status === 'error') {
          addNotification('Gagal menghubungkan ESP32. Periksa kabel USB dan driver CH340/CP2102.', 'error');
        }
      }
    } catch (err: any) {
      addNotification(`Terjadi kesalahan koneksi: ${err.message}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleForceReset = async () => {
    await forceReset();
    addNotification('Port USB telah di-reset dan dibebaskan paksa. Silakan klik Hubungkan kembali.', 'info');
  };

  const handleSendCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customCommand.trim()) return;

    if (!isConnected) {
      addNotification('ESP32 belum terhubung via USB.', 'warning');
      return;
    }

    const success = await sendCommand(customCommand.trim());
    if (success) {
      setCustomCommand('');
    }
  };

  const handleSetLanes = async (lanes: number) => {
    await setActiveLanes(lanes);
    addNotification(`Konfigurasi ${lanes} Lintasan Aktif dikirim ke ESP32.`, 'info');
  };

  const handleSavePinMapping = async () => {
    if (!isConnected) {
      addNotification('ESP32 belum terhubung.', 'warning');
      return;
    }
    const success = await mapPin(mapLogicalLane, mapPhysicalPin);
    if (success) {
      addNotification(`Perintah mapping dikirim: Lintasan ${mapLogicalLane} -> Pin Fisik ${mapPhysicalPin}`, 'success');
      setIsMapModalOpen(false);
    }
  };

  return (
    <div id="esp32-connection-view" className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface p-6 rounded-xl border border-border">
        <div className="flex items-center space-x-4">
          <div className={`p-3.5 rounded-xl ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-primary/10 text-primary'}`}>
            <UsbIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Koneksi & Hardware ESP32</h1>
            <p className="text-sm text-text-secondary">
              Sinkronisasi Web Serial Port USB satu kali untuk tombol start, stopwatch, dan touchpad sentuh lintasan.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-background border border-border text-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : isSupported ? 'bg-gray-400' : 'bg-red-500'}`} />
            <span className="font-medium">
              {isConnected ? `Terhubung (${baudRate} baud)` : isSupported ? 'Terputus' : 'Tidak Didukung'}
            </span>
          </div>

          {navigateTo && (
            <Button
              id="esp32-goto-races-btn"
              onClick={() => navigateTo(View.RACES)}
              variant="secondary"
              className="hidden sm:flex items-center space-x-1 text-xs"
            >
              <span>Lihat Lomba</span>
            </Button>
          )}
        </div>
      </div>

      {/* Global State Notice */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-xs sm:text-sm text-text-secondary flex items-start space-x-3">
        <span className="text-base text-primary">ℹ️</span>
        <div>
          <strong className="text-text-primary font-semibold">Koneksi Port USB Global:</strong> Begitu tombol <span className="text-primary font-medium">"Hubungkan ESP32"</span> ditekan dan port serial terbuka, koneksi akan tetap aktif di memori aplikasi secara global. Anda bebas berpindah ke menu <em>Nomor Lomba, Live Timing, Daftar Atlet,</em> atau menu lainnya tanpa perlu menghubungkan ulang port USB.
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-border pb-1">
        <button
          id="esp32-tab-control"
          onClick={() => setActiveTab('control')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'control' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          Kontrol & Pengujian
        </button>
        <button
          id="esp32-tab-terminal"
          onClick={() => setActiveTab('terminal')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center space-x-1.5 ${
            activeTab === 'terminal' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          <TerminalIcon />
          <span>Monitor Serial ({logs.length})</span>
        </button>
        <button
          id="esp32-tab-guide"
          onClick={() => setActiveTab('guide')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'guide' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          Panduan Skematik & Pinout
        </button>
      </div>

      {/* TAB 1: KONTROL & PENGUJIAN */}
      {activeTab === 'control' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Connection Card */}
          <Card title="Pengaturan Port USB Serial" className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  Baud Rate Serial
                </label>
                <Select
                  id="esp32-baudrate-select"
                  value={baudRate}
                  onChange={e => setBaudRate(Number(e.target.value))}
                  disabled={isConnected}
                  className="w-full"
                >
                  {BAUD_RATE_OPTIONS.map(baud => (
                    <option key={baud} value={baud}>
                      {baud} bps {baud === 115200 ? '(Rekomendasi ESP32)' : ''}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-text-secondary mt-1">Standar default ESP32 adalah 115200 bps.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  Jumlah Lintasan Aktif
                </label>
                <div className="flex space-x-2">
                  {[6, 8, 10].map(count => (
                    <button
                      key={count}
                      id={`esp32-lanes-${count}`}
                      onClick={() => handleSetLanes(count)}
                      className={`flex-1 py-2 text-xs font-bold rounded-md border transition-all ${
                        activeLanes === count
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-background hover:bg-surface border-border text-text-primary'
                      }`}
                    >
                      {count} Lintasan
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-secondary mt-1">Mengirim perintah <code className="bg-background px-1 rounded">LANES:{activeLanes}</code> ke ESP32.</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-border flex flex-wrap items-center gap-3">
              <Button
                id="esp32-connect-button"
                onClick={handleConnectToggle}
                disabled={isConnecting || !isSupported}
                variant={isConnected ? 'danger' : 'primary'}
                className="px-6 py-2.5 font-semibold text-sm flex items-center space-x-2 shadow"
              >
                <UsbIcon />
                <span>
                  {isConnecting
                    ? 'Sedang Memproses...'
                    : isConnected
                    ? 'Putuskan Koneksi ESP32'
                    : 'Hubungkan ESP32 (Web Serial)'}
                </span>
              </Button>

              <Button
                id="esp32-reset-port-btn"
                onClick={handleForceReset}
                variant="secondary"
                className="text-xs flex items-center space-x-1"
                title="Gunakan ini jika port terkunci atau macet"
              >
                <RefreshIcon />
                <span>Reset Port USB</span>
              </Button>

              <Button
                id="esp32-open-map-modal-btn"
                onClick={() => setIsMapModalOpen(true)}
                variant="secondary"
                className="text-xs flex items-center space-x-1"
              >
                <CogIcon />
                <span>Mapping Tombol & Pin</span>
              </Button>
            </div>

            {!isSupported && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-lg">
                ⚠️ Browser Anda tidak mendukung Web Serial API. Pastikan Anda membuka aplikasi di Google Chrome, Microsoft Edge, atau Opera pada Desktop / PC, dan bukan di browser ponsel tanpa dukungan serial.
              </div>
            )}
          </Card>

          {/* Quick Hardware Simulation / Test Card */}
          <Card title="Uji Tombol & Touchpad ESP32" className="space-y-4">
            <p className="text-xs text-text-secondary">
              Uji coba respons sistem terhadap sinyal dari mikrokontroler atau tombol fisik.
            </p>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Sinyal Utama Timer
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  id="esp32-test-start-btn"
                  onClick={() => {
                    if (isConnected) sendCommand('S');
                    else simulateIncomingData('GO');
                    addNotification('🚦 Sinyal Start dikirim!', 'success');
                  }}
                  variant="primary"
                  className="py-2 text-xs flex items-center justify-center space-x-1"
                >
                  <PlayIcon />
                  <span>Kirim Start (S)</span>
                </Button>

                <Button
                  id="esp32-test-reset-btn"
                  onClick={() => {
                    if (isConnected) sendCommand('R');
                    else simulateIncomingData('READY');
                    addNotification('🔄 Sinyal Reset dikirim.', 'info');
                  }}
                  variant="secondary"
                  className="py-2 text-xs flex items-center justify-center space-x-1"
                >
                  <RefreshIcon />
                  <span>Kirim Reset (R)</span>
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Simulasi Sentuhan Touchpad Lintasan
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {Array.from({ length: activeLanes }, (_, i) => i + 1).map(lane => (
                  <button
                    key={lane}
                    id={`esp32-test-lane-${lane}`}
                    onClick={() => {
                      const simulatedMs = Math.floor(25000 + Math.random() * 8000);
                      const cmd = `LANE:${lane}:${simulatedMs}`;
                      if (isConnected) sendCommand(cmd);
                      else simulateIncomingData(cmd);
                      addNotification(`🏁 Lintasan ${lane} disentuh: ${(simulatedMs / 1000).toFixed(2)} detik`, 'success');
                    }}
                    className="p-2 text-xs font-bold rounded bg-surface hover:bg-primary hover:text-white border border-border transition-colors text-center"
                    title={`Sentuh Lintasan ${lane}`}
                  >
                    L{lane}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Quick Hardware Pin Mapping Info */}
          <Card title="Ringkasan Perangkat" className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-background border border-border">
                <span className="text-xs text-text-secondary block">Status Web Serial</span>
                <span className={`text-base font-bold capitalize ${isConnected ? 'text-green-500' : 'text-text-primary'}`}>
                  {status === 'connected' ? '🟢 Aktif & Terhubung' : '⚪ ' + status}
                </span>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border">
                <span className="text-xs text-text-secondary block">Baud Rate Konfigurasi</span>
                <span className="text-base font-bold text-text-primary">{baudRate} bps</span>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border">
                <span className="text-xs text-text-secondary block">Lintasan Terdaftar</span>
                <span className="text-base font-bold text-text-primary">{activeLanes} Lintasan</span>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border">
                <span className="text-xs text-text-secondary block">Total Log Serial</span>
                <span className="text-base font-bold text-text-primary">{logs.length} Baris Data</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: TERMINAL SERIAL MONITOR */}
      {activeTab === 'terminal' && (
        <Card title="Serial Monitor & Console Debugger" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3 text-text-secondary">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                <span>RX (Dari ESP32)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                <span>TX (Perintah Web)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
                <span>SYS (Sistem)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                <span>ERR (Galat)</span>
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-1.5 cursor-pointer text-text-secondary">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={e => setAutoScroll(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Auto-scroll</span>
              </label>
              <Button
                id="esp32-clear-logs-btn"
                onClick={clearLogs}
                variant="secondary"
                className="py-1 px-2.5 text-xs flex items-center space-x-1"
              >
                <TrashIcon />
                <span>Bersihkan</span>
              </Button>
            </div>
          </div>

          {/* Terminal Screen */}
          <div className="bg-black text-gray-200 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto border border-gray-800 space-y-1 shadow-inner">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-20">
                Monitor Serial Kosong. Hubungkan ESP32 atau kirim perintah untuk melihat aktivitas data.
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="leading-relaxed break-all">
                  <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                  <span
                    className={
                      log.type === 'rx'
                        ? 'text-green-400 font-semibold'
                        : log.type === 'tx'
                        ? 'text-cyan-400 font-semibold'
                        : log.type === 'err'
                        ? 'text-red-400 font-bold'
                        : log.type === 'data'
                        ? 'text-purple-400 font-medium'
                        : 'text-yellow-400'
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Send Command Input */}
          <form onSubmit={handleSendCommand} className="flex gap-2">
            <input
              type="text"
              value={customCommand}
              onChange={e => setCustomCommand(e.target.value)}
              placeholder='Ketik perintah serial (contoh: "S", "R", "LANES:8", "MAP:0:1")...'
              className="flex-grow px-3 py-2 text-sm bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
            <Button
              id="esp32-send-custom-cmd-btn"
              type="submit"
              disabled={!isConnected || !customCommand.trim()}
              variant="primary"
              className="px-5 text-sm"
            >
              Kirim Perintah
            </Button>
          </form>
        </Card>
      )}

      {/* TAB 3: PANDUAN PINOUT & SKEMATIK */}
      {activeTab === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Daftar Perintah Serial ESP32 (Protokol Komunikasi)" className="space-y-4 text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-text-secondary uppercase text-[10px]">
                  <th className="py-2 px-1">Perintah / Format</th>
                  <th className="py-2 px-1">Arah</th>
                  <th className="py-2 px-1">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="py-2 px-1 font-mono text-primary font-bold">S atau GO</td>
                  <td className="py-2 px-1 text-text-secondary">Dua Arah</td>
                  <td className="py-2 px-1">Memulai stopwatch / trigger tembakan start.</td>
                </tr>
                <tr>
                  <td className="py-2 px-1 font-mono text-primary font-bold">R atau READY</td>
                  <td className="py-2 px-1 text-text-secondary">Dua Arah</td>
                  <td className="py-2 px-1">Mereset stopwatch ke 00:00.00.</td>
                </tr>
                <tr>
                  <td className="py-2 px-1 font-mono text-primary font-bold">LANE:X:YYYYY</td>
                  <td className="py-2 px-1 text-green-500 font-semibold">ESP32 ➔ Web</td>
                  <td className="py-2 px-1">Touchpad Lintasan X disentuh pada milidetik YYYYY.</td>
                </tr>
                <tr>
                  <td className="py-2 px-1 font-mono text-primary font-bold">LANES:N</td>
                  <td className="py-2 px-1 text-blue-500 font-semibold">Web ➔ ESP32</td>
                  <td className="py-2 px-1">Mengatur jumlah lintasan aktif (N = 6, 8, atau 10).</td>
                </tr>
                <tr>
                  <td className="py-2 px-1 font-mono text-primary font-bold">MAP:L:P</td>
                  <td className="py-2 px-1 text-blue-500 font-semibold">Web ➔ ESP32</td>
                  <td className="py-2 px-1">Memetakan Lintasan L ke Pin Fisik P (0-indexed).</td>
                </tr>
                <tr>
                  <td className="py-2 px-1 font-mono text-primary font-bold">DQ_OK:X</td>
                  <td className="py-2 px-1 text-text-secondary">ESP32 ➔ Web</td>
                  <td className="py-2 px-1">Konfirmasi diskualifikasi pada lintasan X.</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card title="Rekomendasi Pinout ESP32 30-Pin" className="space-y-3 text-xs">
            <p className="text-text-secondary leading-relaxed">
              Konfigurasi umum pin GPIO mikrokontroler ESP32 DevKit V1:
            </p>
            <ul className="space-y-2">
              <li className="flex items-center justify-between p-2 rounded bg-background border border-border">
                <span className="font-semibold text-text-primary">Tombol Start / Pistol Starter</span>
                <span className="font-mono text-primary font-bold">GPIO 4 (Pull-Up)</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-background border border-border">
                <span className="font-semibold text-text-primary">Tombol Reset Perlombaan</span>
                <span className="font-mono text-primary font-bold">GPIO 5 (Pull-Up)</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-background border border-border">
                <span className="font-semibold text-text-primary">Touchpad Lintasan 1 - 8</span>
                <span className="font-mono text-primary font-bold">GPIO 13, 14, 27, 26, 25, 33, 32, 35</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-background border border-border">
                <span className="font-semibold text-text-primary">Buzzer / Lampu Strobo Indikator</span>
                <span className="font-mono text-primary font-bold">GPIO 2 (LED Bawaan / Output)</span>
              </li>
            </ul>
          </Card>
        </div>
      )}

      {/* Pin Mapping Modal */}
      {isMapModalOpen && (
        <Modal title="Mapping Tombol / Touchpad Pin Fisik" onClose={() => setIsMapModalOpen(false)}>
          <div className="space-y-4 text-sm">
            <p className="text-xs text-text-secondary">
              Arahkan nomor lintasan pada tampilan layar ke pin tombol fisik hardware jika terdapat kabel atau susunan touchpad yang tertukar.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Lintasan Pada Aplikasi
                </label>
                <Select
                  value={mapLogicalLane}
                  onChange={e => setMapLogicalLane(Number(e.target.value))}
                  className="w-full"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>
                      Lintasan {n}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Tombol / Pin Fisik ESP32
                </label>
                <Select
                  value={mapPhysicalPin}
                  onChange={e => setMapPhysicalPin(Number(e.target.value))}
                  className="w-full"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>
                      Pin / Tombol #{n}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-border">
              <Button onClick={() => setIsMapModalOpen(false)} variant="secondary">
                Batal
              </Button>
              <Button onClick={handleSavePinMapping} variant="primary">
                Simpan & Kirim ke ESP32
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
