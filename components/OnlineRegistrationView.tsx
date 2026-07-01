import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, FormattableEvent } from '../types';
import { getEventsForRegistration, processOnlineRegistration, processCollectiveRegistration, findSwimmerByName, getSwimmerBestTime, getSwimmerRegisteredEventIds } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName, toTitleCase, translateSwimStyle, AGE_GROUP_OPTIONS, formatTime } from '../constants';
import { SwimStyle } from '../types';
import { supabase } from '../services/supabaseClient';
import { compressImage } from '../services/imageCompression';

declare var XLSX: any;
declare var ExcelJS: any;

interface OnlineRegistrationViewProps {
    competitionInfo: CompetitionInfo | null;
    events: SwimEvent[];
    onBackToLogin: () => void;
    onRegistrationSuccess: () => void;
}

type RegistrationTime = { min: string; sec: string; ms: string };
type SelectedEvents = Record<string, { selected: boolean; time: RegistrationTime }>;

const parseTimeToMs = (time: RegistrationTime): number => {
    const minutes = parseInt(time.min, 10) || 0;
    const seconds = parseInt(time.sec, 10) || 0;
    const hundredths = parseInt(time.ms, 10) || 0;
    if (minutes === 99 && seconds === 99 && hundredths === 99) {
        return 0; // Treat as No Time
    }
    return (minutes * 60 * 1000) + (seconds * 1000) + (hundredths * 10);
};

const ChevronDownIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const UserGroupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CountdownTimer = ({ deadline }: { deadline: string }) => {
    const [timeLeft, setTimeLeft] = useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        isExpired: boolean;
    } | null>(null);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const targetDate = new Date(deadline).getTime();
            const now = new Date().getTime();
            const difference = targetDate - now;

            if (difference <= 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
                return;
            }

            setTimeLeft({
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
                isExpired: false
            });
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [deadline]);

    if (!timeLeft) return null;

    if (timeLeft.isExpired) {
        return (
            <div className="inline-block mt-3 bg-red-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black animate-pulse shadow-md border border-red-400">
                PENDAFTARAN SUDAH DITUTUP
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center mt-4">
            <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-2 opacity-70">Batas Waktu Pendaftaran</p>
            <div className="flex gap-2 items-center justify-center">
                <div className="flex flex-col items-center bg-white/40 dark:bg-slate-700/40 backdrop-blur-md min-w-[50px] px-2 py-1.5 rounded-xl border border-white/50 dark:border-white/10 shadow-sm">
                    <span className="text-xl font-black text-primary leading-tight">{timeLeft.days}</span>
                    <span className="text-[7px] font-bold uppercase tracking-widest opacity-60">Hari</span>
                </div>
                <span className="text-primary font-black animate-pulse">:</span>
                <div className="flex flex-col items-center bg-white/40 dark:bg-slate-700/40 backdrop-blur-md min-w-[50px] px-2 py-1.5 rounded-xl border border-white/50 dark:border-white/10 shadow-sm">
                    <span className="text-xl font-black text-primary leading-tight">{timeLeft.hours}</span>
                    <span className="text-[7px] font-bold uppercase tracking-widest opacity-60">Jam</span>
                </div>
                <span className="text-primary font-black animate-pulse">:</span>
                <div className="flex flex-col items-center bg-white/40 dark:bg-slate-700/40 backdrop-blur-md min-w-[50px] px-2 py-1.5 rounded-xl border border-white/50 dark:border-white/10 shadow-sm">
                    <span className="text-xl font-black text-primary leading-tight">{timeLeft.minutes}</span>
                    <span className="text-[7px] font-bold uppercase tracking-widest opacity-60">Menit</span>
                </div>
                <span className="text-primary font-black animate-pulse">:</span>
                <div className="flex flex-col items-center bg-white/40 dark:bg-slate-700/40 backdrop-blur-md min-w-[50px] px-2 py-1.5 rounded-xl border border-white/50 dark:border-white/10 shadow-sm">
                    <span className="text-xl font-black text-primary leading-tight">{timeLeft.seconds}</span>
                    <span className="text-[7px] font-bold uppercase tracking-widest opacity-60">Detik</span>
                </div>
            </div>
            {deadline && <p className="text-[9px] text-text-secondary mt-2 opacity-50 font-medium italic">Sampai: {new Date(deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
        </div>
    );
};

export const OnlineRegistrationView: React.FC<OnlineRegistrationViewProps> = ({
    competitionInfo,
    events,
    onBackToLogin,
    }) => {
    const [regType, setRegType] = useState<'CHOICE' | 'INDIVIDUAL' | 'TEAM' | 'CHECK_STATUS' | 'EVENTS_LIST'>('CHOICE');
    const [localEvents, setLocalEvents] = useState<SwimEvent[]>(events || []);
    const [isDataLoading, setIsDataLoading] = useState(!events || events.length === 0);
    
    // Individual form states
    const [formData, setFormData] = useState({
        name: '',
        birthYear: new Date().getFullYear() - 10,
        gender: 'Male' as 'Male' | 'Female',
        club: '',
        ageGroup: '',
        picPhone: '',
        paymentProof: null as string | null,
        paymentAmount: '' as string
    });
    const [existingSwimmerId, setExistingSwimmerId] = useState<string | null>(null);
    const [registeredEventIds, setRegisteredEventIds] = useState<string[]>([]);
    const [selectedEvents, setSelectedEvents] = useState<SelectedEvents>({});
    
    // Team form states
    const [teamFormData, setTeamFormData] = useState({
        clubName: '',
        picName: '',
        picPhone: '',
        paymentProof: null as string | null,
        paymentAmount: '' as string
    });
    const [teamParticipants, setTeamParticipants] = useState<any[]>([]);
    const [isParsingExcel, setIsParsingExcel] = useState(false);

    // States for client-side WebP payment proof compression & storage uploads
    const [individualCompressedBlob, setIndividualCompressedBlob] = useState<Blob | null>(null);
    const [teamCompressedBlob, setTeamCompressedBlob] = useState<Blob | null>(null);
    const [individualPreviewUrl, setIndividualPreviewUrl] = useState<string>('');
    const [teamPreviewUrl, setTeamPreviewUrl] = useState<string>('');
    const [isCompressing, setIsCompressing] = useState<boolean>(false);

    // New States for Registration Dashboard & Receipt Verification
    const [stats, setStats] = useState({
        totalSwimmers: 0,
        totalClubs: 0,
        totalEntries: 0
    });
    const [statusSearchQuery, setStatusSearchQuery] = useState('');
    const [statusSearchResults, setStatusSearchResults] = useState<any[]>([]);
    const [isSearchingStatus, setIsSearchingStatus] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const [isIndividualConfirmed, setIsIndividualConfirmed] = useState(false);
    const [isTeamConfirmed, setIsTeamConfirmed] = useState(false);
    const [showZoomModal, setShowZoomModal] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    
    const [tempIndividualCheck1, setTempIndividualCheck1] = useState(false);
    const [tempIndividualCheck2, setTempIndividualCheck2] = useState(false);
    const [tempTeamCheck1, setTempTeamCheck1] = useState(false);
    const [tempTeamCheck2, setTempTeamCheck2] = useState(false);

    // Number Speller in Indonesian (Terbilang)
    const terbilang = (nilai: number): string => {
        const bilangan = [
            "", "Satu", "Dua", "Tiga", "Empat", "Lima", 
            "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"
        ];
        let temp = "";
        if (nilai < 12) {
            temp = " " + bilangan[nilai];
        } else if (nilai < 20) {
            temp = terbilang(nilai - 10) + " Belas";
        } else if (nilai < 100) {
            temp = terbilang(Math.floor(nilai / 10)) + " Puluh" + terbilang(nilai % 10);
        } else if (nilai < 200) {
            temp = " Seratus" + terbilang(nilai - 100);
        } else if (nilai < 1000) {
            temp = terbilang(Math.floor(nilai / 100)) + " Ratus" + terbilang(nilai % 100);
        } else if (nilai < 2000) {
            temp = " Seribu" + terbilang(nilai - 1000);
        } else if (nilai < 1000000) {
            temp = terbilang(Math.floor(nilai / 1000)) + " Ribu" + terbilang(nilai % 1000);
        } else if (nilai < 1000000000) {
            temp = terbilang(Math.floor(nilai / 1000000)) + " Juta" + terbilang(nilai % 1000000);
        }
        return temp.trim();
    };

    // Load Live Public Stats for Dashboard
    useEffect(() => {
        const fetchDashboardStats = async () => {
            try {
                const [swimmerRes, entriesRes, clubsRes] = await Promise.all([
                    supabase.from('swimmers').select('id', { count: 'exact', head: true }),
                    supabase.from('event_entries').select('swimmer_id', { count: 'exact', head: true }),
                    supabase.from('swimmers').select('club')
                ]);
                
                let uniqueClubs = 0;
                if (clubsRes.data) {
                    const clubsSet = new Set(clubsRes.data.map(s => s.club?.trim().toLowerCase()).filter(Boolean));
                    uniqueClubs = clubsSet.size;
                }
                
                setStats({
                    totalSwimmers: swimmerRes.count || 0,
                    totalEntries: entriesRes.count || 0,
                    totalClubs: uniqueClubs
                });
            } catch (err) {
                console.error("Gagal memuat stats registrasi:", err);
            }
        };
        fetchDashboardStats();
    }, [regType]);

    const handleSearchStatus = async (query: string) => {
        if (!query.trim()) return;
        setIsSearchingStatus(true);
        setHasSearched(true);
        try {
            const { data, error: swimmerErr } = await supabase
                .from('swimmers')
                .select(`
                    id,
                    name,
                    birth_year,
                    gender,
                    club,
                    age_group,
                    payment_amount,
                    pic_name,
                    pic_phone,
                    event_entries(event_id, seed_time)
                `)
                .or(`name.ilike.%${query}%,club.ilike.%${query}%`)
                .order('name', { ascending: true })
                .limit(20);
                
            if (swimmerErr) throw swimmerErr;
            setStatusSearchResults(data || []);
            setRegType('CHECK_STATUS');
        } catch (err) {
            console.error("Gagal melakukan pencarian status pendaftaran:", err);
        } finally {
            setIsSearchingStatus(false);
        }
    };

    const uploadBlobToStorage = async (blob: Blob, type: 'INDIVIDUAL' | 'TEAM'): Promise<string> => {
        const fileExt = 'webp';
        const folder = type === 'INDIVIDUAL' ? 'individual' : 'team';
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        
        const { data, error: uploadError } = await supabase.storage
            .from('payment-proofs')
            .upload(fileName, blob, {
                contentType: 'image/webp',
                cacheControl: '3600',
                upsert: true
            });
            
        if (uploadError) {
            throw new Error(`Gagal mengunggah bukti pembayaran ke Storage: ${uploadError.message}`);
        }
        
        return data.path; // Return the relative file path to save in DB
    };

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState<React.ReactNode | string>('');
    const [openAccordion, setOpenAccordion] = useState<SwimStyle | null>(null);

    const ageOptions = useMemo(() => {
        if (competitionInfo?.ageGroups) {
            return competitionInfo.ageGroups.split('\n').map(s => s.trim()).filter(Boolean);
        }
        return AGE_GROUP_OPTIONS;
    }, [competitionInfo]);

    useEffect(() => {
        if (events && events.length > 0) {
            setLocalEvents(events);
            setIsDataLoading(false);
        } else {
            const fetchEvents = async () => {
                setIsDataLoading(true);
                try {
                    const onlineEvents = await getEventsForRegistration();
                    setLocalEvents(onlineEvents);
                    localStorage.setItem('react_cached_registration_events', JSON.stringify(onlineEvents));
                } catch (err) {
                    console.error("Failed to fetch registration events:", err);
                } finally {
                    setIsDataLoading(false);
                }
            };
            fetchEvents();
        }
    }, [events]);

    const maxAllowedEvents = useMemo(() => {
        if (competitionInfo?.isFree) return 999;
        const amount = parseInt(formData.paymentAmount) || 0;
        const fee = competitionInfo?.feePerEvent || 0;
        if (fee <= 0) return 0;
        return Math.floor(amount / fee);
    }, [formData.paymentAmount, competitionInfo]);

    const selectedEventCount = useMemo(() => {
        return Object.values(selectedEvents).filter((e: any) => e.selected).length;
    }, [selectedEvents]);

    const isPaymentStepValid = useMemo(() => {
        if (competitionInfo?.isFree) return true;
        const amount = regType === 'INDIVIDUAL' ? formData.paymentAmount : teamFormData.paymentAmount;
        const feePerNo = competitionInfo?.feePerEvent || 0;
        return parseInt(amount) >= feePerNo;
    }, [formData, teamFormData, regType, competitionInfo]);

    const isTeamInfoFilled = useMemo(() => {
        return teamFormData.clubName.trim() !== '' && 
               teamFormData.picName.trim() !== '' && 
               teamFormData.picPhone.trim() !== '';
    }, [teamFormData.clubName, teamFormData.picName, teamFormData.picPhone]);

    const validationErrors = useMemo(() => {
        const errors: string[] = [];
        if (regType === 'INDIVIDUAL') {
            if (!formData.name.trim()) errors.push("Nama Lengkap belum diisi");
            if (!formData.club.trim()) errors.push("Nama Tim/Klub belum diisi");
            if (!formData.ageGroup) errors.push("Kelompok Umur belum dipilih");
            if (!formData.picPhone.trim()) errors.push("Nomor HP/WA belum diisi");
            
            if (!competitionInfo?.isFree) {
                const amount = parseInt(formData.paymentAmount) || 0;
                const feePerNo = competitionInfo?.feePerEvent || 0;
                if (amount < feePerNo) errors.push("Nominal bayar belum mencukupi untuk minimal 1 nomor");
                if (formData.paymentProof && !isIndividualConfirmed) {
                    errors.push("Pemeriksaan & Konfirmasi Bukti Bayar wajib diselesaikan.");
                }
            }
            
            if (selectedEventCount === 0) {
                errors.push("Belum memilih nomor lomba");
            } else if (!competitionInfo?.isFree && selectedEventCount > maxAllowedEvents) {
                errors.push("Jumlah nomor lomba melebihi kuota pembayaran");
            }
        } else if (regType === 'TEAM') {
            if (!teamFormData.clubName.trim()) errors.push("Nama Tim/Klub belum diisi");
            if (!teamFormData.picName.trim()) errors.push("Nama PIC belum diisi");
            if (!teamFormData.picPhone.trim()) errors.push("Nomor HP/WA PIC belum diisi");
            
            if (!competitionInfo?.isFree) {
                const amount = parseInt(teamFormData.paymentAmount) || 0;
                if (amount <= 0) errors.push("Nominal bayar belum diisi");
                if (teamFormData.paymentProof && !isTeamConfirmed) {
                    errors.push("Pemeriksaan & Konfirmasi Bukti Bayar wajib diselesaikan.");
                }
            }
            
            if (teamParticipants.length === 0) {
                errors.push("Belum ada data atlet (Unggah Excel)");
            }
        }
        return errors;
    }, [formData, teamFormData, regType, selectedEventCount, maxAllowedEvents, isPaymentStepValid, teamParticipants, competitionInfo, isIndividualConfirmed, isTeamConfirmed]);

    const isFormValid = validationErrors.length === 0;

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        // Reset selected events when ageGroup or gender changes to prevent mismatch
        if (name === 'ageGroup' || name === 'gender') {
            setSelectedEvents({});
        }

        if (name === 'name') {
            setExistingSwimmerId(null); // Reset when name changes
            setRegisteredEventIds([]); // Reset existing registrations
        }

        if (name === 'paymentAmount') {
            setIsIndividualConfirmed(false);
            setTempIndividualCheck1(false);
            setTempIndividualCheck2(false);
        }

        setFormData(prev => ({ ...prev, [name]: (name === 'name' || name === 'club') ? toTitleCase(value) : value }));
    };

    const handleNameBlur = async () => {
        if (!formData.name.trim()) return;
        try {
            const swimmer = await findSwimmerByName(formData.name.trim());
            if (swimmer) {
                setExistingSwimmerId(swimmer.id);
                // Fetch registered events
                const existingEvents = await getSwimmerRegisteredEventIds(swimmer.id);
                setRegisteredEventIds(existingEvents);
                
                setFormData(prev => ({
                    ...prev,
                    club: swimmer.club,
                    gender: swimmer.gender,
                    birthYear: swimmer.birthYear,
                    ageGroup: swimmer.ageGroup || prev.ageGroup,
                }));
            } else {
                setRegisteredEventIds([]);
            }
        } catch (err) {
            console.error("Lookup swimmer failed:", err);
        }
    };

    const handleTeamFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'paymentAmount') {
            setIsTeamConfirmed(false);
            setTempTeamCheck1(false);
            setTempTeamCheck2(false);
        }
        setTeamFormData(prev => ({ ...prev, [name]: (name === 'clubName' || name === 'picName') ? toTitleCase(value) : value }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsCompressing(true);
        setError('');
        try {
            // Compress image client side to WebP with target size 10-30KB
            const compressed = await compressImage(file);
            const previewUrl = URL.createObjectURL(compressed);

            if (regType === 'INDIVIDUAL') {
                setIndividualCompressedBlob(compressed);
                setIndividualPreviewUrl(previewUrl);
                setIsIndividualConfirmed(false);
                setTempIndividualCheck1(false);
                setTempIndividualCheck2(false);
                // Set a non-null string placeholder in the form state to satisfy validations
                setFormData(prev => ({ ...prev, paymentProof: 'PENDING_UPLOAD' }));
            } else {
                setTeamCompressedBlob(compressed);
                setTeamPreviewUrl(previewUrl);
                setIsTeamConfirmed(false);
                setTempTeamCheck1(false);
                setTempTeamCheck2(false);
                // Set a non-null string placeholder in the form state to satisfy validations
                setTeamFormData(prev => ({ ...prev, paymentProof: 'PENDING_UPLOAD' }));
            }
        } catch (err: any) {
            console.error("Compression error:", err);
            setError("Gagal mengompresi gambar: " + err.message);
        } finally {
            setIsCompressing(false);
        }
    };

    // Collective Registration Helpers
    const downloadTeamTemplate = async () => {
        if (typeof ExcelJS === 'undefined') {
            alert('Pustaka ExcelJS belum termuat. Silakan tunggu sebentar atau muat ulang halaman.');
            return;
        }

        try {
            console.log('Generating Excel template...');
            const workbook = new ExcelJS.Workbook();
            
            // 1. Prepare DataMaster Sheet
            const wsMaster = workbook.addWorksheet('DataMaster');
            const allKUs = [...ageOptions];
            const eventsByCategory: { [key: string]: string[] } = {};
            allKUs.forEach(ku => {
                eventsByCategory[ku] = localEvents
                    .filter(e => !e.category || e.category === ku)
                    .map(e => formatEventName(e));
            });

            // Header for DataMaster
            // Col A: Daftar KU, Col B, C, D...: Events per KU
            const masterHeaders = ["DAFTAR_KU", ...allKUs];
            wsMaster.addRow(masterHeaders);

            const maxLen = Math.max(allKUs.length, ...Object.values(eventsByCategory).map(arr => arr.length));
            for (let i = 0; i < maxLen; i++) {
                const rowData = [allKUs[i] || ""];
                allKUs.forEach(ku => {
                    rowData.push(eventsByCategory[ku][i] || "");
                });
                wsMaster.addRow(rowData);
            }

            // Define Named Range for the KU List (Column A)
            workbook.definedNames.add(`DataMaster!$A$2:$A$${allKUs.length + 1}`, 'DAFTAR_KU_LIST');

            // Define individual Event Lists for each KU (Column B, C, D...)
            allKUs.forEach((ku, idx) => {
                // Column B is index 1, Column C is index 2...
                let colLetter = "";
                if (typeof XLSX !== 'undefined' && XLSX.utils && XLSX.utils.encode_col) {
                    colLetter = XLSX.utils.encode_col(idx + 1);
                } else {
                    // Manual Column Letter Calculation (A=0, B=1, etc.)
                    let tempIdx = idx + 1;
                    while (tempIdx >= 0) {
                        colLetter = String.fromCharCode((tempIdx % 26) + 65) + colLetter;
                        tempIdx = Math.floor(tempIdx / 26) - 1;
                    }
                }
                
                const eventCount = eventsByCategory[ku].length;
                if (eventCount > 0) {
                    // Named ranges: LOMBA_1, LOMBA_2, etc. corresponding to order in DAFTAR_KU_LIST
                    workbook.definedNames.add(`DataMaster!$${colLetter}$2:$${colLetter}$${eventCount + 1}`, `LOMBA_${idx + 1}`);
                }
            });

            // 2. Prepare Form Pendaftaran Sheet
            const wsForm = workbook.addWorksheet('Form Pendaftaran');
            const headers = [
                "* Nama Atlet", 
                "* Tahun Lahir", 
                "* Jenis Kelamin (L/P)", 
                "* KU (Kelompok Umur)", 
                "* Nomor Lomba", 
                "* Waktu Unggulan (MM:SS.ss)"
            ];

            const headerRow = wsForm.addRow(headers);
            headerRow.font = { bold: true };
            headerRow.alignment = { horizontal: 'center' };

            // Sample data (CONTOH)
            wsForm.addRow(["CONTOH ATLET 1", 2012, "P", allKUs[0] || "", eventsByCategory[allKUs[0]]?.[0] || "", "00:35.50"]);
            wsForm.addRow(["CONTOH ATLET 2", 2013, "L", allKUs[1] || allKUs[0], eventsByCategory[allKUs[1] || allKUs[0]]?.[0] || "", "00:45.00"]);

            // Column widths
            wsForm.getColumn(1).width = 35;
            wsForm.getColumn(2).width = 15;
            wsForm.getColumn(3).width = 20;
            wsForm.getColumn(4).width = 25;
            wsForm.getColumn(5).width = 55;
            wsForm.getColumn(6).width = 30;

            // Data Validation (Dropdowns & Constraints)
            const maxRows = 500;
            const currentYear = new Date().getFullYear();
            for (let i = 2; i <= maxRows; i++) {
                // Nama Atlet (Not Empty)
                wsForm.getCell(`A${i}`).dataValidation = {
                    type: 'textLength',
                    allowBlank: false,
                    operator: 'greaterThan',
                    formulae: [2],
                    showErrorMessage: true,
                    errorTitle: 'Nama Terlalu Pendek',
                    error: 'Masukkan nama atlet minimal 3 karakter.'
                };

                // Tahun Lahir (Must be number)
                wsForm.getCell(`B${i}`).dataValidation = {
                    type: 'whole',
                    operator: 'between',
                    allowBlank: true,
                    formulae: [1950, currentYear],
                    showErrorMessage: true,
                    errorTitle: 'Tahun Tidak Valid',
                    error: `Masukkan tahun lahir antara 1950 dan ${currentYear}.`
                };

                // Gender Dropdown
                wsForm.getCell(`C${i}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['"L,P"'],
                    showErrorMessage: true,
                    errorTitle: 'Salah Pilihan',
                    error: 'Gunakan "L" untuk Laki-laki atau "P" untuk Perempuan.'
                };

                // KU Dropdown
                wsForm.getCell(`D${i}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['DAFTAR_KU_LIST'],
                    showErrorMessage: true,
                    errorTitle: 'Pilih KU',
                    error: 'Pilih Kelompok Umur dari daftar yang tersedia.'
                };

                // Nomor Lomba Dropdown (DEPENDENT)
                // Formula: =INDIRECT("LOMBA_" & MATCH($D2, DAFTAR_KU_LIST, 0))
                const dependentFormula = `INDIRECT("LOMBA_" & MATCH($D${i}, DAFTAR_KU_LIST, 0))`;
                wsForm.getCell(`E${i}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: [dependentFormula],
                    showErrorMessage: true,
                    errorTitle: 'Salah Pilih KU',
                    error: 'Silakan pilih Kelompok Umur (KU) di kolom D terlebih dahulu agar nomor gaya muncul.'
                };

                // Waktu Unggulan Validation (MM:SS.ss)
                // Formula checks: Length 8, position 3 is ":", position 6 is "."
                const timeFormula = `AND(LEN($F${i})=8, MID($F${i},3,1)=":", MID($F${i},6,1)=".")`;
                wsForm.getCell(`F${i}`).dataValidation = {
                    type: 'custom',
                    allowBlank: true,
                    formulae: [timeFormula],
                    showErrorMessage: true,
                    errorTitle: 'Format Waktu Salah',
                    error: 'Gunakan format MM:SS.ss (contoh: 00:35.50). Pastikan tepat 8 karakter termasuk titik dan titik dua.'
                };
            }

            console.log('Writing Excel file...');
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const clubCleanName = (teamFormData.clubName || "Klub").replace(/[^a-zA-Z0-9]/g, '_');
            anchor.download = `Template_Kolektif_${clubCleanName}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
            console.log('Download complete.');
        } catch (err: any) {
            console.error('Download error:', err);
            alert('Gagal mengunduh template: ' + err.message);
        }
    };

    const handleTeamExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingExcel(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const sheet = workbook.Sheets[workbook.SheetNames.find(n => n.includes("Form")) || workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);

                const processed = json.map((row: any) => {
                    // Support both new and old header names
                    const name = row["* Nama Atlet"] || row["Nama Atlet"];
                    const birthYear = row["* Tahun Lahir"] || row["Tahun Lahir"];
                    const gender = row["* Jenis Kelamin (L/P)"] || row["Jenis Kelamin (L/P)"];
                    const ku = row["* KU (Kelompok Umur)"] || row["KU (Kelompok Umur)"] || row["KU"];
                    const eventName = row["* Nomor Lomba"] || row["Nomor Lomba"];
                    const timeHeader = row["* Waktu Unggulan (MM:SS.ss)"] || row["Waktu Unggulan (MM:SS.ss)"] || row["Waktu Unggulan (mm:ss.SS)"];

                    const event = localEvents.find(e => formatEventName(e) === eventName);
                    
                    // Parse time string "MM:SS.ss"
                    let ms = 0;
                    const timeStr = String(timeHeader || "99:99.99");
                    if (timeStr.includes(":")) {
                        const [min, rest] = timeStr.split(":");
                        const [sec, centi] = rest.split(".");
                        ms = (parseInt(min) * 60000) + (parseInt(sec) * 1000) + (parseInt(centi) * 10);
                    }

                    return {
                        name: toTitleCase(String(name || "")),
                        birthYear: parseInt(birthYear),
                        gender: String(gender || "").toUpperCase() === "L" ? "L" : "P",
                        ageGroup: ku,
                        eventName: eventName,
                        eventId: event?.id,
                        seedTimeMs: ms,
                        displayTime: timeStr
                    };
                }).filter((p: any) => p.name && p.eventId);

                setTeamParticipants(processed);
                
                // Auto calculate amount
                const totalEvents = processed.length;
                const totalCost = competitionInfo?.isFree ? 0 : totalEvents * (competitionInfo?.feePerEvent || 0);
                setTeamFormData(prev => ({ ...prev, paymentAmount: String(totalCost) }));

            } catch (err) {
                alert("Gagal memproses file Excel. Pastikan format kolom sesuai template.");
            } finally {
                setIsParsingExcel(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            let uploadedPath = null;
            if (!competitionInfo?.isFree) {
                if (regType === 'INDIVIDUAL') {
                    if (!individualCompressedBlob) {
                        throw new Error("Bukti pembayaran belum diunggah atau sedang dikompres.");
                    }
                    uploadedPath = await uploadBlobToStorage(individualCompressedBlob, 'INDIVIDUAL');
                } else {
                    if (!teamCompressedBlob) {
                        throw new Error("Bukti pembayaran belum diunggah atau sedang dikompres.");
                    }
                    uploadedPath = await uploadBlobToStorage(teamCompressedBlob, 'TEAM');
                }
            }

            if (regType === 'INDIVIDUAL') {
                const registrationsToSubmit = (Object.entries(selectedEvents) as [string, any][])
                    .filter(([_, val]) => val.selected)
                    .map(([eventId, val]) => ({
                        eventId,
                        seedTime: parseTimeToMs(val.time),
                    }));

                const result = await processOnlineRegistration({
                    name: formData.name,
                    birthYear: formData.birthYear,
                    gender: formData.gender,
                    club: formData.club,
                    ageGroup: formData.ageGroup,
                    paymentProof: competitionInfo?.isFree ? null : uploadedPath,
                    paymentAmount: competitionInfo?.isFree ? 0 : parseInt(formData.paymentAmount) || 0,
                    picName: formData.name, // Self PIC
                    picPhone: formData.picPhone
                }, registrationsToSubmit);

                if (result.success) {
                    setSuccessMessage(
                        <div className="space-y-4 text-black">
                            <p className="text-xl font-medium">Pendaftaran atlet <span className="font-black text-primary uppercase">{formData.name}</span> berhasil!</p>
                            <div className="text-left mt-6 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-border shadow-inner">
                                <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-4 opacity-70">Nomor Lomba & Waktu Unggulan:</p>
                                <div className="space-y-3">
                                    {summaryList.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-border shadow-sm">
                                            <span className="font-black text-sm text-text-primary tracking-tight">{item.name}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-tighter">Waktu:</span>
                                                <span className="font-mono text-sm bg-primary/5 text-primary font-black px-3 py-1 rounded-lg border border-primary/20">{item.time}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 pt-4 border-t border-dashed border-primary/30 flex justify-between items-center px-2">
                                    <span className="text-xs font-bold text-text-secondary uppercase">Total Bayar:</span>
                                    <span className="text-xl font-black text-primary">
                                        {competitionInfo?.isFree ? 'GRATIS' : `Rp ${parseInt(formData.paymentAmount || '0').toLocaleString('id-ID')}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                    onRegistrationSuccess();
                } else {
                    setError(result.message);
                }
            } else {
                // TEAM SUBMISSION
                if (teamParticipants.length === 0) throw new Error("Belum ada data atlet yang diunggah.");
                
                const result = await processCollectiveRegistration({
                    clubName: teamFormData.clubName,
                    picName: teamFormData.picName,
                    picPhone: teamFormData.picPhone,
                    paymentProof: competitionInfo?.isFree ? null : uploadedPath,
                    paymentAmount: competitionInfo?.isFree ? 0 : parseInt(teamFormData.paymentAmount) || 0
                }, teamParticipants);

                if (result.success) {
                    setSuccessMessage(
                        <div className="space-y-4 text-black">
                            <p className="text-xl font-medium">Berhasil mendaftarkan tim <span className="font-black text-primary uppercase">{teamFormData.clubName}</span>!</p>
                            <div className="text-left mt-6 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-border shadow-inner max-h-[400px] overflow-y-auto">
                                <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-4 opacity-70">Ringkasan Pendaftaran Kolektif:</p>
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-border shadow-sm text-center">
                                        <p className="text-[9px] font-black text-text-secondary uppercase">Atlet</p>
                                        <p className="text-xl font-black text-primary">{new Set(teamParticipants.map(p => p.name)).size}</p>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-border shadow-sm text-center">
                                        <p className="text-[9px] font-black text-text-secondary uppercase">Nomor</p>
                                        <p className="text-xl font-black text-primary">{teamParticipants.length}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {teamParticipants.slice(0, 10).map((p, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 px-4 py-3 rounded-xl border border-border shadow-sm">
                                            <div className="flex flex-col">
                                                <span className="font-black text-[11px] text-text-primary leading-tight">{p.name}</span>
                                                <span className="text-[9px] text-text-secondary opacity-70 truncate max-w-[150px]">{p.eventName}</span>
                                            </div>
                                            <span className="font-mono text-[11px] bg-primary/5 text-primary font-black px-2 py-0.5 rounded border border-primary/10">{p.displayTime}</span>
                                        </div>
                                    ))}
                                    {teamParticipants.length > 10 && <p className="text-[10px] text-center italic opacity-50 pt-2">... dan {teamParticipants.length - 10} entri lainnya</p>}
                                </div>
                                <div className="mt-6 pt-4 border-t border-dashed border-primary/30 flex justify-between items-center px-2">
                                    <span className="text-xs font-bold text-text-secondary uppercase">Total Bayar:</span>
                                    <span className="text-xl font-black text-primary">
                                        {competitionInfo?.isFree ? 'GRATIS' : `Rp ${parseInt(teamFormData.paymentAmount || '0').toLocaleString('id-ID')}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                    onRegistrationSuccess();
                } else {
                    setError(result.message);
                }
            }
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const handleEventSelectionChange = async (eventId: string) => {
        const isCurrentlySelected = !!selectedEvents[eventId]?.selected;
        if (!isCurrentlySelected && selectedEventCount >= maxAllowedEvents && !competitionInfo?.isFree) {
            alert(`Kuota pemilihan nomor sudah habis sesuai nominal transfer Rp ${parseInt(formData.paymentAmount).toLocaleString('id-ID')}.`);
            return;
        }

        const newSelectedEvents = { ...selectedEvents };
        const newIsSelected = !isCurrentlySelected;

        if (newIsSelected) {
            let seedTimeData = { min: '99', sec: '99', ms: '99' };

            // AUTO ADAPT: Ambil data & waktu terbaik otomatis
            if (existingSwimmerId) {
                const event = localEvents.find(e => e.id === eventId);
                if (event) {
                    const bestTimeMs = await getSwimmerBestTime(existingSwimmerId, event.distance, event.style);
                    if (bestTimeMs > 0) {
                        const totalSeconds = Math.floor(bestTimeMs / 1000);
                        const min = Math.floor(totalSeconds / 60);
                        const sec = totalSeconds % 60;
                        const ms = Math.floor((bestTimeMs % 1000) / 10);
                        seedTimeData = {
                            min: String(min).padStart(2, '0'),
                            sec: String(sec).padStart(2, '0'),
                            ms: String(ms).padStart(2, '0')
                        };
                    }
                }
            }

            newSelectedEvents[eventId] = {
                selected: true,
                time: seedTimeData
            };
        } else {
            newSelectedEvents[eventId] = {
                ...newSelectedEvents[eventId],
                selected: false
            };
        }

        setSelectedEvents(newSelectedEvents);
    };

    const handleTimeChange = (eventId: string, part: keyof RegistrationTime, value: string) => {
        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                ...prev[eventId],
                time: { ...prev[eventId].time, [part]: value },
            },
        }));
    };

    const groupedAvailableEvents = useMemo(() => {
        return localEvents
            .filter(e => {
                const genderMatch = e.gender === "Mixed" || 
                                   (formData.gender === "Male" && e.gender === "Men's") || 
                                   (formData.gender === "Female" && e.gender === "Women's");
                
                const isRegistered = registeredEventIds.includes(e.id);
                
                return genderMatch && (!e.category || e.category === formData.ageGroup) && !isRegistered;
            })
            .reduce((acc, event) => {
                if (!acc[event.style]) acc[event.style] = [];
                acc[event.style].push(event);
                return acc;
            }, {} as Record<string, SwimEvent[]>);
    }, [localEvents, formData.gender, formData.ageGroup, registeredEventIds]);

    const summaryList = useMemo(() => {
        return (Object.entries(selectedEvents) as [string, any][])
            .filter(([_, val]) => val.selected)
            .map(([eventId, val]) => {
                const event = localEvents.find(e => e.id === eventId);
                return {
                    name: event ? formatEventName(event) : 'Unknown Event',
                    time: `${val.time.min.padStart(2, '0')}:${val.time.sec.padStart(2, '0')}.${val.time.ms.padEnd(2, '0').slice(0, 2)}`
                };
            });
    }, [selectedEvents, localEvents]);

    if (isDataLoading) return <div className="flex justify-center p-20"><Spinner /></div>;

    const isFree = competitionInfo?.isFree ?? false;

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center py-6">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="mx-auto h-20 mb-4" />}
                    <h1 className="text-3xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <h3 className="text-xl font-bold mt-2 opacity-80 uppercase tracking-widest">Pendaftaran Online</h3>
                    {isFree && <span className="inline-block mt-2 bg-green-500 text-white px-4 py-1 rounded-full text-xs font-black animate-pulse">PENDAFTARAN GRATIS</span>}
                    {competitionInfo?.registrationDeadline && (
                        <CountdownTimer deadline={competitionInfo.registrationDeadline} />
                    )}
                </header>

                {regType === 'CHOICE' && (
                    <div className="space-y-8 mt-6">
                        {/* STATS ROW (DASHBOARD) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-white/10 shadow-sm flex items-center gap-4">
                                <div className="p-3 bg-sky-500/10 rounded-2xl text-2xl">🏊</div>
                                <div>
                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest leading-none">Total Atlet</p>
                                    <p className="text-2xl font-black text-primary mt-1">{stats.totalSwimmers} <span className="text-xs font-semibold text-text-secondary">Orang</span></p>
                                </div>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-white/10 shadow-sm flex items-center gap-4">
                                <div className="p-3 bg-emerald-500/10 rounded-2xl text-2xl">🛡️</div>
                                <div>
                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest leading-none">Total Klub / Tim</p>
                                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.totalClubs} <span className="text-xs font-semibold text-text-secondary">Klub</span></p>
                                </div>
                            </div>
                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-white/10 shadow-sm flex items-center gap-4">
                                <div className="p-3 bg-indigo-500/10 rounded-2xl text-2xl">📝</div>
                                <div>
                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest leading-none">Nomor Diikuti</p>
                                    <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{stats.totalEntries} <span className="text-xs font-semibold text-text-secondary">Entries</span></p>
                                </div>
                            </div>
                        </div>

                        {/* CEPAT LOOKUP / SEARCH BOX */}
                        <Card className="p-6 md:p-8 shadow-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-primary/20 rounded-3xl">
                            <h3 className="text-lg font-black text-primary uppercase tracking-tight flex items-center gap-2 mb-3">
                                <span>🔍</span> Cek Status & Riwayat Registrasi Atlet / Klub
                            </h3>
                            <p className="text-xs text-text-secondary font-semibold mb-4 leading-relaxed">
                                Masukkan nama atlet atau nama klub Anda pada kotak pencarian di bawah ini untuk melihat daftar nomor lomba yang telah terdaftar serta status verifikasi pembayaran secara real-time.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1 relative">
                                    <input 
                                        type="text" 
                                        placeholder="Ketik nama atlet atau klub (Contoh: Sidoarjo Swim Club)..." 
                                        value={statusSearchQuery} 
                                        onChange={(e) => setStatusSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSearchStatus(statusSearchQuery);
                                        }}
                                        className="w-full pl-5 pr-12 py-4 bg-background border border-border rounded-2xl font-semibold shadow-inner text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
                                    />
                                    {statusSearchQuery && (
                                        <button 
                                            onClick={() => setStatusSearchQuery('')}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary font-bold text-sm bg-surface w-6 h-6 rounded-full flex items-center justify-center border border-border"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <Button 
                                    onClick={() => handleSearchStatus(statusSearchQuery)}
                                    disabled={isSearchingStatus || !statusSearchQuery.trim()}
                                    className="py-4 px-8 rounded-2xl font-black flex items-center justify-center gap-2 text-sm shrink-0 shadow-lg"
                                >
                                    {isSearchingStatus ? <Spinner /> : <span>Cari Atlet</span>}
                                </Button>
                            </div>
                        </Card>

                        {/* UTAMA CARD LAYOUT */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.99] group shadow-xl bg-white/90 dark:bg-slate-800/90 rounded-[2rem] flex flex-col justify-between" onClick={() => setRegType('INDIVIDUAL')}>
                                <div className="space-y-4">
                                    <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto text-3xl group-hover:scale-110 transition-transform">👤</div>
                                    <h3 className="text-xl font-black group-hover:text-primary transition-colors uppercase tracking-tight">PENDAFTARAN ATLET MANDIRI</h3>
                                    <p className="text-text-secondary text-xs font-semibold leading-relaxed">
                                        Gunakan menu ini jika Anda ingin mendaftarkan atlet satu per satu secara langsung dengan memilih nomor lomba secara manual di browser.
                                    </p>
                                </div>
                                <div className="mt-6">
                                    <span className="inline-block bg-primary/10 text-primary px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider group-hover:bg-primary group-hover:text-white transition-colors">Daftar Sekarang &rarr;</span>
                                </div>
                            </Card>

                            <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.99] group shadow-xl bg-white/90 dark:bg-slate-800/90 rounded-[2rem] flex flex-col justify-between" onClick={() => setRegType('TEAM')}>
                                <div className="space-y-4">
                                    <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mx-auto text-3xl group-hover:scale-110 transition-transform">👥</div>
                                    <h3 className="text-xl font-black group-hover:text-emerald-500 transition-colors uppercase tracking-tight">PENDAFTARAN KOLEKTIF (EXCEL)</h3>
                                    <p className="text-text-secondary text-xs font-semibold leading-relaxed">
                                        Gunakan menu ini untuk mendaftarkan atlet dalam jumlah besar (Klub atau Tim) menggunakan unggahan file Excel. Template pengisian otomatis disediakan.
                                    </p>
                                </div>
                                <div className="mt-6">
                                    <span className="inline-block bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider group-hover:bg-emerald-500 group-hover:text-white transition-colors">Daftar Kolektif &rarr;</span>
                                </div>
                            </Card>
                        </div>

                        {/* ACARA & KATEGORI WIDGET */}
                        <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md p-6 rounded-[2rem] border border-white/40 dark:border-white/5 shadow-sm text-center">
                            <p className="text-xs text-text-secondary font-bold uppercase tracking-widest">Informasi Lomba & Acara Tersedia</p>
                            <p className="text-text-secondary text-xs font-medium mt-1">Ingin melihat daftar jarak dan nomor perlombaan yang dibuka?</p>
                            <button 
                                onClick={() => setRegType('EVENTS_LIST')}
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-primary hover:underline hover:scale-105 transition-all"
                            >
                                <span>🏊 Explore Daftar Nomor Perlombaan</span> &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {regType === 'CHECK_STATUS' && (
                    <div className="space-y-6 mt-6 pb-20">
                        <div className="flex justify-between items-center">
                            <Button variant="secondary" onClick={() => { setRegType('CHOICE'); setStatusSearchResults([]); setStatusSearchQuery(''); setHasSearched(false); }}>
                                &larr; Kembali ke Dashboard
                            </Button>
                            <span className="text-xs font-black text-text-secondary uppercase tracking-widest bg-white/40 px-3 py-1.5 rounded-xl border border-border">
                                Mode: Cek Status
                            </span>
                        </div>

                        {/* SEARCH IN-PAGE BAR */}
                        <Card className="p-6 shadow-md bg-white dark:bg-slate-800">
                            <h3 className="text-sm font-black text-primary uppercase mb-2 flex items-center gap-2">
                                <span>🔍</span> Cari Atlet / Klub Lain
                            </h3>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input 
                                    type="text" 
                                    placeholder="Masukkan nama atlet atau klub..." 
                                    value={statusSearchQuery} 
                                    onChange={(e) => setStatusSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSearchStatus(statusSearchQuery);
                                    }}
                                    className="flex-1 px-4 py-3 bg-background border border-border rounded-xl font-semibold shadow-inner text-text-primary focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                                <Button 
                                    onClick={() => handleSearchStatus(statusSearchQuery)}
                                    disabled={isSearchingStatus || !statusSearchQuery.trim()}
                                    className="py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 text-xs"
                                >
                                    {isSearchingStatus ? <Spinner /> : <span>Cari</span>}
                                </Button>
                            </div>
                        </Card>

                        {/* RESULTS BLOCK */}
                        {isSearchingStatus ? (
                            <div className="flex justify-center p-20"><Spinner /></div>
                        ) : statusSearchResults.length === 0 ? (
                            <Card className="text-center p-12 bg-white dark:bg-slate-800">
                                <span className="text-5xl">🤷</span>
                                <h3 className="text-xl font-black mt-4 text-text-primary uppercase">Tidak Ada Hasil</h3>
                                <p className="text-text-secondary mt-2 text-sm max-w-md mx-auto">
                                    Tidak ada atlet atau klub terdaftar yang cocok dengan kata kunci <span className="font-bold text-primary">"{statusSearchQuery}"</span>. Harap periksa ejaan nama atau daftar baru sekarang.
                                </p>
                            </Card>
                        ) : (
                            <div className="space-y-6">
                                <p className="text-xs font-black text-text-secondary uppercase tracking-wider">Ditemukan {statusSearchResults.length} data pendaftaran:</p>
                                <div className="grid grid-cols-1 gap-6">
                                    {statusSearchResults.map((swimmer: any) => {
                                        const totalAmount = swimmer.payment_amount || 0;
                                        const hasEntries = swimmer.event_entries && swimmer.event_entries.length > 0;
                                        
                                        return (
                                            <Card key={swimmer.id} className="p-6 shadow-lg bg-white dark:bg-slate-800 border-l-4 border-l-primary flex flex-col md:flex-row justify-between gap-6">
                                                <div className="space-y-4 flex-1">
                                                    <div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black uppercase text-lg">
                                                                {swimmer.name.charAt(0)}
                                                            </span>
                                                            <div>
                                                                <h4 className="text-xl font-black text-text-primary uppercase tracking-tight leading-none">{swimmer.name}</h4>
                                                                <p className="text-sm font-bold text-primary uppercase tracking-wider mt-1">{swimmer.club || 'Independen'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-text-secondary border-t border-dashed border-border pt-3">
                                                            <span>📅 Lahir: <span className="text-text-primary font-bold">{swimmer.birth_year || '-'}</span></span>
                                                            <span>• Kelompok Umur: <span className="text-text-primary font-bold">{swimmer.age_group || '-'}</span></span>
                                                            <span>• Kelamin: <span className="text-text-primary font-bold">{swimmer.gender === 'Male' ? 'Laki-laki' : 'Perempuan'}</span></span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider">Nomor Lomba Yang Diikuti ({swimmer.event_entries?.length || 0}):</p>
                                                        {hasEntries ? (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {swimmer.event_entries.map((entry: any, i: number) => {
                                                                    const ev = localEvents.find(e => e.id === entry.event_id);
                                                                    return ev ? (
                                                                        <div key={i} className="flex justify-between items-center bg-background/50 p-2.5 rounded-xl border border-border text-xs">
                                                                            <span className="font-bold text-text-primary leading-tight truncate">{formatEventName(ev)}</span>
                                                                            <span className="font-mono text-xs bg-primary/5 text-primary font-black px-2 py-0.5 rounded border border-primary/10 select-none shrink-0">
                                                                                {entry.seed_time > 0 ? formatTime(entry.seed_time) : 'No Time'}
                                                                            </span>
                                                                        </div>
                                                                    ) : null;
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-text-secondary italic">Belum memilih nomor lomba.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="md:w-64 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6 flex flex-col justify-between shrink-0">
                                                    <div className="space-y-3">
                                                        <p className="text-[10px] font-black text-text-secondary uppercase tracking-wider">Status Pembayaran</p>
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-text-secondary font-bold">Nominal Terdaftar:</p>
                                                            <p className="text-2xl font-black text-text-primary tracking-tight">
                                                                Rp {totalAmount.toLocaleString('id-ID')}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            {totalAmount > 0 ? (
                                                                <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-black uppercase">
                                                                    ✓ Pendaftaran Terverifikasi
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-600 px-3 py-1 rounded-full text-xs font-black uppercase animate-pulse">
                                                                    ⏳ Proses Verifikasi / Gratis
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="text-[10px] text-text-secondary font-semibold italic mt-4 border-t border-dashed border-border pt-3">
                                                        PIC: {swimmer.pic_name || swimmer.name}<br />
                                                        Tel: {swimmer.pic_phone || '-'}
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {regType === 'EVENTS_LIST' && (
                    <div className="space-y-6 mt-6 pb-20">
                        <div className="flex justify-between items-center">
                            <Button variant="secondary" onClick={() => setRegType('CHOICE')}>
                                &larr; Kembali ke Dashboard
                            </Button>
                            <span className="text-xs font-black text-text-secondary uppercase tracking-widest bg-white/40 px-3 py-1.5 rounded-xl border border-border">
                                Mode: Informasi Acara
                            </span>
                        </div>

                        <Card className="p-6 md:p-8 bg-white dark:bg-slate-800 rounded-3xl shadow-lg">
                            <h3 className="text-2xl font-black text-primary uppercase tracking-tight mb-2">Daftar Nomor Perlombaan</h3>
                            <p className="text-xs text-text-secondary font-semibold leading-relaxed mb-6">
                                Di bawah ini adalah daftar lengkap nomor perlombaan yang dibuka untuk kompetisi ini. Hubungi panitia jika Anda memiliki pertanyaan terkait kelompok umur (KU) atau nomor perlombaan.
                            </p>

                            {localEvents.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-text-secondary italic">Belum ada nomor lomba yang dimasukkan oleh panitia.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {Object.entries(
                                        localEvents.reduce((acc, event) => {
                                            const key = event.category || "Semua Kelompok Umur (KU)";
                                            if (!acc[key]) acc[key] = [];
                                            acc[key].push(event);
                                            return acc;
                                        }, {} as Record<string, SwimEvent[]>)
                                    ).map(([category, eventsInCategory]: any) => (
                                        <div key={category} className="border border-border rounded-2xl overflow-hidden shadow-sm bg-background/20 p-5 space-y-3">
                                            <h4 className="font-black text-primary uppercase tracking-wider text-sm border-b border-border pb-2">
                                                🏆 Kelompok Umur: {category}
                                            </h4>
                                            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                                                {eventsInCategory.map((ev: SwimEvent) => (
                                                    <div key={ev.id} className="flex justify-between items-center bg-surface hover:bg-primary/5 transition-colors p-3 rounded-xl border border-border text-xs">
                                                        <span className="font-bold text-text-primary">{formatEventName(ev)}</span>
                                                        <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-md">
                                                            {ev.entries?.length || 0} Atlet
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {(regType === 'INDIVIDUAL' || regType === 'TEAM') && !successMessage && (
                    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
                        <div className="flex justify-start">
                            <Button variant="secondary" onClick={() => { setRegType('CHOICE'); setTeamParticipants([]); setSelectedEvents({}); }}>&larr; Kembali ke Pilihan</Button>
                        </div>

                        {regType === 'INDIVIDUAL' ? (
                            <>
                                {/* INDIVIDUAL STEPS */}
                                <Card className="shadow-xl">
                                    <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                        <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                                        Profil Atlet & Kontak
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input label="Nama Lengkap" id="name" name="name" value={formData.name} onChange={handleFormChange} onBlur={handleNameBlur} placeholder="Sesuai Akta Kelahiran" required />
                                        <Input label="Nama Tim / Klub" id="club" name="club" value={formData.club} onChange={handleFormChange} placeholder="Contoh: Sidoarjo Swim Club" required />
                                        <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                        <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                            <option value="Male">Laki-laki</option>
                                            <option value="Female">Perempuan</option>
                                        </Select>
                                        <Select label="Kelompok Umur (KU)" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange} required>
                                            <option value="">-- Pilih KU --</option>
                                            {ageOptions.map(ku => <option key={ku} value={ku}>{ku}</option>)}
                                        </Select>
                                        <Input label="Nomor HP/WA Aktif" id="picPhone" name="picPhone" type="tel" value={formData.picPhone} onChange={handleFormChange} placeholder="Contoh: 08123456789" required />
                                    </div>
                                    <p className="text-[10px] text-text-secondary italic mt-2">* Nomor HP diperlukan untuk konfirmasi pendaftaran oleh panitia.</p>
                                </Card>

                                {!isFree && (
                                    <Card className="shadow-xl border-l-4 border-l-primary">
                                        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                            <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                                            Pembayaran & Bukti Transfer
                                        </h2>
                                        <PaymentSection 
                                            info={competitionInfo} 
                                            data={formData} 
                                            onFileChange={handleFileChange} 
                                            onAmountChange={handleFormChange} 
                                            previewUrl={individualPreviewUrl}
                                            compressedBlob={individualCompressedBlob}
                                            isCompressing={isCompressing}
                                            isConfirmed={isIndividualConfirmed}
                                            onVerifyClick={() => {
                                                setShowZoomModal(true);
                                                setZoomScale(1);
                                            }}
                                            terbilang={terbilang}
                                        />
                                    </Card>
                                )}

                                <Card className="shadow-xl">
                                    <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                                        <h2 className="text-xl font-black flex items-center gap-2">
                                            <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">{isFree ? '2' : '3'}</span>
                                            Pilih Nomor Lomba
                                        </h2>
                                        {!isFree && formData.paymentAmount && (
                                            <div className="text-right bg-primary/10 px-4 py-2 rounded-xl border border-primary/20">
                                                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Sisa Kuota Pilihan</p>
                                                <p className={`text-2xl font-black ${maxAllowedEvents - selectedEventCount === 0 ? 'text-red-500' : 'text-primary'}`}>
                                                    {maxAllowedEvents - selectedEventCount} <span className="text-xs font-normal">nomor</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {!formData.ageGroup ? (
                                        <div className="text-center py-12 bg-yellow-50 rounded-2xl border border-yellow-200">
                                            <p className="text-yellow-700 font-bold">⚠️ Harap pilih Kelompok Umur di Langkah 1</p>
                                        </div>
                                    ) : (!isPaymentStepValid && !isFree) ? (
                                        <div className="text-center py-12 bg-red-50 rounded-2xl border border-red-200">
                                            <p className="text-red-700 font-bold">⚠️ Harap masukkan Nominal Transfer di Langkah 2</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]: any) => (
                                                <div key={style} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                                                    <button type="button" onClick={() => handleAccordionToggle(style)} className="w-full flex justify-between p-5 bg-surface hover:bg-primary/5 transition-colors">
                                                        <h3 className="font-black text-text-primary uppercase text-sm tracking-widest">{translateSwimStyle(style as SwimStyle)}</h3>
                                                        <ChevronDownIcon isOpen={openAccordion === style} />
                                                    </button>
                                                    {openAccordion === style && (
                                                        <div className="p-5 space-y-5 bg-background/30 border-t border-border">
                                                            {eventsInStyle.map((event: SwimEvent) => {
                                                                const isSelected = !!selectedEvents[event.id]?.selected;
                                                                const isLocked = !isSelected && selectedEventCount >= maxAllowedEvents && !isFree;
                                                                
                                                                return (
                                                                    <div key={event.id} className={`flex flex-col border-b border-border last:border-0 pb-5 last:pb-0 ${isLocked ? 'opacity-40 grayscale' : ''}`}>
                                                                        <div className="flex items-center">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                id={`check-${event.id}`}
                                                                                checked={isSelected} 
                                                                                onChange={() => handleEventSelectionChange(event.id)} 
                                                                                disabled={isLocked}
                                                                                className="h-7 w-7 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" 
                                                                            />
                                                                            <label htmlFor={`check-${event.id}`} className={`ml-4 font-bold text-text-primary cursor-pointer flex-grow text-lg ${isSelected ? 'text-primary' : ''}`}>
                                                                                {formatEventName(event)}
                                                                                {isLocked && <span className="ml-3 text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black tracking-tighter">KUOTA HABIS</span>}
                                                                            </label>
                                                                        </div>
                                                                        {isSelected && (
                                                                            <div className="mt-5 ml-11 bg-surface p-5 rounded-2xl border border-primary/20 grid grid-cols-3 gap-4 animate-in slide-in-from-left-4 duration-300">
                                                                                <div className="col-span-3 mb-1 flex items-center gap-2">
                                                                                    <span className="text-primary">⏱</span>
                                                                                    <p className="text-[10px] font-black uppercase text-text-secondary tracking-widest italic">Waktu Unggulan (Seed Time)</p>
                                                                                </div>
                                                                                <Input label="Menit" type="number" min="0" max="99" value={selectedEvents[event.id].time.min} onChange={e => handleTimeChange(event.id, 'min', e.target.value)} />
                                                                                <Input label="Detik" type="number" min="0" max="99" value={selectedEvents[event.id].time.sec} onChange={e => handleTimeChange(event.id, 'sec', e.target.value)} />
                                                                                <Input label="ss/100" type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={e => handleTimeChange(event.id, 'ms', e.target.value)} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>

                                {selectedEventCount > 0 && (
                                    <Card className="shadow-2xl bg-gradient-to-br from-primary/10 to-transparent border-primary/30 border-2 rounded-3xl">
                                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                                            <span className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg">{isFree ? '3' : '4'}</span>
                                            Ringkasan Pendaftaran
                                        </h2>
                                        <div className="space-y-3">
                                            <p className="text-xs font-black text-text-secondary uppercase tracking-widest mb-4">Nomor Lomba Yang Diikuti:</p>
                                            <div className="space-y-2">
                                                {summaryList.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center bg-surface/80 backdrop-blur-sm p-4 rounded-2xl border border-border shadow-sm hover:border-primary/40 transition-colors">
                                                        <span className="font-black text-sm text-text-primary tracking-tight">{item.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-text-secondary font-bold uppercase">Waktu:</span>
                                                            <span className="font-mono text-sm bg-primary/5 text-primary font-black px-3 py-1 rounded-lg border border-primary/10">{item.time}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-8 pt-6 border-t border-dashed border-primary/30 flex justify-between items-end">
                                                <div>
                                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Total Atlet</p>
                                                    <p className="text-xl font-black text-text-primary tracking-tighter">{formData.name || '-'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Total Bayar</p>
                                                    <p className="text-3xl font-black text-primary underline decoration-primary/20 underline-offset-8">
                                                        {isFree ? 'GRATIS' : `Rp ${parseInt(formData.paymentAmount || '0').toLocaleString('id-ID')}`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                )}
                            </>
                        ) : (
                            <>
                                {/* TEAM STEPS */}
                                <Card className="shadow-xl">
                                    <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                        <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                                        Informasi Tim & Unggah Berkas (Excel)
                                    </h2>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <Input label="Nama Klub / Tim" id="clubName" name="clubName" value={teamFormData.clubName} onChange={handleTeamFormChange} placeholder="Contoh: Millenium Aquatic" required />
                                            <Input label="Nama PIC / Penanggung Jawab" id="picName" name="picName" value={teamFormData.picName} onChange={handleTeamFormChange} placeholder="Nama Anda" required />
                                            <Input label="Nomor HP/WA Aktif PIC" id="picPhone" name="picPhone" type="tel" value={teamFormData.picPhone} onChange={handleTeamFormChange} placeholder="Contoh: 08123456789" required />
                                        </div>
                                        
                                        <div className="bg-surface p-6 rounded-2xl border-2 border-dashed border-border text-center space-y-4">
                                            <p className="text-sm text-text-secondary">Silakan unduh template Excel kami, isi data atlet Anda, lalu unggah kembali di sini.</p>
                                            <div className="flex flex-wrap justify-center gap-4">
                                                <Button variant="secondary" onClick={downloadTeamTemplate} disabled={!isTeamInfoFilled}>UNDUH TEMPLATE EXCEL</Button>
                                                <div className="relative">
                                                    <Button disabled={isParsingExcel || !isTeamInfoFilled}>
                                                        {isParsingExcel ? <Spinner /> : 'UNGGAH BERKAS TERISI'}
                                                    </Button>
                                                    <input 
                                                        type="file" 
                                                        accept=".xlsx, .xls" 
                                                        onChange={handleTeamExcelUpload} 
                                                        className={`absolute inset-0 opacity-0 ${isTeamInfoFilled ? 'cursor-pointer' : 'cursor-not-allowed pointer-events-none'}`}
                                                        disabled={isParsingExcel || !isTeamInfoFilled}
                                                    />
                                                </div>
                                            </div>
                                            {!isTeamInfoFilled && <p className="text-[10px] text-red-500 italic font-bold">Lengkapi Info Tim & PIC di atas untuk mengaktifkan tombol unduh & unggah template.</p>}
                                        </div>

                                        {teamParticipants.length > 0 && (
                                            <div className="mt-6 animate-in slide-in-from-top-4">
                                                <p className="text-xs font-black text-primary uppercase mb-2">Pratinjau Data Atlet ({teamParticipants.length} Entri):</p>
                                                <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
                                                    <table className="w-full text-left text-xs">
                                                        <thead className="bg-background sticky top-0">
                                                            <tr>
                                                                <th className="p-2">Nama</th>
                                                                <th className="p-2">Tahun</th>
                                                                <th className="p-2">KU</th>
                                                                <th className="p-2">Nomor</th>
                                                                <th className="p-2">Waktu</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {teamParticipants.map((p, i) => (
                                                                <tr key={i} className="border-t border-border hover:bg-primary/5">
                                                                    <td className="p-2 font-bold">{p.name}</td>
                                                                    <td className="p-2">{p.birthYear}</td>
                                                                    <td className="p-2">{p.ageGroup}</td>
                                                                    <td className="p-2 truncate max-w-[150px]">{p.eventName}</td>
                                                                    <td className="p-2 font-mono">{p.displayTime}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {!isFree && (
                                    <Card className="shadow-xl border-l-4 border-l-primary">
                                        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                            <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                                            Pembayaran & Bukti Transfer
                                        </h2>
                                        <PaymentSection 
                                            info={competitionInfo} 
                                            data={teamFormData} 
                                            onFileChange={handleFileChange} 
                                            onAmountChange={handleTeamFormChange} 
                                            previewUrl={teamPreviewUrl}
                                            compressedBlob={teamCompressedBlob}
                                            isCompressing={isCompressing}
                                            isConfirmed={isTeamConfirmed}
                                            onVerifyClick={() => {
                                                setShowZoomModal(true);
                                                setZoomScale(1);
                                            }}
                                            terbilang={terbilang}
                                        />
                                    </Card>
                                )}

                                {teamParticipants.length > 0 && (
                                    <Card className="shadow-2xl bg-gradient-to-br from-primary/10 to-transparent border-primary/30 border-2 rounded-3xl">
                                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                                            <span className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg">{isFree ? '2' : '3'}</span>
                                            Ringkasan Kolektif
                                        </h2>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="p-4 bg-surface rounded-2xl border border-border shadow-sm">
                                                <p className="text-[10px] font-black text-text-secondary uppercase">Jumlah Atlet</p>
                                                <p className="text-2xl font-black text-primary">{new Set(teamParticipants.map(p => p.name)).size}</p>
                                            </div>
                                            <div className="p-4 bg-surface rounded-2xl border border-border shadow-sm">
                                                <p className="text-[10px] font-black text-text-secondary uppercase">Total Nomor</p>
                                                <p className="text-2xl font-black text-primary">{teamParticipants.length}</p>
                                            </div>
                                            <div className="col-span-2 p-4 bg-surface rounded-2xl border border-primary/20 shadow-sm text-right">
                                                <p className="text-[10px] font-black text-text-secondary uppercase">Total Wajib Bayar</p>
                                                <p className="text-3xl font-black text-primary tracking-tighter">
                                                    {isFree ? 'GRATIS' : `Rp ${parseInt(teamFormData.paymentAmount || '0').toLocaleString('id-ID')}`}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                )}
                            </>
                        )}

                        {error && <div className="p-5 bg-red-100 border-2 border-red-300 text-red-700 rounded-2xl font-black text-center animate-bounce shadow-lg">{error}</div>}
                        
                        {!isFormValid && (
                            <div className="p-6 bg-yellow-50 border-2 border-yellow-200 rounded-3xl shadow-sm animate-in fade-in slide-in-from-bottom-2">
                                <h4 className="text-sm font-black text-yellow-800 uppercase mb-3 flex items-center gap-2">
                                    <span>⚠️</span> DATA BELUM LENGKAP:
                                </h4>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                                    {validationErrors.map((err, i) => (
                                        <li key={i} className="text-xs font-bold text-yellow-700 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                                            {err}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="pt-6">
                            <Button 
                                type="submit" 
                                disabled={isSubmitting || !isFormValid} 
                                className="w-full py-8 text-3xl font-black shadow-2xl rounded-3xl tracking-tighter transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-30"
                            >
                                {isSubmitting ? (
                                    <div className="flex items-center justify-center gap-4">
                                        <Spinner /> <span className="animate-pulse">MENGIRIM DATA...</span>
                                    </div>
                                ) : 'KIRIM PENDAFTARAN SEKARANG'}
                            </Button>
                        </div>
                    </form>
                )}

                {successMessage && (
                    <Card className="text-center p-16 shadow-2xl border-4 border-green-500 rounded-[3rem] animate-in zoom-in duration-700 bg-white">
                        <div className="bg-green-100 h-32 w-32 rounded-full flex items-center justify-center mx-auto mb-8 border-8 border-green-500 shadow-2xl animate-bounce">
                            <span className="text-green-500 text-7xl font-bold">✓</span>
                        </div>
                        <h2 className="text-4xl font-black text-black mb-4 italic tracking-tighter uppercase">BERHASIL!</h2>
                        <div className="max-w-2xl mx-auto">{successMessage}</div>
                        <div className="mt-12 flex flex-col gap-5 max-w-sm mx-auto">
                            <Button onClick={() => { setSuccessMessage(''); setRegType('CHOICE'); setTeamParticipants([]); }} className="py-6 font-black text-xl rounded-2xl shadow-xl">PENDAFTARAN BARU</Button>
                            <Button variant="secondary" onClick={onBackToLogin} className="py-4 rounded-xl opacity-70 hover:opacity-100 transition-opacity">KEMBALI KE BERANDA</Button>
                        </div>
                    </Card>
                )}

                {/* MODAL VERIFIKASI BUKTI TRANSFER */}
                {showZoomModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="bg-surface border border-border rounded-[2.5rem] shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-border bg-background flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-black text-primary uppercase tracking-tight">Verifikasi & Cek Detail Bukti Transfer</h3>
                                    <p className="text-xs text-text-secondary mt-0.5 font-bold">Harap periksa kecocokan nominal transfer di gambar dan yang diinput.</p>
                                </div>
                                <button 
                                    onClick={() => { setShowZoomModal(false); setZoomScale(1); }}
                                    className="text-text-secondary hover:text-red-500 p-2 rounded-full hover:bg-surface transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 md:p-8">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                                    {/* LEFT COLUMN: INTERACTIVE IMAGE WITH ZOOM CONTROLS */}
                                    <div className="space-y-4">
                                        <p className="text-xs font-black text-text-secondary uppercase tracking-wider">Gambar Bukti Transfer (Dapat Di-zoom & Di-drag)</p>
                                        <div className="relative border border-border rounded-3xl overflow-hidden bg-black flex items-center justify-center aspect-[3/4] max-h-[50vh]">
                                            <div 
                                                className="w-full h-full overflow-hidden flex items-center justify-center cursor-zoom-in"
                                                onWheel={(e) => {
                                                    e.preventDefault();
                                                    setZoomScale(prev => Math.min(Math.max(prev - e.deltaY * 0.005, 0.8), 5));
                                                }}
                                            >
                                                <img 
                                                    src={regType === 'INDIVIDUAL' ? individualPreviewUrl : teamPreviewUrl} 
                                                    alt="Bukti Bayar" 
                                                    className="max-w-full max-h-full object-contain transition-transform duration-200 origin-center"
                                                    style={{ transform: `scale(${zoomScale})` }}
                                                />
                                            </div>

                                            {/* ZOOM FLOATING CONTROLS */}
                                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
                                                <button 
                                                    type="button"
                                                    onClick={() => setZoomScale(prev => Math.max(prev - 0.5, 0.8))}
                                                    className="text-white hover:text-primary font-black px-2 text-lg"
                                                    title="Zoom Out"
                                                >
                                                    －
                                                </button>
                                                <span className="text-white font-mono text-xs font-bold min-w-[3rem] text-center">
                                                    {Math.round(zoomScale * 100)}%
                                                </span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setZoomScale(prev => Math.min(prev + 0.5, 5))}
                                                    className="text-white hover:text-primary font-black px-2 text-lg"
                                                    title="Zoom In"
                                                >
                                                    ＋
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => setZoomScale(1)}
                                                    className="text-[10px] text-white/70 hover:text-white font-black uppercase tracking-wider px-2 border-l border-white/20"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-text-secondary font-medium text-center italic">
                                            * Scroll mouse di atas gambar atau gunakan tombol + / - untuk melakukan zoom in/out detail transaksi.
                                        </p>
                                    </div>

                                    {/* RIGHT COLUMN: COMPARISON & MANDATORY QUESTIONS */}
                                    <div className="space-y-6">
                                        <div className="bg-primary/5 p-6 rounded-3xl border border-primary/20 space-y-4">
                                            <span className="text-xs font-black text-primary uppercase tracking-widest">Detail Nominal yang Diinput</span>
                                            <div className="space-y-1">
                                                <p className="text-sm text-text-secondary font-bold">Nominal Transfer:</p>
                                                <p className="text-3xl font-black text-primary tracking-tight">
                                                    Rp {parseInt(regType === 'INDIVIDUAL' ? formData.paymentAmount : teamFormData.paymentAmount).toLocaleString('id-ID')}
                                                </p>
                                                <p className="text-xs font-bold italic text-text-secondary uppercase tracking-tight mt-1">
                                                    # Terbilang: <span className="text-primary font-black not-italic">"{terbilang(parseInt(regType === 'INDIVIDUAL' ? formData.paymentAmount : teamFormData.paymentAmount) || 0)} Rupiah"</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-xs font-black text-text-secondary uppercase tracking-wider">Lembar Pernyataan & Konfirmasi Mandiri:</h4>
                                            
                                            <div className="bg-surface p-5 rounded-3xl border border-border shadow-sm space-y-4">
                                                <label className="flex items-start gap-3 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={regType === 'INDIVIDUAL' ? tempIndividualCheck1 : tempTeamCheck1}
                                                        onChange={(e) => {
                                                            if (regType === 'INDIVIDUAL') setTempIndividualCheck1(e.target.checked);
                                                            else setTempTeamCheck1(e.target.checked);
                                                        }}
                                                        className="mt-1 h-5 w-5 text-primary rounded border-border focus:ring-primary"
                                                    />
                                                    <span className="text-xs font-semibold text-text-primary leading-relaxed">
                                                        Saya menyatakan bahwa nominal transfer yang tertera pada <span className="text-primary font-black">GAMBAR BUKTI</span> di samping adalah benar-benar cocok sebesar <span className="text-primary font-black">Rp {parseInt(regType === 'INDIVIDUAL' ? formData.paymentAmount : teamFormData.paymentAmount).toLocaleString('id-ID')}</span>.
                                                    </span>
                                                </label>

                                                <label className="flex items-start gap-3 cursor-pointer border-t border-border pt-4">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={regType === 'INDIVIDUAL' ? tempIndividualCheck2 : tempTeamCheck2}
                                                        onChange={(e) => {
                                                            if (regType === 'INDIVIDUAL') setTempIndividualCheck2(e.target.checked);
                                                            else setTempTeamCheck2(e.target.checked);
                                                        }}
                                                        className="mt-1 h-5 w-5 text-primary rounded border-border focus:ring-primary"
                                                    />
                                                    <span className="text-xs font-semibold text-text-primary leading-relaxed">
                                                        Saya memastikan gambar bukti transfer ini <span className="text-primary font-black">SANGAT JELAS / TIDAK BURAM</span>, tulisan tanggal/nominal/pengirim dapat dibaca penuh agar mempercepat validasi panitia.
                                                    </span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl flex gap-3 items-start">
                                            <span className="text-xl">💡</span>
                                            <p className="text-[11px] text-yellow-800 leading-normal font-semibold">
                                                Kesalahan dalam mengunggah bukti bayar atau ketidakcocokan nominal dapat mengakibatkan pendaftaran ditolak oleh sistem audit panitia.
                                            </p>
                                        </div>

                                        <Button 
                                            type="button"
                                            disabled={!(regType === 'INDIVIDUAL' ? (tempIndividualCheck1 && tempIndividualCheck2) : (tempTeamCheck1 && tempTeamCheck2))}
                                            onClick={() => {
                                                if (regType === 'INDIVIDUAL') {
                                                    setIsIndividualConfirmed(true);
                                                } else {
                                                    setIsTeamConfirmed(true);
                                                }
                                                setShowZoomModal(false);
                                                setZoomScale(1);
                                            }}
                                            className="w-full py-4 text-sm font-black shadow-lg rounded-2xl flex items-center justify-center gap-2"
                                        >
                                            <span>✓ YA, SAYA SUDAH VERIFIKASI & NOMINAL COCOK</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

interface PaymentSectionProps {
    info: any;
    data: any;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAmountChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    previewUrl: string;
    compressedBlob: Blob | null;
    isCompressing: boolean;
    isConfirmed: boolean;
    onVerifyClick: () => void;
    terbilang: (nilai: number) => string;
}

const PaymentSection: React.FC<PaymentSectionProps> = ({ 
    info, 
    data, 
    onFileChange, 
    onAmountChange, 
    previewUrl, 
    compressedBlob, 
    isCompressing,
    isConfirmed,
    onVerifyClick,
    terbilang
}) => {
    // Component already handles free competition with a check but we also hide the Card in the main render
    if (info?.isFree) {
        return null;
    }
    return (
        <div className="space-y-6">
            <div className="bg-surface p-4 rounded-lg border border-primary/20 shadow-inner">
                <p className="text-xs text-text-secondary uppercase font-bold tracking-widest mb-1">Rekening Tujuan</p>
                <p className="text-2xl font-black text-text-primary tracking-tighter">{info?.accountNumber || '-'}</p>
                <p className="text-sm font-bold uppercase text-primary mb-3">{info?.recipientName || '-'}</p>
                
                <div className="pt-3 border-t border-border flex justify-between items-center">
                    <span className="text-xs font-bold text-text-secondary uppercase tracking-tight">Biaya Pendaftaran</span>
                    <span className="text-lg font-black text-text-primary">Rp {(info?.feePerEvent || 0).toLocaleString('id-ID')} <span className="text-[10px] font-normal text-text-secondary">/ nomor acara</span></span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="block text-sm font-bold text-text-secondary uppercase tracking-tight">Masukkan Nominal Yang Ditransfer (Rp)</label>
                    <Input 
                        label="" 
                        id="paymentAmount" 
                        name="paymentAmount" 
                        type="number" 
                        value={data.paymentAmount} 
                        onChange={onAmountChange} 
                        placeholder="Contoh: 75000"
                        required 
                        className="text-xl font-bold"
                    />
                    <p className="text-xs font-bold text-yellow-600 mt-1">
                        ⚠️ Harap masukkan nominal angka saja tanpa menggunakan titik atau koma. Contoh: 75000
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-bold text-text-secondary uppercase tracking-tight">Unggah Bukti Bayar (Format Gambar)</label>
                    <div className="relative border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center justify-center bg-surface/50 hover:bg-surface/80 transition-colors min-h-[140px]">
                        {isCompressing ? (
                            <div className="flex flex-col items-center gap-2 py-4">
                                <Spinner />
                                <span className="text-xs font-bold text-primary animate-pulse">Mengompresi gambar di browser...</span>
                            </div>
                        ) : previewUrl ? (
                            <div className="w-full flex items-start gap-4">
                                <img 
                                    src={previewUrl} 
                                    alt="Preview Bukti Bayar" 
                                    onClick={onVerifyClick}
                                    className="h-20 w-20 object-cover rounded-xl border border-border shadow-sm bg-white cursor-pointer hover:opacity-85 transition-opacity mt-1 shrink-0" 
                                    title="Klik untuk memperbesar gambar"
                                />
                                <div className="text-left flex-grow">
                                    <p className="text-xs font-black text-green-600 flex items-center gap-1">
                                        <span>✓</span> Gambar Berhasil Dikompresi
                                    </p>
                                    {compressedBlob && (
                                        <p className="text-[10px] text-text-secondary font-bold">
                                            Ukuran: <span className="text-primary font-black">{(compressedBlob.size / 1024).toFixed(1)} KB</span> (WebP Ringkas)
                                        </p>
                                    )}
                                    
                                    <div className="mt-3 space-y-2">
                                        <button 
                                            type="button" 
                                            onClick={onVerifyClick}
                                            className="py-1.5 px-3 text-xs font-black rounded-lg flex items-center gap-1 bg-primary text-white hover:bg-primary-dark transition-colors shadow-sm"
                                        >
                                            🔍 Perbesar & Verifikasi Bukti Bayar
                                        </button>

                                        {isConfirmed ? (
                                            <div className="bg-green-500/10 border border-green-500/20 text-green-700 p-2.5 rounded-xl text-[10px] font-bold leading-relaxed shadow-sm">
                                                ✓ Bukti Terverifikasi Sesuai:<br />
                                                <span className="text-xs font-black text-green-800">Rp {parseInt(data.paymentAmount || '0').toLocaleString('id-ID')}</span><br />
                                                <span className="italic opacity-80">"{terbilang(parseInt(data.paymentAmount || '0'))} Rupiah"</span>
                                            </div>
                                        ) : (
                                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-2.5 rounded-xl text-[10px] font-bold leading-relaxed shadow-sm">
                                                ⚠️ Verifikasi Bukti Bayar Diperlukan!<br />
                                                <span className="opacity-90">Silakan klik tombol merah/biru "Perbesar & Verifikasi" di atas untuk menyetujui pernyataan nominal transfer.</span>
                                            </div>
                                        )}
                                    </div>

                                    <label className="inline-block mt-3 text-[10px] font-black text-primary hover:underline cursor-pointer">
                                        Ganti Gambar
                                        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1.5 py-2">
                                <span className="text-2xl">📸</span>
                                <p className="text-xs font-bold text-text-primary">Klik atau seret file gambar bukti bayar</p>
                                <p className="text-[10px] text-text-secondary">Akan otomatis dikompres ke WebP (~20KB)</p>
                                <input type="file" accept="image/*" onChange={onFileChange} className="absolute inset-0 opacity-0 cursor-pointer" required={!data.paymentProof} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};