
import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { processParticipantUpload, getEvents, registerSwimmerToEvent } from '../services/databaseService';
import { formatEventName, formatTime, AGE_GROUP_OPTIONS, translateSwimStyle } from '../constants';
import type { Swimmer, SwimEvent, CompetitionInfo } from '../types';
import { Gender } from '../types';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any; // From script tag

interface ParticipantsViewProps {
  swimmers: Swimmer[];
  events: SwimEvent[];
  onUploadSuccess: () => void;
  competitionInfo: CompetitionInfo | null; // Added competitionInfo
}

export const ParticipantsView: React.FC<ParticipantsViewProps> = ({ swimmers, events, onUploadSuccess, competitionInfo }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingFinal, setIsDownloadingFinal] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ newSwimmers: number; updatedSwimmers: number; errors: string[] } | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const { addNotification } = useNotification();
  
  // State for manual registration
  const [manualForm, setManualForm] = useState({ swimmerId: '', eventId: '', min: '99', sec: '99', ms: '99' });
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Dynamic Age Groups Logic
  const ageOptions = useMemo(() => {
      if (competitionInfo?.ageGroups) {
          return competitionInfo.ageGroups.split('\n').map(s => s.trim()).filter(Boolean);
      }
      return AGE_GROUP_OPTIONS;
  }, [competitionInfo]);

  useEffect(() => {
    setCanDownload(events.length > 0);
  }, [events]); 

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    setIsProcessing(true);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        const result = await processParticipantUpload(json);
        setUploadResult(result);
        if (result.errors.length === 0 && (result.newSwimmers > 0 || result.updatedSwimmers > 0)) {
            addNotification('File pendaftaran berhasil diproses!', 'success');
        } else if (result.errors.length > 0) {
            addNotification(`Impor selesai dengan ${result.errors.length} galat.`, 'error');
        }
        if (result.newSwimmers > 0 || result.updatedSwimmers > 0) {
          onUploadSuccess(); // Trigger global data refresh
        }
      } catch (error: any) {
        addNotification(`Gagal memproses file: ${error.message}`, 'error');
        setUploadResult({ newSwimmers: 0, updatedSwimmers: 0, errors: ['Gagal membaca atau memproses file.', error.message] });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };
  
  const downloadTemplate = async () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
        return;
    }
    
    setIsDownloading(true);
    try {
        if (events.length === 0) {
             alert("Template tidak dapat dibuat karena belum ada nomor lomba. Silakan buat nomor lomba terlebih dahulu di menu 'Pengaturan Acara'.");
             return;
        }

        const workbook = XLSX.utils.book_new();

        // 1. Persiapan Data untuk Dropdown Pintar
        const allKUs = [...ageOptions];
        const eventsByKU: Record<string, string[]> = {};
        allKUs.forEach(ku => {
            eventsByKU[ku] = events.filter(e => e.category === ku).map(e => formatEventName(e));
        });
        const openEvents = events.filter(e => !e.category).map(e => formatEventName(e));
        if (openEvents.length > 0) {
            eventsByKU["Open"] = openEvents;
            if (!allKUs.includes("Open")) allKUs.push("Open");
        }

        // 2. Sheet DataMaster (Source data dropdown)
        const masterAOA: any[][] = [
            ["DAFTAR_KU", "", "DATA_NOMOR_LOMBA"],
            ...allKUs.map(ku => [ku])
        ];

        // Masukkan event per kolom sesuai KU
        const maxEventsCount = Math.max(...Object.values(eventsByKU).map(l => l.length), 1);
        for (let i = 0; i < maxEventsCount; i++) {
            if (!masterAOA[i+1]) masterAOA[i+1] = Array(allKUs.length + 2).fill("");
            allKUs.forEach((ku, kIdx) => {
                masterAOA[i+1][kIdx + 2] = eventsByKU[ku][i] || "";
            });
        }
        const wsMaster = XLSX.utils.aoa_to_sheet(masterAOA);
        XLSX.utils.book_append_sheet(workbook, wsMaster, "DataMaster");

        // 3. Named Ranges (Kunci untuk INDIRECT)
        const sanitize = (s: string) => 'VAL_' + s.replace(/[^a-zA-Z0-9]/g, '_');
        if (!workbook.Workbook) workbook.Workbook = {};
        if (!workbook.Workbook.Names) workbook.Workbook.Names = [];

        workbook.Workbook.Names.push({ name: "LIST_KU", formula: `DataMaster!$A$2:$A$${allKUs.length + 1}` });
        allKUs.forEach((ku, idx) => {
            const col = String.fromCharCode(67 + idx); // Start column C
            const count = eventsByKU[ku].length;
            if (count > 0) {
                workbook.Workbook.Names.push({ name: sanitize(ku), formula: `DataMaster!$${col}$2:$${col}$${count + 1}` });
            }
        });

        // 4. Sheet Template Pendaftaran
        const templateAOA = [
            ["Nama Atlet", "Tahun Lahir", "Jenis Kelamin (L/P)", "Nama Tim", "KU", "Nomor Lomba", "Waktu Unggulan (mm:ss.SS)"],
            ["CONTOH ATLET", 2010, "L", "TIM CEPAT", allKUs[0], eventsByKU[allKUs[0]]?.[0] || "", "01:25.50"]
        ];
        const wsTemplate = XLSX.utils.aoa_to_sheet(templateAOA);
        wsTemplate['!cols'] = [ { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 50 }, { wch: 25 }];

        // 5. Data Validation
        const maxRows = 1000;
        if (!wsTemplate['!dataValidation']) wsTemplate['!dataValidation'] = [];

        // JK
        wsTemplate['!dataValidation'].push({ sqref: `C2:C${maxRows}`, opts: { type: 'list', formula1: '"L,P"' } });
        // KU
        wsTemplate['!dataValidation'].push({ sqref: `E2:E${maxRows}`, opts: { type: 'list', formula1: 'LIST_KU', showDropDown: true } });
        // Nomor Lomba (Dependent)
        wsTemplate['!dataValidation'].push({ 
            sqref: `F2:F${maxRows}`, 
            opts: { 
                type: 'list', 
                // Excel formula yang membersihkan input sel E agar cocok dengan prefix VAL_ dan sanitasi underscore
                formula1: 'INDIRECT("VAL_"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(E2," ","_"),"-","_"),"/","_"),".","_"),"(","_"))', 
                showDropDown: true 
            } 
        });

        XLSX.utils.book_append_sheet(workbook, wsTemplate, "Template Pendaftaran");
        XLSX.writeFile(workbook, "Template_Pendaftaran_Lomba.xlsx");

    } catch(error) {
        console.error("Failed to generate template:", error);
        alert("Gagal membuat template.");
    } finally {
        setIsDownloading(false);
    }
  };

  const handleDownloadParticipants = () => {
    if (typeof XLSX === 'undefined') {
      alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
      return;
    }

    if (swimmers.length === 0) {
      alert('Tidak ada data atlet untuk diunduh.');
      return;
    }

    const workbook = XLSX.utils.book_new();

    // --- Sheet 1: Rekap Atlet ---
    const sortedSwimmers = [...swimmers].sort((a, b) => a.name.localeCompare(b.name));
    const participantsData = sortedSwimmers.map((swimmer, index) => ({
      "No": index + 1,
      "Nama Atlet": swimmer.name,
      "Nama Tim": swimmer.club,
      "Jenis Kelamin (L/P)": swimmer.gender === 'Male' ? 'L' : 'P'
    }));
    const wsParticipants = XLSX.utils.json_to_sheet(participantsData, { skipHeader: false });
    wsParticipants['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 35 },
        { wch: 20 }
    ];

    const totalMale = swimmers.filter(s => s.gender === 'Male').length;
    const totalFemale = swimmers.filter(s => s.gender === 'Female').length;
    XLSX.utils.sheet_add_aoa(wsParticipants, [
        [], // Spacer row
        ["REKAPITULASI JUMLAH ATLET"],
        ["Total Putra (L)", totalMale],
        ["Total Putri (P)", totalFemale],
        ["Total Keseluruhan", swimmers.length]
    ], { origin: -1 });
    const summaryHeaderRowIndex = participantsData.length + 2;
    if (!wsParticipants['!merges']) wsParticipants['!merges'] = [];
    wsParticipants['!merges'].push({ s: { r: summaryHeaderRowIndex, c: 0 }, e: { r: summaryHeaderRowIndex, c: 1 } });
    XLSX.utils.book_append_sheet(workbook, wsParticipants, "Rekap Atlet");

    // --- Sheet 2: Rekap Tim ---
    const clubRecap: Record<string, { male: number; female: number }> = {};
    swimmers.forEach(swimmer => {
      if (!clubRecap[swimmer.club]) {
        clubRecap[swimmer.club] = { male: 0, female: 0 };
      }
      if (swimmer.gender === 'Male') {
        clubRecap[swimmer.club].male++;
      } else {
        clubRecap[swimmer.club].female++;
      }
    });

    const sortedClubs = Object.entries(clubRecap).sort((a, b) => a[0].localeCompare(b[0]));
    const clubsData = sortedClubs.map(([clubName, counts], index) => ({
      "No": index + 1,
      "Nama Tim": clubName,
      "Jumlah Putra (L)": counts.male,
      "Jumlah Putri (P)": counts.female,
      "Total Atlet": counts.male + counts.female
    }));
    const wsClubs = XLSX.utils.json_to_sheet(clubsData, { skipHeader: false });
    wsClubs['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 }
    ];

    const grandTotalMale = sortedClubs.reduce((acc, [, counts]) => acc + counts.male, 0);
    const grandTotalFemale = sortedClubs.reduce((acc, [, counts]) => acc + counts.female, 0);
    const grandTotal = grandTotalMale + grandTotalFemale;

    XLSX.utils.sheet_add_aoa(wsClubs, [
        [], // Spacer row
        ["", "TOTAL KESELURUHAN", grandTotalMale, grandTotalFemale, grandTotal]
    ], { origin: -1 });

    XLSX.utils.book_append_sheet(workbook, wsClubs, "Rekap Tim");

    XLSX.writeFile(workbook, "Rekap_Peserta_Kompetisi.xlsx");
  };

  const handleDownloadFullRegistration = () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
        return;
    }

    if (events.length === 0) {
        alert('Tidak ada data pendaftaran untuk diunduh.');
        return;
    }
    
    setIsDownloading(true);

    try {
        const dataToExport = [];
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        for (const event of events) {
            for (const entry of event.entries) {
                const swimmer: Swimmer | undefined = swimmersMap.get(entry.swimmerId);
                if (swimmer) {
                    dataToExport.push({
                        "Nama Atlet": swimmer.name,
                        "Jenis Kelamin": swimmer.gender === 'Male' ? 'L' : 'P',
                        "Tahun Lahir": swimmer.birthYear,
                        "Nama Tim": swimmer.club,
                        "Nomor Lomba": formatEventName(event),
                        "Waktu Unggulan": formatTime(entry.seedTime)
                    });
                }
            }
        }
        
        dataToExport.sort((a, b) => {
            const clubCompare = a["Nama Tim"].localeCompare(b["Nama Tim"]);
            if (clubCompare !== 0) return clubCompare;
            const nameCompare = a["Nama Atlet"].localeCompare(b["Nama Atlet"]);
            if (nameCompare !== 0) return nameCompare;
            return a["Nomor Lomba"].localeCompare(b["Nomor Lomba"]);
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        worksheet['!cols'] = [ { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 45 }, { wch: 20 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Pendaftaran Lengkap");
        XLSX.writeFile(workbook, "Rekap_Pendaftaran_Lengkap.xlsx");
    } catch (error) {
        console.error("Failed to generate full registration report:", error);
        alert("Gagal membuat laporan pendaftaran. Silakan coba lagi.");
    } finally {
        setIsDownloading(false);
    }
  };

  const handleDownloadFinalData = () => {
    if (typeof XLSX === 'undefined') {
        addNotification('Pustaka Excel belum termuat.', 'error');
        return;
    }

    setIsDownloadingFinal(true);

    try {
        const wb = XLSX.utils.book_new();

        // 1. Athletes Sheet
        const athletesData = swimmers
            .filter(s => s.birthYear !== 0) // Exclude relay teams
            .map(s => ({
                'ID': s.id,
                'Nama': s.name,
                'Tgl Lahir': s.birthYear,
                'Gender': s.gender === 'Male' ? 'L' : 'P',
                'Tim': s.club,
                'Kota': '', // This data is not available
                'Provinsi': '' // This data is not available
            }));
        const wsAthletes = XLSX.utils.json_to_sheet(athletesData);
        wsAthletes['!cols'] = [ { wch: 36 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsAthletes, "Athletes");

        // 2. Clubs Sheet
        const uniqueClubs = [...new Set(swimmers.map(s => s.club))].sort();
        const clubsData = uniqueClubs.map((clubName, index) => ({
            'ID': index + 1,
            'Nama': clubName,
            'Alamat': '',
            'Pelatih': '',
            'Berdiri': '',
            'Deskripsi': ''
        }));
        const wsClubs = XLSX.utils.json_to_sheet(clubsData);
        wsClubs['!cols'] = [ { wch: 5 }, { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 10 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsClubs, "Clubs");
        
        // 3. Records (Results) Sheet
        const recordsData: any[] = [];
        for (const event of events) {
            for (const result of event.results) {
                if (result.time > 0) { // Only include valid times
                    recordsData.push({
                        'ID Atlet': result.swimmerId,
                        'Nama Event': formatEventName(event),
                        'Tanggal': competitionInfo?.eventDate || '',
                        'Gaya': translateSwimStyle(event.style),
                        'Jarak': event.distance,
                        'Waktu': formatTime(result.time)
                    });
                }
            }
        }
        const wsRecords = XLSX.utils.json_to_sheet(recordsData);
        wsRecords['!cols'] = [ { wch: 36 }, { wch: 45 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsRecords, "Records");
        
        XLSX.writeFile(wb, "Data_Final_Perlombaan.xlsx");
        addNotification('Data final berhasil diunduh.', 'success');

    } catch (error: any) {
        console.error("Gagal membuat unduhan data final:", error);
        addNotification(`Gagal membuat unduhan data final: ${error.message}`, 'error');
    } finally {
        setIsDownloadingFinal(false);
    }
  };


  // --- Manual Registration Logic ---
  const handleManualFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm(prev => ({ ...prev, [name]: value }));
  };
  
  const availableCategories = useMemo(() => {
    const categories = new Set(events.map(e => e.category || 'Tanpa Kategori'));
    return Array.from(categories).sort();
  }, [events]);
  
  const availableEventsForManualReg = useMemo(() => {
      if (!manualForm.swimmerId) return [];
      const swimmer = swimmers.find(s => s.id === manualForm.swimmerId);
      if (!swimmer) return [];

      const registeredEventIds = new Set<string>(
          events.filter(e => e.entries.some(en => en.swimmerId === swimmer.id)).map(e => e.id)
      );

      return events.filter(event => {
          const genderMatch =
              event.gender === 'Mixed' ||
              (swimmer.gender === 'Male' && event.gender === "Men's") ||
              (swimmer.gender === 'Female' && event.gender === "Women's");
          
          const categoryMatch = categoryFilter === 'all' || (event.category || 'Tanpa Kategori') === categoryFilter;

          return !registeredEventIds.has(event.id) && genderMatch && categoryMatch;
      });
  }, [manualForm.swimmerId, swimmers, events, categoryFilter]);

  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.swimmerId || !manualForm.eventId) {
        addNotification('Silakan pilih atlet dan nomor lomba.', 'error');
        return;
    }

    const min = parseInt(manualForm.min || '0');
    const sec = parseInt(manualForm.sec || '0');
    const ms = parseInt(manualForm.ms || '0');
    
    if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
        addNotification('Input detik harus di bawah 60, kecuali untuk "No Time" (99:99.99).', 'error');
        return;
    }

    setIsProcessing(true);
    let seedTime = (min * 60000) + (sec * 1000) + (ms * 10);
    if (min === 99 && sec === 99 && ms === 99) {
        seedTime = 0;
    }
    
    try {
        const result = await registerSwimmerToEvent(manualForm.eventId, manualForm.swimmerId, seedTime);
        if (result.success) {
            addNotification('Pendaftaran berhasil ditambahkan!', 'success');
            setManualForm({ swimmerId: '', eventId: '', min: '99', sec: '99', ms: '99' });
            onUploadSuccess(); // Refresh all data
        } else {
            addNotification(result.message, 'error');
        }
    } catch (err: any) {
        addNotification(`Gagal mendaftar: ${err.message}`, 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manajemen Peserta</h1>
      <div className="max-w-4xl">
        <Card>
          <h2 className="text-xl font-bold mb-4">Pendaftaran Massal via Excel</h2>
          <div className="bg-background p-4 rounded-md border border-border space-y-3 mb-4">
              <div>
                <p className="text-text-secondary">Unggah file Excel (.xlsx) dengan kolom berikut untuk mendaftarkan peserta ke nomor lomba:</p>
                <code className="block text-sm bg-surface p-2 rounded-md whitespace-pre mt-1">Nama Atlet | Tahun Lahir | Jenis Kelamin (L/P) | Nama Tim | KU | Nomor Lomba | Waktu Unggulan (mm:ss.SS)</code>
              </div>
              <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={downloadTemplate} disabled={isDownloading || !canDownload} title={!canDownload ? "Buat 'Nomor Lomba' terlebih dahulu untuk mengunduh template" : "Unduh template Excel pintar dengan validasi KU dan Nomor Lomba"}>
                      {isDownloading ? <Spinner /> : 'Unduh Template Pendaftaran'}
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadParticipants} disabled={swimmers.length === 0} title={swimmers.length === 0 ? "Tidak ada atlet untuk diunduh" : "Unduh rekap semua atlet"}>
                      Unduh Rekap Atlet
                  </Button>
                   <Button variant="secondary" onClick={handleDownloadFullRegistration} disabled={isDownloading || events.length === 0 || swimmers.length === 0} title="Unduh rekap lengkap semua pendaftaran per nomor lomba">
                      {isDownloading ? <Spinner /> : 'Unduh Rekap Pendaftaran Lengkap'}
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleDownloadFinalData}
                        disabled={isDownloadingFinal || swimmers.length === 0 || events.length === 0}
                        className="bg-green-600 hover:bg-green-700"
                        title="Unduh data final dalam format multi-tab sesuai spesifikasi"
                    >
                        {isDownloadingFinal ? <Spinner /> : 'Unduh Data Final Perlombaan'}
                    </Button>
              </div>
              <p className="text-xs text-text-secondary">{canDownload ? "Template Pendaftaran sudah dilengkapi dropdown KU dan Nomor Lomba yang saling terhubung." : "Tombol 'Unduh Template Pendaftaran' akan aktif setelah Anda membuat setidaknya satu nomor lomba."}</p>
          </div>

          <div className="flex items-center space-x-4">
              <input type="file" id="participant-upload" accept=".xlsx, .xls" className="hidden" onChange={handleFileChange} />
              <Button type="button" onClick={() => document.getElementById('participant-upload')?.click()}>Pilih File Pendaftaran</Button>
              {file && <span className="text-text-secondary">{file.name}</span>}
          </div>

          <div className="mt-4"><Button onClick={handleUpload} disabled={!file || isProcessing}>{isProcessing ? <Spinner/> : 'Proses File Pendaftaran'}</Button></div>

          {uploadResult && (
              <div className="mt-6 pt-4 border-t border-border">
                  <h3 className="font-bold text-lg">Hasil Impor:</h3>
                  {(uploadResult.newSwimmers > 0 || uploadResult.updatedSwimmers > 0) && (
                      <div className="text-green-400 space-y-1 my-2"><p><strong>Total entri lomba berhasil diproses: {uploadResult.updatedSwimmers}</strong></p>
                      {uploadResult.newSwimmers > 0 && <p className="text-sm pl-2">({uploadResult.newSwimmers} atlet/tim baru ditambahkan ke database)</p>}
                      </div>
                  )}
                  {uploadResult.errors.length > 0 && (
                      <div className="mt-2"><p className="text-red-500">{uploadResult.errors.length} baris gagal diproses:</p><ul className="list-disc list-inside text-red-500 text-sm h-32 overflow-y-auto bg-surface p-2 rounded-md mt-1">{uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}</ul></div>
                  )}
                  {uploadResult.newSwimmers === 0 && uploadResult.updatedSwimmers === 0 && uploadResult.errors.length === 0 && (<p className="text-text-secondary">Tidak ada data baru yang ditambahkan dari file.</p>)}
              </div>
          )}
        </Card>
      </div>
    </div>
  );
};
