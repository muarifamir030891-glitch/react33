import React, { useState, useMemo } from 'react';
import type { SwimEvent } from '../types';
import { SwimStyle, Gender } from '../types';
import { addEvent, deleteEvent, processEventUpload, deleteAllEvents, updateEvent } from '../services/databaseService';
import { SWIM_STYLE_OPTIONS, GENDER_OPTIONS, translateGender, translateSwimStyle, GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, romanize } from '../constants';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any;

interface EventsViewProps {
  events: SwimEvent[];
  isLoading: boolean;
  onSelectEvent: (id: string) => void;
  onStartTiming: (id: string) => void;
  onDataUpdate: () => void;
}

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const PencilIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const StopwatchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const UsersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const EventsView: React.FC<EventsViewProps> = ({ events, isLoading, onSelectEvent, onStartTiming, onDataUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<SwimEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<SwimEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<number>(0); // 0 for all, -1 for unscheduled
  const [newEvent, setNewEvent] = useState({
    distance: 100,
    style: SwimStyle.FREESTYLE,
    gender: Gender.MALE,
    isRelay: false,
    relayLegs: 4,
    category: '',
  });
  const [editEventData, setEditEventData] = useState({
    distance: 100,
    style: SwimStyle.FREESTYLE,
    gender: Gender.MALE,
    isRelay: false,
    relayLegs: 4,
    category: '',
  });
  const [uploadResult, setUploadResult] = useState<{ success: number; errors: string[] } | null>(null);
  const { addNotification } = useNotification();
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const genderOptions: Gender[] = GENDER_OPTIONS;
  const styleOptions: SwimStyle[] = SWIM_STYLE_OPTIONS;

  const hasSchemaError = useMemo(() => {
    if (!uploadResult || !uploadResult.errors) return false;
    return (uploadResult.errors as string[]).some(err => 
        err.toLowerCase().includes('skema database anda mungkin perlu diperbarui') ||
        err.toLowerCase().includes('invalid input value for enum public.swim_style')
    );
  }, [uploadResult]);

  const sessions = useMemo(() => {
    if (!events) return { scheduled: [], unscheduledExists: false };
    const sessionNumbers = new Set(events.map(e => e.sessionNumber || 0));
    const scheduled = Array.from(sessionNumbers).filter((s: number) => s > 0).sort((a: number, b: number) => a - b);
    const unscheduledExists = sessionNumbers.has(0);
    return { scheduled, unscheduledExists };
  }, [events]);

  const groupedEvents = useMemo(() => {
    const grouped = events.reduce((acc: Record<number, SwimEvent[]>, event: SwimEvent) => {
        const sessionNum = event.sessionNumber || 0;
        if (!acc[sessionNum]) {
            acc[sessionNum] = [];
        }
        acc[sessionNum].push(event);
        return acc;
    }, {} as Record<number, SwimEvent[]>);

    Object.values(grouped).forEach((sessionEvents: SwimEvent[]) => {
      sessionEvents.sort((a, b) => (a.heatOrder ?? 999) - (b.heatOrder ?? 999));
    });

    const filteredAndGrouped: Record<string, SwimEvent[]> = {};
    const sessionKeys = Object.keys(grouped).map(Number).sort((a: number, b: number) => a - b);
    
    sessionKeys.forEach((sessionNum: number) => {
        const sessionMatch = selectedSession === 0 ||
            (selectedSession === -1 && sessionNum === 0) ||
            (sessionNum === selectedSession);

        if (sessionMatch) {
            const eventsInSession = grouped[sessionNum].filter((event: SwimEvent) => 
                !searchQuery || formatEventName(event).toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (eventsInSession.length > 0) {
                const sessionName = sessionNum === 0 ? 'Belum Terjadwal' : `Sesi ${romanize(sessionNum)}`;
                filteredAndGrouped[sessionName] = eventsInSession;
            }
        }
    });

    return filteredAndGrouped;
  }, [events, searchQuery, selectedSession]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEvent.distance <= 0) {
        addNotification("Jarak lomba harus lebih besar dari 0.", 'error');
        return;
    }

    try {
        await addEvent({
            distance: newEvent.distance,
            style: newEvent.style,
            gender: newEvent.gender,
            relayLegs: newEvent.isRelay ? newEvent.relayLegs : null,
            category: newEvent.category || null,
        });
        setNewEvent({
            distance: 100,
            style: SwimStyle.FREESTYLE,
            gender: Gender.MALE,
            isRelay: false,
            relayLegs: 4,
            category: '',
        });
        setIsModalOpen(false);
        onDataUpdate();
        addNotification('Nomor lomba baru berhasil dibuat.', 'success');
    } catch (error) {
        let errorMessage = "Terjadi kesalahan saat menyimpan.";
        if (error instanceof Error) {
            const lowerMessage = error.message.toLowerCase();
            if (lowerMessage.includes('invalid input value for enum public.swim_style') ||
                (lowerMessage.includes('violates check constraint') && lowerMessage.includes('events_style_check'))) {
                errorMessage = `Gagal menyimpan gaya "${translateSwimStyle(newEvent.style)}". Skema database Anda mungkin perlu diperbarui.`;
            } else {
                errorMessage = error.message;
            }
        }
        addNotification(errorMessage, 'error');
    }
  };

  const handleOpenEditModal = (event: SwimEvent) => {
      setEditingEvent(event);
      setEditEventData({
          distance: event.distance,
          style: event.style,
          gender: event.gender,
          isRelay: !!event.relayLegs,
          relayLegs: event.relayLegs || 4,
          category: event.category || '',
      });
      setIsEditModalOpen(true);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    
    if (editEventData.distance <= 0) {
        addNotification("Jarak lomba harus lebih besar dari 0.", 'error');
        return;
    }

    try {
        await updateEvent(editingEvent.id, {
            distance: editEventData.distance,
            style: editEventData.style,
            gender: editEventData.gender,
            relayLegs: editEventData.isRelay ? editEventData.relayLegs : null,
            category: editEventData.category || null,
        });
        
        setIsEditModalOpen(false);
        onDataUpdate();
        addNotification('Nomor lomba berhasil diperbarui.', 'success');
    } catch (error: any) {
        addNotification(`Gagal memperbarui: ${error.message}`, 'error');
    }
  };
  
  const openDeleteConfirm = (event: SwimEvent) => {
    setEventToDelete(event);
    setIsDeleteModalOpen(true);
  };
  
  const closeDeleteConfirm = () => {
    setEventToDelete(null);
    setIsDeleteModalOpen(false);
  };
  
  const handleDeleteEvent = async () => {
    if (eventToDelete) {
        try {
            await deleteEvent(eventToDelete.id);
            addNotification('Nomor lomba berhasil dihapus.', 'error');
            closeDeleteConfirm();
            onDataUpdate();
        } catch (error: any) {
            addNotification(`Gagal menghapus: ${error.message}`, 'error');
        }
    }
  };

  const handleConfirmDeleteAll = async () => {
    try {
        await deleteAllEvents();
        addNotification('Semua nomor lomba berhasil dihapus.', 'error');
        setIsDeleteAllModalOpen(false);
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal menghapus: ${error.message}`, 'error');
    }
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadFile(null);
    setUploadResult(null);
    setIsProcessingUpload(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleProcessUpload = () => {
    if (!uploadFile) return;

    setIsProcessingUpload(true);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json: any[] = XLSX.utils.sheet_to_json(worksheet);

            const result = await processEventUpload(json);
            setUploadResult(result);

            if (result.errors.length === 0 && result.success > 0) {
                addNotification(`${result.success} nomor lomba berhasil diimpor.`, 'success');
                onDataUpdate();
                setTimeout(() => {
                    closeUploadModal();
                }, 2000);
            } else if (result.errors.length > 0) {
                addNotification(`Impor selesai with ${result.errors.length} galat. Periksa detail di bawah.`, 'error');
            }
        } catch (error: any) {
            addNotification(`Gagal memproses file: ${error.message}`, 'error');
            setUploadResult({ success: 0, errors: ['Gagal membaca atau memproses file.', error.message] });
        } finally {
            setIsProcessingUpload(false);
        }
    };
    reader.readAsArrayBuffer(uploadFile);
  };

  const handleDownloadTemplate = () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
        return;
    }
    const wb = XLSX.utils.book_new();

    const listsSheetData: any[][] = [
        ["PETUNJUK PENGISIAN"],
        ["1. Isi data nomor lomba pada sheet 'Template Nomor Lomba'."],
        ["2. Kolom 'Jarak (m)', 'Gaya', and 'Jenis Kelamin' wajib diisi."],
        ["3. Untuk Gaya and Jenis Kelamin, mohon gunakan pilihan yang tersedia di dropdown."],
        ["4. Kolom 'Kategori' bersifat opsional. Kosongkan jika tidak ada (cth: untuk event senior/open)."],
        ["5. Kolom 'Jumlah Atlet' HANYA diisi untuk nomor estafet (relay), contoh: 4. Kosongkan untuk perorangan."],
        [],
        ["DAFTAR PILIHAN VALID"],
        [],
        ["Gaya", "Jenis Kelamin"],
    ];

    const styles: string[] = Object.values(SWIM_STYLE_TRANSLATIONS);
    const genders: string[] = Object.values(GENDER_TRANSLATIONS);
    const maxLength = Math.max(styles.length, genders.length);

    for (let i = 0; i < maxLength; i++) {
        listsSheetData.push([ styles[i] || "", genders[i] || "" ]);
    }
    const ws_lists = XLSX.utils.aoa_to_sheet(listsSheetData);
    ws_lists['!cols'] = [{ wch: 40 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws_lists, "Petunjuk & Pilihan");

    const templateData = [
        {
            "Jarak (m)": 50,
            "Gaya": "Gaya Kupu-kupu",
            "Jenis Kelamin": "Putri",
            "Kategori": "KU 1-2",
            "Jumlah Atlet": ""
        },
        {
            "Jarak (m)": 200,
            "Gaya": "Gaya Bebas",
            "Jenis Kelamin": "Putra",
            "Kategori": "",
            "Jumlah Atlet": ""
        },
        {
            "Jarak (m)": 100,
            "Gaya": "Gaya Ganti Perorangan",
            "Jenis Kelamin": "Campuran",
            "Kategori": "KU-3",
            "Jumlah Atlet": 4
        },
        {
            "Jarak (m)": 25,
            "Gaya": "Papan Luncur / Kickboard",
            "Jenis Kelamin": "Putra",
            "Kategori": "KU-4",
            "Jumlah Atlet": ""
        }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [ { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];

    const maxRows = 1000;
    if (!ws['!dataValidation']) ws['!dataValidation'] = [];
    ws['!dataValidation'].push({ sqref: `B2:B${maxRows}`, opts: { type: 'list', formula1: `'Petunjuk & Pilihan'!$A$11:$A$${10 + styles.length}` } });
    ws['!dataValidation'].push({ sqref: `C2:C${maxRows}`, opts: { type: 'list', formula1: `'Petunjuk & Pilihan'!$B$11:$B$${10 + genders.length}` } });
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Nomor Lomba");
    wb.SheetNames.reverse();
    XLSX.writeFile(wb, "Template_Nomor_Lomba.xlsx");
  };

  const handleDownloadEvents = () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda and muat ulang halaman.');
        return;
    }
    if (events.length === 0) {
        alert('Tidak ada nomor lomba untuk diunduh.');
        return;
    }

    const sortedEvents: SwimEvent[] = [...events].sort((a, b) => {
         const sessionNumberA = a.sessionNumber ?? 999;
         const sessionNumberB = b.sessionNumber ?? 999;
         const sessionDiff = sessionNumberA - sessionNumberB;
         if (sessionDiff !== 0) return sessionDiff;
         const heatOrderA = a.heatOrder ?? 999;
         const heatOrderB = b.heatOrder ?? 999;
         const orderDiff = heatOrderA - heatOrderB;
         if (orderDiff !== 0) return orderDiff;
         return formatEventName(a).localeCompare(formatEventName(b));
    });

    const dataToExport = sortedEvents.map(event => ({
        "Jarak (m)": event.distance,
        "Gaya": translateSwimStyle(event.style),
        "Jenis Kelamin": translateGender(event.gender),
        "Kategori": event.category || "",
        "Jumlah Atlet": event.relayLegs || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [
        { wch: 10 },
        { wch: 25 },
        { wch: 15 },
        { wch: 15 },
        { wch: 20 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Nomor Lomba");
    XLSX.writeFile(workbook, "Daftar_Nomor_Lomba_Saat_Ini.xlsx");
  };


  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-3xl font-bold">Nomor Lomba</h1>
        <div className="flex space-x-2 flex-wrap gap-2">
            <Button onClick={handleDownloadEvents} variant="secondary" disabled={events.length === 0} title="Unduh semua nomor lomba yang ada">Unduh Nomor Lomba</Button>
            <Button onClick={() => setIsUploadModalOpen(true)} variant="secondary">Unggah Nomor Lomba</Button>
            <Button onClick={() => setIsModalOpen(true)}>Buat Nomor Lomba</Button>
            <Button 
                variant="danger" 
                onClick={() => setIsDeleteAllModalOpen(true)}
                disabled={events.length === 0}
                title={events.length === 0 ? "Tidak ada nomor lomba untuk dihapus" : "Hapus semua nomor lomba"}
            >
                Hapus Semua Nomor Lomba
            </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Filter berdasarkan Sesi</p>
                <div className="flex flex-wrap gap-2">
                    <Button variant={selectedSession === 0 ? 'primary' : 'secondary'} onClick={() => setSelectedSession(0)}>Semua</Button>
                    {sessions.scheduled.map((num: number) => (
                        <Button key={num} variant={selectedSession === num ? 'primary' : 'secondary'} onClick={() => setSelectedSession(num)}>Sesi {romanize(num)}</Button>
                    ))}
                    {sessions.unscheduledExists && (
                        <Button variant={selectedSession === -1 ? 'primary' : 'secondary'} onClick={() => setSelectedSession(-1)}>Belum Terjadwal</Button>
                    )}
                </div>
            </div>
            <div>
                <Input
                label="Cari Nomor Lomba"
                id="event-search"
                type="text"
                placeholder="Cth: 50m Gaya Bebas KU 1-2 Putra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
            <div className="flex justify-center items-center py-10">
                <Spinner />
                <p className="ml-2 text-text-secondary">Memuat nomor lomba...</p>
            </div>
        ) : Object.keys(groupedEvents).length > 0 ? (
            <div className="space-y-6">
                {Object.entries(groupedEvents).map(([sessionName, eventsInSession]) => (
                    <div key={sessionName}>
                        <h2 className="text-xl font-bold text-primary border-b-2 border-primary/20 pb-2 mb-3">{sessionName}</h2>
                        <div className="space-y-2">
                            {eventsInSession.map((event: SwimEvent) => {
                                const recordedCount = event.results.length;
                                const entryCount = event.entries.length;
                                const hasEntries = entryCount > 0;
                                const needsTiming = hasEntries && recordedCount < entryCount;
                                
                                let statusText: string;
                                let statusColor: string;
                            
                                if (!hasEntries) {
                                    statusText = 'Belum Ada Hasil';
                                    statusColor = '';
                                } else if (recordedCount >= entryCount) {
                                    statusText = `${recordedCount} Hasil Tercatat`;
                                    statusColor = 'text-green-500';
                                } else {
                                    const missingCount = entryCount - recordedCount;
                                    statusText = `${recordedCount} Hasil Tercatat (${missingCount} belum ada hasil)`;
                                    statusColor = 'text-yellow-500';
                                }

                                return (
                                <div key={event.id} className="flex items-center justify-between p-3 bg-background rounded-lg hover:shadow-md transition-shadow">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-text-primary whitespace-normal break-words">{formatEventName(event)}</p>
                                        <div className="flex items-center space-x-4 text-sm text-text-secondary mt-1">
                                            <span className="flex items-center"><UsersIcon /> <span className="ml-1.5">{event.entries.length} Peserta</span></span>
                                            <span className={`flex items-center ${statusColor}`}>
                                                <CheckCircleIcon />
                                                <span className="ml-1.5">{statusText}</span>
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                                        <Button onClick={() => onSelectEvent(event.id)} variant="secondary" className="py-2 px-4">
                                            Detail
                                        </Button>
                                        <Button 
                                            onClick={() => onStartTiming(event.id)} 
                                            disabled={event.entries.length === 0}
                                            title={event.entries.length === 0 ? "Tambah peserta untuk memulai timing" : "Mulai timing lomba"}
                                            className="py-2 px-4 flex items-center relative"
                                        >
                                            {needsTiming && (
                                                <span className="absolute top-0 right-0 -mr-1 -mt-1 flex h-3 w-3">
                                                    <span
                                                        className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"
                                                        style={{ animation: 'pulse-indicator 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                                                    ></span>
                                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                                                </span>
                                            )}
                                            <StopwatchIcon />
                                            <span className="ml-1">Timing</span>
                                        </Button>
                                        <button onClick={() => handleOpenEditModal(event)} className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors" title="Edit Nomor Lomba">
                                            <PencilIcon />
                                        </button>
                                        <button onClick={() => openDeleteConfirm(event)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors" title="Hapus Nomor Lomba">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="text-center text-text-secondary py-10">
              <h3 className="text-xl font-semibold">Tidak Ada Nomor Lomba</h3>
              <p className="mt-2">{searchQuery ? `Tidak ada nomor lomba yang cocok with "${searchQuery}".` : "Tidak ada nomor lomba dalam sesi ini atau belum ada nomor lomba yang dibuat."}</p>
            </div>
        )}
      </Card>


      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); }} title="Buat Nomor Lomba Baru">
        <form onSubmit={handleAddEvent} className="space-y-4">
            <div className="flex items-center p-2 bg-background rounded-md space-x-3">
                <input 
                    type="checkbox" 
                    id="isRelay" 
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={newEvent.isRelay} 
                    onChange={e => {
                        const isRelay = e.target.checked;
                        setNewEvent(prev => ({
                            ...prev, 
                            isRelay,
                            gender: !isRelay && prev.gender === Gender.MIXED ? Gender.MALE : prev.gender
                        }));
                    }} 
                />
                <label htmlFor="isRelay" className="font-medium text-text-primary">Nomor Estafet (Relay)</label>
            </div>

            {newEvent.isRelay && (
                <Input
                    label="Jumlah Atlet per Tim"
                    id="event-relay-legs"
                    type="number"
                    value={newEvent.relayLegs}
                    onChange={(e) => setNewEvent({ ...newEvent, relayLegs: parseInt(e.target.value) || 4 })}
                    required
                />
            )}
            <Input
                label={newEvent.isRelay ? 'Jarak per Atlet (meter)' : 'Jarak (meter)'}
                id="event-distance"
                type="number"
                value={newEvent.distance}
                onChange={(e) => {
                    setNewEvent({ ...newEvent, distance: parseInt(e.target.value) || 0 });
                }}
                required
            />
             <Input
                label="Kategori (Opsional, cth: KU 1-2, SMP)"
                id="event-category"
                type="text"
                value={newEvent.category}
                onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value.toUpperCase() })}
            />
            <Select
                label="Gaya"
                id="event-style"
                value={newEvent.style}
                onChange={(e) => setNewEvent({ ...newEvent, style: e.target.value as SwimStyle })}
            >
                {styleOptions.map((style) => (
                <option key={style} value={style}>
                    {translateSwimStyle(style)}
                </option>
                ))}
            </Select>
            <Select
                label="Jenis Kelamin"
                id="event-gender"
                value={newEvent.gender}
                onChange={(e) => setNewEvent({ ...newEvent, gender: e.target.value as Gender })}
            >
                {genderOptions.filter((gender) => newEvent.isRelay || gender !== Gender.MIXED).map((gender) => (
                <option key={gender} value={gender}>
                    {translateGender(gender)}
                </option>
                ))}
            </Select>
            <div className="flex justify-end pt-2">
                <Button type="submit">Buat Nomor Lomba</Button>
            </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); }} title={`Edit Nomor Lomba: ${editingEvent ? formatEventName(editingEvent) : ''}`}>
        <form onSubmit={handleUpdateEvent} className="space-y-4">
            <div className="flex items-center p-2 bg-background rounded-md space-x-3">
                <input 
                    type="checkbox" 
                    id="edit-isRelay" 
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={editEventData.isRelay} 
                    onChange={e => {
                        const isRelay = e.target.checked;
                        setEditEventData(prev => ({
                            ...prev, 
                            isRelay,
                            gender: !isRelay && prev.gender === Gender.MIXED ? Gender.MALE : prev.gender
                        }));
                    }} 
                />
                <label htmlFor="edit-isRelay" className="font-medium text-text-primary">Nomor Estafet (Relay)</label>
            </div>

            {editEventData.isRelay && (
                <Input
                    label="Jumlah Atlet per Tim"
                    id="edit-event-relay-legs"
                    type="number"
                    value={editEventData.relayLegs}
                    onChange={(e) => setEditEventData({ ...editEventData, relayLegs: parseInt(e.target.value) || 4 })}
                    required
                />
            )}
            <Input
                label={editEventData.isRelay ? 'Jarak per Atlet (meter)' : 'Jarak (meter)'}
                id="edit-event-distance"
                type="number"
                value={editEventData.distance}
                onChange={(e) => {
                    setEditEventData({ ...editEventData, distance: parseInt(e.target.value) || 0 });
                }}
                required
            />
             <Input
                label="Kategori (Opsional, cth: KU 1-2, SMP)"
                id="edit-event-category"
                type="text"
                value={editEventData.category}
                onChange={(e) => setEditEventData({ ...editEventData, category: e.target.value.toUpperCase() })}
            />
            <Select
                label="Gaya"
                id="edit-event-style"
                value={editEventData.style}
                onChange={(e) => setEditEventData({ ...editEventData, style: e.target.value as SwimStyle })}
            >
                {styleOptions.map((style) => (
                <option key={style} value={style}>
                    {translateSwimStyle(style)}
                </option>
                ))}
            </Select>
            <Select
                label="Jenis Kelamin"
                id="edit-event-gender"
                value={editEventData.gender}
                onChange={(e) => setEditEventData({ ...editEventData, gender: e.target.value as Gender })}
            >
                {genderOptions.filter((gender) => editEventData.isRelay || gender !== Gender.MIXED).map((gender) => (
                <option key={gender} value={gender}>
                    {translateGender(gender)}
                </option>
                ))}
            </Select>
            <div className="flex justify-end pt-2">
                <Button type="submit">Simpan Perubahan</Button>
            </div>
        </form>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={closeDeleteConfirm} title="Konfirmasi Hapus Nomor Lomba">
        {eventToDelete && (
          <div className="space-y-6">
            {eventToDelete.entries.length > 0 ? (
              <p className="text-text-secondary">
                <strong className="text-yellow-500 font-bold block mb-2">PERINGATAN!</strong>
                Nomor lomba <strong className="text-text-primary">{formatEventName(eventToDelete)}</strong> sudah memiliki <strong className="text-red-500 font-bold">{eventToDelete.entries.length} peserta</strong> terdaftar.
                <br/><br/>
                Menghapus nomor lomba ini akan menghapus semua data pendaftaran yang terkait secara permanen. Anda yakin ingin melanjutkan?
              </p>
            ) : (
              <p className="text-text-secondary">
                Anda yakin ingin menghapus nomor lomba <strong className="text-text-primary">{formatEventName(eventToDelete)}</strong>?
                <br/>
                Tindakan ini tidak dapat dibatalkan.
              </p>
            )}
            <div className="flex justify-end space-x-4">
              <Button variant="secondary" onClick={closeDeleteConfirm}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleDeleteEvent}>
                Ya, Hapus
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isDeleteAllModalOpen} onClose={() => setIsDeleteAllModalOpen(false)} title="Konfirmasi Hapus Semua Nomor Lomba">
            <div className="space-y-6">
                <p className="text-text-secondary">
                    Anda benar-benar yakin ingin menghapus <strong className="text-text-primary">SEMUA</strong> data nomor lomba?
                    <br/><br/>
                    Tindakan ini akan <strong className="text-red-500">menghapus permanen</strong> semua nomor lomba beserta data pendaftaran and hasil yang terkait.
                    <br />
                    Tindakan ini <strong className="font-bold">TIDAK DAPAT BATALKAN</strong>.
                </p>
                <div className="flex justify-end space-x-4">
                    <Button variant="secondary" onClick={() => setIsDeleteAllModalOpen(false)}>Batal</Button>
                    <Button variant="danger" onClick={handleConfirmDeleteAll}>Ya, Hapus Semua</Button>
                </div>
            </div>
      </Modal>

      <Modal isOpen={isUploadModalOpen} onClose={closeUploadModal} title="Unggah Nomor Lomba dari Excel">
        <div className="space-y-4">
            <div>
                <p className="text-text-secondary mb-2">Unggah file Excel (.xlsx) untuk menambahkan beberapa nomor lomba sekaligus. File harus memiliki kolom berikut:</p>
                <code className="block text-sm bg-surface p-2 rounded-md whitespace-pre">Jarak (m) | Gaya | Jenis Kelamin | Kategori | Jumlah Atlet</code>
                <p className="text-xs text-text-secondary mt-1">Kolom 'Kategori' and 'Jumlah Atlet' bersifat opsional.</p>
            </div>
            
            <Button variant="secondary" onClick={handleDownloadTemplate}>
                Unduh Template
            </Button>

            <div className="flex items-center space-x-4 pt-4">
                <input type="file" id="event-upload" accept=".xlsx, .xls" className="hidden" onChange={handleFileChange} />
                <Button type="button" onClick={() => document.getElementById('event-upload')?.click()}>Pilih File</Button>
                {uploadFile && <span className="text-text-secondary text-sm">{uploadFile.name}</span>}
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
                <Button onClick={handleProcessUpload} disabled={!uploadFile || isProcessingUpload}>
                    {isProcessingUpload ? <Spinner /> : 'Proses & Tambahkan'}
                </Button>
            </div>

            {uploadResult && (
                <div className="mt-4 text-sm space-y-2">
                    {hasSchemaError ? (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md">
                            <h4 className="font-bold text-red-400">Tindakan Diperlukan: Perbarui Skema Database</h4>
                            <p className="text-red-300/90 mt-1">
                                Penyimpanan gagal karena gaya renang baru belum ada di database Anda.
                            </p>
                        </div>
                    ) : (uploadResult.errors as string[]).length > 0 ? (
                        <p className="text-red-500 font-bold">
                            Ditemukan {(uploadResult.errors as string[]).length} galat. {uploadResult.success > 0 ? `${uploadResult.success} nomor lomba berhasil ditambahkan.` : 'Tidak ada nomor lomba yang ditambahkan.'}
                        </p>
                    ) : (
                        <p className="text-green-500 font-bold">Berhasil! {uploadResult.success} nomor lomba baru telah ditambahkan.</p>
                    )}
                    
                    {uploadResult && Array.isArray(uploadResult.errors) && uploadResult.errors.length > 0 && (
                        <div>
                            <p className="font-semibold text-text-secondary">Detail Galat:</p>
                            <ul className="list-disc list-inside h-24 overflow-y-auto bg-surface p-2 rounded-md mt-1 text-red-400">
                                {/* FIX: Explicitly cast to string[] and check existence before mapping to resolve 'unknown' type errors. */}
                                {uploadResult.errors.map((err: string, i: number) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    </Modal>
    </div>
  );
};
