import React, { useState, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { RecordType, Gender, SwimStyle } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, reconstructLockedHeats, translateGender, translateSwimStyle, romanize } from '../constants';
import { getRecords } from '../services/databaseService';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any;

interface PrintViewProps {
  events: SwimEvent[];
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
  isLoading: boolean;
}

type ReportType = 'schedule' | 'program' | 'results' | 'clubMedals' | 'clubSwimmerMedals' | 'swimmerTotal' | 'swimmerCategory' | 'brokenRecords' | 'onlineRegistration' | 'participantCards';

interface ScheduledEvent extends SwimEvent {
    globalEventNumber: number;
}

interface TimedHeat extends Heat {
    estimatedHeatStartTime?: number;
}

interface TimedEvent extends ScheduledEvent {
    detailedEntries: Entry[];
    estimatedEventStartTime?: number;
    heatsWithTimes?: TimedHeat[];
    detailedResults?: any[];
}

interface TallyClubIndividual {
    name: string;
    medals: { rank: number; eventName: string; time: number }[];
}

interface TallyClub {
    name: string;
    gold: number;
    silver: number;
    bronze: number;
    individualDetails: Record<string, TallyClubIndividual>;
}

interface TallyIndividual {
    swimmer: Swimmer;
    gold: number;
    silver: number;
    bronze: number;
}

const formatTime = (ms: number) => {
    if (isNaN(ms) || ms === null || ms === undefined || ms === 0) return '99:99.99';
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

const estimateHeatDuration = (distance: number): number => {
    if (distance <= 50) return 2 * 60 * 1000;
    if (distance <= 100) return 3 * 60 * 1000;
    return 5 * 60 * 1000;
};

const formatEST = (timestamp: number | undefined) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const MedalIcon = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span className="text-lg">🥇</span>;
    if (rank === 2) return <span className="text-lg">🥈</span>;
    if (rank === 3) return <span className="text-lg">🥉</span>;
    return null;
};

const ReportHeader = ({ info, title }: { info: CompetitionInfo, title: string }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-16 object-contain mx-auto mb-2" />}
        <div className="mb-2">
            {/* FIX: Explicitly cast info.eventName to string and map to avoid 'unknown' type errors. */}
            {(info.eventName || "").split('\n').map((line: string, index: number) => (
                <p key={index} className={`font-bold uppercase tracking-tight leading-tight ${index === 0 ? 'text-xl' : 'text-xs'}`}>{line}</p>
            ))}
            <p className="text-sm text-black mt-1 uppercase font-semibold">
                {info.eventDate && new Date(info.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
        </div>
        <h2 className="text-lg font-bold border-y-2 border-black py-1 my-2 text-center bg-gray-50 tracking-widest">{title}</h2>
    </header>
);

const PrintRecordRow: React.FC<{ record: SwimRecord | undefined; type: string; }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    if (!record) return <p className="uppercase text-[8px] font-sans text-black font-bold">{typeText} : -</p>;
    const parts = [formatTime(record.time), record.holderName, record.yearSet, record.locationSet].filter(p => p != null && String(p).trim() !== '');
    return <p className="uppercase text-[8px] font-sans font-bold text-black border-l-2 border-black pl-2 leading-tight">{typeText} : {parts.join(' | ')}</p>;
};

const ScheduleReport: React.FC<{ events: ScheduledEvent[], info: CompetitionInfo | null }> = ({ events, info }) => {
    const grouped = events.reduce((acc: Record<string, ScheduledEvent[]>, e) => {
        const session = `SESI ${romanize(e.sessionNumber || 0)}`;
        if (!acc[session]) acc[session] = [];
        acc[session].push(e);
        return acc;
    }, {});

    const lanes = info?.numberOfLanes || 8;

    return (
        <div className="space-y-6">
            {Object.entries(grouped).map(([session, sessionEvents]) => (
                <div key={session} className="page-break-inside-avoid">
                    <h3 className="font-bold text-md border-b-2 border-black mb-2 uppercase">{session}</h3>
                    <table className="w-full text-[11px] border-collapse">
                        <thead><tr className="border-b bg-gray-100"><th className="text-left py-1 px-2 w-12">NO</th><th className="text-left px-2">NOMOR LOMBA</th><th className="text-center w-24 px-2">JUMLAH SERI</th></tr></thead>
                        <tbody>
                            {sessionEvents.map(e => (
                                <tr key={e.id} className="border-b border-gray-200">
                                    <td className="py-1 px-2 font-bold">{e.globalEventNumber}</td>
                                    <td className="px-2 font-medium">{formatEventName(e)}</td>
                                    <td className="text-center px-2">{Math.ceil((e.entries?.length || 0) / lanes)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

const EventBaseReport = ({ events, info, records, showResults }: { events: TimedEvent[], info: CompetitionInfo, records: SwimRecord[], showResults?: boolean }) => (
    <div className="space-y-8">
        {(events as TimedEvent[]).map(event => {
            const porprov = records.find(r => r.type === RecordType.PORPROV && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
            const nasional = records.find(r => r.type === RecordType.NASIONAL && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
            
            return (
                <div key={event.id} className="page-break-inside-avoid border-b-2 border-gray-400 pb-4">
                    <div className="bg-gray-200 text-black border-y-2 border-black p-1 px-2 font-bold text-xs flex justify-between uppercase">
                        <span>{showResults ? 'Hasil Acara' : 'Acara'} {event.globalEventNumber} - {formatEventName(event)}</span>
                        {event.estimatedEventStartTime && !showResults && <span className="text-black">Waktu Perlombaan : {formatEST(event.estimatedEventStartTime)}</span>}
                    </div>
                    <div className="my-1 px-2 border-l-2 border-black bg-gray-50 py-1">
                        <PrintRecordRow record={porprov} type="PORPROV" />
                        <PrintRecordRow record={nasional} type="NASIONAL" />
                    </div>

                    {!showResults ? (
                        (event.heatsWithTimes || []).map((heat: any) => (
                            <div key={heat.heatNumber} className="mt-2">
                                <p className="text-center font-bold text-[9px] uppercase bg-gray-200 py-0.5 text-black">
                                    Seri {heat.heatNumber} dari {event.heatsWithTimes?.length} 
                                    {heat.estimatedHeatStartTime && <span className="ml-2 text-black">— EST: {formatEST(heat.estimatedHeatStartTime)}</span>}
                                </p>
                                <table className="w-full text-[10px] mt-0.5 border-collapse table-fixed">
                                    <thead><tr className="border-y border-black font-bold bg-gray-100">
                                        <th className="w-16 text-center">LANE</th>
                                        <th className="text-left px-2">NAMA ATLET</th>
                                        <th className="w-12 text-center">THN</th>
                                        <th className="text-left px-2">KLUB / TIM</th>
                                        <th className="w-24 text-right px-2">SEED TIME</th>
                                    </tr></thead>
                                    <tbody>
                                        {Array.from({ length: info.numberOfLanes || 8 }, (_, i) => i + 1).map(lane => {
                                            const ass = heat.assignments.find((a: any) => a.lane === lane);
                                            return (
                                                <tr key={lane} className="border-b border-gray-100 h-6">
                                                    <td className="text-center font-bold border-r border-gray-100">{lane}</td>
                                                    <td className="px-2 truncate font-medium uppercase">{ass ? ass.entry.swimmer.name : '-'}</td>
                                                    <td className="text-center">{ass ? ass.entry.swimmer.birthYear : '-'}</td>
                                                    <td className="px-2 truncate text-[9px] uppercase">{ass ? ass.entry.swimmer.club : '-'}</td>
                                                    <td className="text-right font-mono text-black px-2">{ass ? formatTime(ass.entry.seedTime) : '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    ) : (
                        <div className="mt-2">
                            <table className="w-full text-[10px] border-collapse table-fixed">
                                <thead><tr className="border-y border-black font-bold bg-gray-100">
                                    <th className="w-16 text-center">RANK</th>
                                    <th className="text-left px-2">NAMA ATLET</th>
                                    <th className="w-12 text-center">THN</th>
                                    <th className="text-left px-2">KLUB / TIM</th>
                                    <th className="w-24 text-right px-2">HASIL</th>
                                    <th className="w-16 text-center">MEDALI</th>
                                </tr></thead>
                                <tbody>
                                    {event.detailedResults?.map((r: any) => (
                                        <tr key={r.swimmerId} className="border-b border-gray-200 h-7">
                                            <td className="text-center font-bold">{r.rank || '-'}</td>
                                            <td className="px-2 uppercase font-medium">{r.swimmer?.name}</td>
                                            <td className="text-center">{r.swimmer?.birthYear}</td>
                                            <td className="px-2 uppercase text-[9px]">{r.swimmer?.club}</td>
                                            <td className="text-right font-mono text-black px-2">{formatTime(r.time)}</td>
                                            <td className="text-center scale-125"><MedalIcon rank={r.rank} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        })}
    </div>
);

const ClubMedalsReport: React.FC<{ data: any[] }> = ({ data }) => (
    <table className="w-full text-[12px] border-collapse">
        <thead><tr className="bg-gray-200 text-black border-2 border-black">
            <th className="p-2 w-12 text-center">#</th><th className="text-left px-2">NAMA TIM / KLUB</th><th className="w-16 text-center">🥇</th><th className="w-16 text-center">🥈</th><th className="w-16 text-center">🥉</th><th className="w-16 text-center font-bold">TOTAL</th>
        </tr></thead>
        <tbody>
            {data.map((item, i) => (
                <tr key={i} className="border-b-2 border-gray-300">
                    <td className="text-center font-bold py-2">{i + 1}</td>
                    <td className="font-bold uppercase px-2">{item.name}</td>
                    <td className="text-center">{item.gold}</td>
                    <td className="text-center">{item.silver}</td>
                    <td className="text-center">{item.bronze}</td>
                    <td className="text-center font-bold bg-gray-50">{item.gold + item.silver + item.bronze}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

const ClubSwimmerMedalsReport: React.FC<{ data: any[] }> = ({ data }) => (
    <div className="space-y-8">
        {data.map((club, idx) => (
            <div key={idx} className="page-break-inside-avoid border-2 border-black rounded overflow-hidden shadow-sm">
                <div className="bg-gray-200 text-black border-b-2 border-black p-2 flex justify-between items-center font-bold">
                    <span className="text-lg uppercase tracking-tight">{club.name}</span>
                    <span className="text-lg">🥇{club.gold} 🥈{club.silver} 🥉{club.bronze}</span>
                </div>
                <table className="w-full text-[11px]">
                    <thead><tr className="bg-gray-200 border-b border-black">
                        <th className="text-left p-2 w-1/3">NAMA ATLET</th><th className="text-left p-2">NOMOR LOMBA YANG DIMENANGKAN</th>
                    </tr></thead>
                    <tbody>
                        {club.individualDetails.map((swimmer: any, sIdx: number) => (
                            <tr key={sIdx} className="border-b border-gray-200 align-top">
                                <td className="p-2 font-bold uppercase">{swimmer.name}</td>
                                <td className="p-2 py-3 space-y-1">
                                    {swimmer.medals.map((m: any, mIdx: number) => (
                                        <div key={mIdx} className="flex gap-2 items-center">
                                            <MedalIcon rank={m.rank} />
                                            <span className="font-medium uppercase text-black">{m.eventName} - {formatTime(m.time)}</span>
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
    </div>
);

const AthleteRecapReport: React.FC<{ data: any[], title?: string }> = ({ data, title }) => {
    const male = data.filter(i => i.swimmer?.gender === 'Male');
    const female = data.filter(i => i.swimmer?.gender === 'Female');
    
    const RenderTable = ({ list, label }: { list: any[], label: string }) => (
        <div className="mt-6 page-break-inside-avoid">
            <h4 className="bg-gray-200 text-black border-y-2 border-black p-2 px-3 font-bold text-xs uppercase mb-1 tracking-widest">{label}</h4>
            <table className="w-full text-[11px] border-collapse table-fixed">
                <thead>
                    <tr className="border-y-2 border-black bg-gray-100 font-bold">
                        <th className="w-12 text-center py-2">#</th>
                        <th className="text-left px-2">NAMA ATLET</th>
                        <th className="text-left px-2">TIM / KLUB</th>
                        <th className="w-10 text-center">🥇</th>
                        <th className="w-10 text-center">🥈</th>
                        <th className="w-10 text-center">🥉</th>
                        <th className="w-14 text-center font-black">TOT</th>
                    </tr>
                </thead>
                <tbody>
                    {list.map((item, i) => (
                        <tr key={i} className="border-b border-gray-300">
                            <td className="text-center py-2 font-bold bg-gray-50">{i + 1}</td>
                            <td className="px-2 font-bold uppercase truncate">{item.swimmer?.name}</td>
                            <td className="px-2 uppercase text-[9px] truncate">{item.swimmer?.club}</td>
                            <td className="text-center font-bold text-lg">{item.gold}</td>
                            <td className="text-center font-bold text-lg">{item.silver}</td>
                            <td className="text-center font-bold text-lg">{item.bronze}</td>
                            <td className="text-center font-black text-lg bg-gray-100">{item.gold + item.silver + item.bronze}</td>
                        </tr>
                    ))}
                    {list.length === 0 && (
                        <tr>
                            <td colSpan={7} className="text-center py-6 text-gray-400 italic">BELUM ADA DATA PEMENANG MEDALI</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="space-y-4">
            {title && <h3 className="text-center font-black text-xl mb-4 uppercase underline tracking-tighter">{title}</h3>}
            <RenderTable list={male} label="KATEGORI PUTRA (MEN'S)" />
            <RenderTable list={female} label="KATEGORI PUTRI (WOMEN'S)" />
        </div>
    );
};

const OnlineRegistrationReport: React.FC<{ data: any[] }> = ({ data }) => (
    <table className="w-full text-[10px] border-collapse table-fixed">
        <thead>
            <tr className="bg-gray-200 text-black border-y-2 border-black font-bold">
                <th className="w-8 text-center py-2">#</th>
                <th className="w-1/4 text-left px-2">NAMA ATLET / TIM</th>
                <th className="w-24 text-center">BUKTI BAYAR</th>
                <th className="w-28 text-right px-2">NOMINAL</th>
                <th className="text-left px-2">DAFTAR NOMOR LOMBA & SEED TIME</th>
            </tr>
        </thead>
        <tbody>
            {data.map((item, i) => (
                <tr key={i} className="border-b border-gray-300 align-top">
                    <td className="text-center py-2 font-bold bg-gray-50">{i + 1}</td>
                    <td className="px-2 py-2">
                        <p className="font-bold uppercase text-[11px]">{item.swimmer.name}</p>
                        <p className="text-[9px] text-gray-600 font-medium uppercase">{item.swimmer.club}</p>
                        <div className="mt-1 space-y-0.5">
                            <p className="text-[8px] text-primary font-bold uppercase tracking-tight">PIC: {item.swimmer.picName || '-'}</p>
                            <p className="text-[8px] text-gray-500 font-mono">{item.swimmer.picPhone || '-'}</p>
                        </div>
                    </td>
                    <td className="p-1 text-center">
                        {item.swimmer.paymentProof ? (
                            <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                                <img 
                                    src={item.swimmer.paymentProof} 
                                    alt="Proof" 
                                    className="h-32 w-full object-contain mx-auto" 
                                />
                            </div>
                        ) : (
                            <span className="text-[10px] text-gray-400 italic">BELUM UNGGAH</span>
                        )}
                    </td>
                    <td className="px-2 py-2 text-right font-black text-xs">
                        {item.swimmer.paymentAmount && Number(item.swimmer.paymentAmount) > 0 
                            ? `Rp ${Number(item.swimmer.paymentAmount).toLocaleString('id-ID')}` 
                            : <span className="text-gray-400">Rp 0</span>}
                    </td>
                    <td className="px-2 py-2">
                        <div className="space-y-1">
                            {item.registeredEvents.map((ev: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center border-b border-gray-100 last:border-0 pb-0.5">
                                    <span className="uppercase text-[8px] leading-tight font-medium max-w-[70%]">{ev.name}</span>
                                    <span className="font-mono text-[9px] font-black bg-gray-100 px-1 rounded">{ev.time}</span>
                                </div>
                            ))}
                            {item.registeredEvents.length === 0 && <span className="text-gray-400 italic text-[8px]">TIDAK ADA NOMOR LOMBA</span>}
                        </div>
                    </td>
                </tr>
            ))}
            {data.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400 italic">BELUM ADA DATA PENDAFTARAN ONLINE</td></tr>
            )}
        </tbody>
    </table>
);

const ParticipantCardsReport: React.FC<{ data: any[], info: CompetitionInfo }> = ({ data, info }) => {
    // Chunk data into groups of 6 to ensure 6 cards per page
    const chunkedData = [];
    for (let i = 0; i < data.length; i += 6) {
        chunkedData.push(data.slice(i, i + 6));
    }

    return (
        <div className="space-y-0 text-black">
            {chunkedData.map((chunk, pageIdx) => (
                <div key={pageIdx} className={`grid grid-cols-2 gap-x-2 gap-y-4 ${pageIdx < chunkedData.length - 1 ? 'break-after-page' : ''}`} style={{ padding: '0.5cm' }}>
                    {chunk.map((item) => {
                        const swimmer = item.swimmer;
                        const qrData = `NAMA: ${swimmer.name}\nKLUB: ${swimmer.club}\nID: ${swimmer.id}\nLOMBA: ${(item.registeredEvents || []).map((e: any) => `${e.no}.${e.name} (S${e.session})`).join(', ')}`;
                        
                        return (
                            <div 
                                key={swimmer.id} 
                                className="border border-black rounded-lg flex flex-col bg-white relative overflow-hidden box-border"
                                style={{ width: '105mm', height: '80mm', padding: '5mm' }}
                            >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-black opacity-5 rounded-bl-[50px]" />
                                
                                {/* Header */}
                                <div className="w-full flex items-center justify-between border-b border-black pb-1 mb-2">
                                    <div className="flex items-center gap-1.5 font-sans">
                                        {info.eventLogo && <img src={info.eventLogo} alt="Logo" className="h-6 object-contain" />}
                                        <div className="flex flex-col">
                                            <span className="text-[7px] font-black uppercase tracking-tight leading-none text-black">KARTU PESERTA RESMI</span>
                                            <span className="text-[6px] font-bold uppercase truncate max-w-[120px] leading-tight text-black">
                                                {info.eventName.split('\n')[0]}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-[6px] font-black text-black leading-none">{info.eventDate ? new Date(info.eventDate).getFullYear() : ''}</span>
                                </div>

                                {/* Content Body */}
                                <div className="flex flex-1 w-full gap-2 min-h-0 overflow-hidden">
                                    {/* Swimmer Info - Left Column */}
                                    <div className="flex-[0.7] flex flex-col justify-between overflow-hidden">
                                        <div className="space-y-1.5">
                                            <div>
                                                <p className="text-[5px] font-bold text-black uppercase tracking-tighter">NAMA PESERTA</p>
                                                <p className="text-[10px] font-black uppercase text-black leading-tight line-clamp-2">{swimmer.name}</p>
                                            </div>
                                            
                                            <div>
                                                <p className="text-[5px] font-bold text-black uppercase tracking-tighter">KLUB / TIM</p>
                                                <p className="text-[8px] font-bold uppercase text-black leading-tight line-clamp-2">{swimmer.club}</p>
                                            </div>
                                        </div>
                                        
                                        {/* QR Code in Middle of Left Column */}
                                        <div className="flex justify-center my-2">
                                            <div className="bg-white p-1 border border-black rounded-[1px] shadow-sm">
                                                <QRCodeSVG value={qrData} size={96} level="L" />
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-1 mt-auto pb-1">
                                            <div>
                                                <p className="text-[5px] font-bold text-black uppercase">TAHUN</p>
                                                <p className="text-[8px] font-black italic">{swimmer.birthYear || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[5px] font-bold text-black uppercase">K.U</p>
                                                <p className="text-[8px] font-black italic">{swimmer.ageGroup || '-'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Events Table - Right Column */}
                                    <div className="flex-1 border border-black rounded bg-white overflow-hidden">
                                        <table className="w-full text-[6px] text-left">
                                            <thead className="bg-gray-200 text-black">
                                                <tr className="border-b border-black">
                                                    <th className="px-1 py-0.5 font-bold uppercase tracking-tighter">NOMOR / GAYA LOMBA</th>
                                                    <th className="px-0.5 py-0.5 font-bold text-center w-6 uppercase tracking-tighter">SESI</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {item.registeredEvents && item.registeredEvents.length > 0 ? (
                                                    item.registeredEvents.map((re: any, i: number) => (
                                                        <tr key={i} className="border-t border-black">
                                                            <td className="px-1 py-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[90px]" title={re.name}>
                                                                <span className="font-bold text-black mr-0.5">{re.no}.</span> {re.name}
                                                            </td>
                                                            <td className="px-0.5 py-0.5 text-center font-black text-black">{re.session || '-'}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={2} className="px-1 py-1 text-center text-black italic">BELUM TERDAFTAR</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="w-full mt-1 pt-1 border-t border-dashed border-black flex justify-between items-center text-[5px] font-bold text-black uppercase">
                                    <div className="flex items-center gap-1 text-[4px] tracking-tight">
                                         <span className="text-black tracking-widest font-black text-[5px]">R.E.A.C.T</span>
                                         <span>OFFICIAL EVENT ID CARD - SECURE GEN</span>
                                    </div>
                                    <span>ID: {swimmer.id.slice(0, 8).toUpperCase()}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [reportType, setReportType] = useState<ReportType>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [sessionFilter, setSessionFilter] = useState<number>(0);
    const [nameFilter, setNameFilter] = useState<string>('');
    const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
    const { addNotification } = useNotification();

    useEffect(() => { getRecords().then(setRecords); }, []);

    const availableSessions = useMemo(() => {
        const set = new Set(events.map(e => e.sessionNumber || 0).filter(s => s > 0));
        return Array.from(set).sort((a, b) => a - b);
    }, [events]);

    const eventsWithGlobalNumbers = useMemo(() => {
        return [...events]
            .filter(e => (e.sessionNumber || 0) > 0)
            .sort((a, b) => (Number(a.sessionNumber) || 0) - (Number(b.sessionNumber) || 0) || (Number(a.heatOrder) || 0) - (Number(b.heatOrder) || 0))
            .map((e, i) => ({ ...e, globalEventNumber: i + 1 }));
    }, [events]);

    const baseEvents = useMemo(() => {
        return eventsWithGlobalNumbers
            .filter(e => sessionFilter === 0 || e.sessionNumber === sessionFilter);
    }, [eventsWithGlobalNumbers, sessionFilter]);

    const handleToggleAllEvents = (select: boolean) => {
        if (select) setSelectedEventIds(new Set(baseEvents.map(e => e.id)));
        else setSelectedEventIds(new Set());
    };

    const handleToggleEventId = (id: string) => {
        const next = new Set(selectedEventIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedEventIds(next);
    };

    const renderEvents = useMemo(() => {
        const isSelectionActive = selectedEventIds.size > 0 && ['program', 'results'].includes(reportType);
        return baseEvents.filter(e => !isSelectionActive || selectedEventIds.has(e.id));
    }, [baseEvents, selectedEventIds, reportType]);

    const processedData = useMemo(() => {
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        const sessionCursors = new Map<number, number>();

        const detailedEvents = renderEvents.map(event => {
            const entries: Entry[] = event.entries.map(en => ({ ...en, swimmer: swimmersMap.get(en.swimmerId)! })).filter(e => e.swimmer);
            const heats = event.lanesLocked
                ? reconstructLockedHeats(entries)
                : generateHeats(entries, competitionInfo?.numberOfLanes || 8);
            
            const validRes = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const detailedRes = [...event.results].sort((a, b) => {
                if (a.time > 0 && b.time > 0) return a.time - b.time;
                if (a.time > 0) return -1; if (b.time > 0) return 1;
                return b.time - a.time;
            }).map(r => ({
                ...r,
                swimmer: swimmersMap.get(r.swimmerId),
                rank: r.time > 0 ? validRes.findIndex(v => v.swimmerId === r.swimmerId) + 1 : 0
            }));

            const sessionNum = event.sessionNumber || 0;
            let currentCursor = sessionCursors.get(sessionNum);
            
            if (currentCursor === undefined && event.sessionDateTime) {
                currentCursor = new Date(event.sessionDateTime).getTime();
            }

            const eventStartTime = currentCursor;

            const heatsWithTimes = heats.map(h => {
                const th = { ...h, estimatedHeatStartTime: currentCursor || undefined };
                if (typeof currentCursor === 'number') {
                    const duration = estimateHeatDuration(event.distance);
                    currentCursor = currentCursor + duration;
                }
                return th;
            });

            if (currentCursor !== undefined) {
                sessionCursors.set(sessionNum, currentCursor);
            }

            return { 
                ...event, 
                detailedEntries: entries, 
                heatsWithTimes, 
                detailedResults: detailedRes,
                estimatedEventStartTime: eventStartTime 
            };
        });

        const clubs: Record<string, TallyClub> = {};
        const individual: Record<string, TallyIndividual> = {};
        const broken: BrokenRecord[] = [];

        baseEvents.forEach(rawEvent => {
            const valid = [...rawEvent.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const winner = valid[0];
            
            if (winner) {
                const ws = swimmersMap.get(winner.swimmerId);
                if (ws) {
                    [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                        const rec = records.find(r => r.type === type && r.gender === rawEvent.gender && r.distance === rawEvent.distance && r.style === rawEvent.style && (r.category ?? null) === (rawEvent.category ?? null));
                        if (rec && Number(winner.time) < Number(rec.time)) { 
                            broken.push({ record: rec, newEventName: formatEventName(rawEvent), newHolder: ws, newTime: winner.time });
                        }
                    });
                }
            }

            valid.forEach((r, idx) => {
                const rank = idx + 1;
                if (rank > 3) return;
                const s = swimmersMap.get(r.swimmerId);
                if (!s) return;

                if (!clubs[s.club]) {
                    clubs[s.club] = { name: s.club, gold: 0, silver: 0, bronze: 0, individualDetails: {} };
                }
                if (!individual[s.id]) {
                    individual[s.id] = { swimmer: s, gold: 0, silver: 0, bronze: 0 };
                }
                
                const mKey = (rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze') as 'gold' | 'silver' | 'bronze';
                clubs[s.club][mKey]++;
                individual[s.id][mKey]++;

                if (!clubs[s.club].individualDetails[s.id]) {
                    clubs[s.club].individualDetails[s.id] = { name: s.name, medals: [] };
                }
                clubs[s.club].individualDetails[s.id].medals.push({ rank, eventName: formatEventName(rawEvent), time: r.time });
            });
        });

        const registrationData = swimmers
            .filter(s => s.birthYear !== 0)
            .filter(s => !nameFilter || s.name.toLowerCase().includes(nameFilter.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(swimmer => {
                // Use all events (eventsWithGlobalNumbers) instead of session-filtered baseEvents for this data mapping
                // to ensure all registrations show up regardless of current session filter
                const registeredEvents = eventsWithGlobalNumbers
                    .filter(e => e.entries.some(en => en.swimmerId === swimmer.id))
                    .sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0) || (a.heatOrder || 0) - (b.heatOrder || 0))
                    .map(e => {
                        const entry = e.entries.find(en => en.swimmerId === swimmer.id);
                        return {
                            no: e.globalEventNumber,
                            name: formatEventName(e),
                            session: e.sessionNumber,
                            time: entry ? formatTime(entry.seedTime) : '99:99.99'
                        };
                    });
                return { swimmer, registeredEvents };
            })
            .filter(item => item.registeredEvents.length > 0 || item.swimmer.paymentProof); // Show only those who registered or paid

        // FIX: Rewrote sort function to be type-safe and avoid arithmetic operations on potentially non-numeric types.
        const sortFn = (a: { gold: number; silver: number; bronze: number }, b: { gold: number; silver: number; bronze: number }) => {
            const bG = b.gold || 0;
            const aG = a.gold || 0;
            const bS = b.silver || 0;
            const aS = a.silver || 0;
            const bB = b.bronze || 0;
            const aB = a.bronze || 0;
            return (bG - aG) || (bS - aS) || (bB - aB);
        };

        const sortedClubs = Object.values(clubs).sort(sortFn).map((c) => ({
            ...c,
            individualDetails: Object.values(c.individualDetails).sort((a, b) => b.medals.length - a.medals.length)
        }));
        const sortedIndividuals = Object.values(individual).sort(sortFn);

        const categoryLeaderboard = [...new Set(swimmers.map(s => s.ageGroup))].filter(Boolean).sort().map(ku => ({
            ku,
            leaders: sortedIndividuals.filter((i) => i.swimmer.ageGroup === ku)
        }));

        return { 
            detailedEvents, 
            clubs: sortedClubs, 
            individuals: sortedIndividuals, 
            categoryLeaderboard, 
            broken,
            registrationData
        };
    }, [renderEvents, baseEvents, swimmers, competitionInfo, records, events, nameFilter]);


    const handleExportExcel = () => {
        if (!XLSX) return alert("Pustaka Excel belum siap.");
        let data: any[] = [];
        let fileName = reportTitles[reportType] || "Laporan";

        switch(reportType) {
            case 'schedule':
                data = renderEvents.map(e => ({ 
                    "NO ACARA": e.globalEventNumber, 
                    "NOMOR LOMBA": formatEventName(e), 
                    "SESI": e.sessionNumber,
                    "JUMLAH SERI": Math.ceil((e.entries?.length || 0) / (competitionInfo?.numberOfLanes || 8)),
                    "JUMLAH PESERTA": e.entries.length 
                }));
                break;
            case 'program':
                processedData.detailedEvents.forEach(e => {
                    data.push({ "LINTASAN": `ACARA ${e.globalEventNumber} - ${formatEventName(e).toUpperCase()}` });
                    e.heatsWithTimes?.forEach(h => {
                        data.push({ "LINTASAN": `SERI ${h.heatNumber} DARI ${e.heatsWithTimes?.length}` });
                        data.push({ "LINTASAN": "LANE", "NAMA ATLET": "NAMA ATLET", "TAHUN": "THN", "KLUB / TIM": "KLUB / TIM", "SEED TIME": "SEED TIME" });
                        h.assignments.forEach(ass => {
                            data.push({
                                "LINTASAN": ass.lane,
                                "NAMA ATLET": ass.entry.swimmer.name,
                                "TAHUN": ass.entry.swimmer.birthYear,
                                "KLUB / TIM": ass.entry.swimmer.club,
                                "SEED TIME": formatTime(ass.entry.seedTime)
                            });
                        });
                        data.push({});
                    });
                    data.push({});
                });
                break;
            case 'results':
                processedData.detailedEvents.forEach(e => {
                    data.push({ "PERINGKAT": `HASIL ACARA ${e.globalEventNumber} - ${formatEventName(e).toUpperCase()}` });
                    data.push({ "PERINGKAT": "RANK", "NAMA ATLET": "NAMA ATLET", "TAHUN": "THN", "TIM / KLUB": "TIM / KLUB", "WAKTU": "HASIL", "STATUS": "MEDALI" });
                    e.detailedResults?.forEach(r => data.push({
                        "PERINGKAT": r.rank || '-', 
                        "NAMA ATLET": r.swimmer?.name, 
                        "TAHUN": r.swimmer?.birthYear,
                        "TIM / KLUB": r.swimmer?.club, 
                        "WAKTU": formatTime(r.time),
                        "STATUS": r.rank === 1 ? '🥇 EMAS' : r.rank === 2 ? '🥈 PERAK' : r.rank === 3 ? '🥉 PERUNGGU' : '-'
                    }));
                    data.push({});
                });
                break;
            case 'clubMedals':
                data = processedData.clubs.map((c, i) => ({ 
                    "PERINGKAT": i+1, 
                    "KLUB": c.name, 
                    "EMAS": c.gold, 
                    "PERAK": c.silver, 
                    "PERUNGGU": c.bronze, 
                    "TOTAL": c.gold+c.silver+c.bronze 
                }));
                break;
            case 'clubSwimmerMedals':
                processedData.clubs.forEach(club => {
                    club.individualDetails.forEach((swimmer: any) => {
                        swimmer.medals.forEach((m: any) => {
                            data.push({
                                "KLUB": club.name,
                                "NAMA ATLET": swimmer.name,
                                "NOMOR LOMBA": m.eventName,
                                "MEDALI": m.rank === 1 ? 'EMAS' : m.rank === 2 ? 'PERAK' : 'PERUNGGU',
                                "WAKTU": formatTime(m.time)
                            });
                        });
                    });
                });
                break;
            case 'swimmerTotal':
                const individuals = processedData.individuals;
                const totalMale = individuals.filter(i => i.swimmer?.gender === 'Male');
                const totalFemale = individuals.filter(i => i.swimmer?.gender === 'Female');
                
                if (totalMale.length > 0) {
                    data.push({ "PERINGKAT": "REKAPITULASI MEDALI ATLET - PUTRA" });
                    data.push({ "PERINGKAT": "#", "NAMA ATLET": "NAMA ATLET", "TIM": "TIM / KLUB", "EMAS": "G", "PERAK": "S", "PERUNGGU": "B", "TOTAL": "TOT" });
                    totalMale.forEach((i, idx) => data.push({
                        "PERINGKAT": idx+1, 
                        "NAMA ATLET": i.swimmer.name, 
                        "TIM": i.swimmer.club, 
                        "EMAS": i.gold, 
                        "PERAK": i.silver, 
                        "PERUNGGU": i.bronze, 
                        "TOTAL": i.gold+i.silver+i.bronze
                    }));
                }
                if (totalFemale.length > 0) {
                    data.push({});
                    data.push({ "PERINGKAT": "REKAPITULASI MEDALI ATLET - PUTRI" });
                    data.push({ "PERINGKAT": "#", "NAMA ATLET": "NAMA ATLET", "TIM": "TIM / KLUB", "EMAS": "G", "PERAK": "S", "PERUNGGU": "B", "TOTAL": "TOT" });
                    totalFemale.forEach((i, idx) => data.push({
                        "PERINGKAT": idx+1, 
                        "NAMA ATLET": i.swimmer.name, 
                        "TIM": i.swimmer.club, 
                        "EMAS": i.gold, 
                        "PERAK": i.silver, 
                        "PERUNGGU": i.bronze, 
                        "TOTAL": i.gold+i.silver+i.bronze
                    }));
                }
                break;
            case 'swimmerCategory':
                processedData.categoryLeaderboard.forEach(cat => {
                    data.push({ "PERINGKAT": `KATEGORI: ${cat.ku}` });
                    const catMale = cat.leaders.filter(i => i.swimmer?.gender === 'Male');
                    const catFemale = cat.leaders.filter(i => i.swimmer?.gender === 'Female');
                    
                    if (catMale.length > 0) {
                        data.push({ "PERINGKAT": "PUTRA" });
                        data.push({ "PERINGKAT": "#", "NAMA ATLET": "NAMA ATLET", "TIM": "TIM / KLUB", "EMAS": "G", "PERAK": "S", "PERUNGGU": "B", "TOTAL": "TOT" });
                        catMale.forEach((i, idx) => data.push({
                            "PERINGKAT": idx+1, 
                            "NAMA ATLET": i.swimmer.name, 
                            "TIM": i.swimmer.club, 
                            "EMAS": i.gold, 
                            "PERAK": i.silver, 
                            "PERUNGGU": i.bronze, 
                            "TOTAL": i.gold+i.silver+i.bronze
                        }));
                    }
                    if (catFemale.length > 0) {
                        data.push({ "PERINGKAT": "PUTRI" });
                        data.push({ "PERINGKAT": "#", "NAMA ATLET": "NAMA ATLET", "TIM": "TIM / KLUB", "EMAS": "G", "PERAK": "S", "PERUNGGU": "B", "TOTAL": "TOT" });
                        catFemale.forEach((i, idx) => data.push({
                            "PERINGKAT": idx+1, 
                            "NAMA ATLET": i.swimmer.name, 
                            "TIM": i.swimmer.club, 
                            "EMAS": i.gold, 
                            "PERAK": i.silver, 
                            "PERUNGGU": i.bronze, 
                            "TOTAL": i.gold+i.silver+i.bronze
                        }));
                    }
                    data.push({});
                });
                break;
            case 'onlineRegistration':
                processedData.registrationData.forEach((item, idx) => {
                    data.push({
                        "NO": idx + 1,
                        "NAMA ATLET": item.swimmer.name,
                        "KLUB": item.swimmer.club,
                        "JENIS KELAMIN": item.swimmer.gender === 'Male' ? 'PUTRA' : 'PUTRI',
                        "TAHUN LAHIR": item.swimmer.birthYear,
                        "WA PIC": item.swimmer.picPhone || '-',
                        "NAMA PIC": item.swimmer.picName || '-',
                        "BUKTI BAYAR": item.swimmer.paymentProof ? "TERDOKUMENTASI" : "BELUM UNGGAH",
                        "NOMINAL BAYAR": item.swimmer.paymentAmount || 0,
                        "JUMLAH NOMOR": item.registeredEvents.length,
                        "DAFTAR NOMOR": item.registeredEvents.map(re => `#${re.no} ${re.name}`).join('; '),
                        "DAFTAR WAKTU": item.registeredEvents.map(re => re.time).join('; ')
                    });
                });
                break;
            case 'brokenRecords':
                processedData.broken.forEach((br, i) => {
                    data.push({
                        "NO": i+1,
                        "NOMOR LOMBA": br.newEventName,
                        "NAMA ATLET": br.newHolder.name,
                        "KLUB": br.newHolder.club,
                        "WAKTU BARU": formatTime(br.newTime),
                        "REKOR LAMA": formatTime(br.record.time),
                        "PEMEGANG LAMA": br.record.holderName,
                        "TIPE REKOR": br.record.type
                    });
                });
                break;
            case 'participantCards':
                processedData.registrationData.forEach((item, idx) => {
                    data.push({
                        "NO": idx+1,
                        "ID ATLET": item.swimmer.id,
                        "NAMA ATLET": item.swimmer.name,
                        "KLUB": item.swimmer.club,
                        "TAHUN": item.swimmer.birthYear,
                        "KU": item.swimmer.ageGroup,
                        "JUMLAH NOMOR": item.registeredEvents.length,
                        "DAFTAR NOMOR": item.registeredEvents.map(re => `${re.no}.${re.name}`).join('; ')
                    });
                });
                break;
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Laporan");
        XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (isLoading || !competitionInfo) return <div className="flex justify-center p-20"><Spinner /></div>;

    const reportTitles: Record<ReportType, string> = {
        schedule: 'SUSUNAN ACARA (ORDER OF EVENTS)',
        program: 'BUKU ACARA (MEET PROGRAM)',
        results: 'BUKU HASIL LOMBA (MEET RESULTS)',
        clubMedals: 'REKAPITULASI MEDALI KLUB / TIM',
        clubSwimmerMedals: 'REKAPITULASI MEDALI KLUB & ATLET',
        swimmerTotal: 'REKAPITULASI MEDALI ATLET (TOTAL)',
        swimmerCategory: 'KLASEMEN PERORANGAN (PER KATEGORI)',
        brokenRecords: 'DAFTAR REKOR TERPECAHKAN',
        onlineRegistration: 'LAPORAN PENDAFTARAN ONLINE & PEMBAYARAN',
        participantCards: 'KARTU PESERTA ATLET'
    };

    return (
        <div className="print-view-container">
            <div className="no-print space-y-4 mb-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Pengaturan Laporan</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-black uppercase text-text-secondary mb-1">Pilih Jenis Laporan</label>
                            <select 
                                value={reportType} 
                                onChange={(e) => {
                                    setReportType(e.target.value as ReportType);
                                    setSessionFilter(0);
                                    setSelectedEventIds(new Set());
                                }}
                                className="w-full bg-background border border-border rounded p-2 text-sm font-bold"
                            >
                                {Object.entries(reportTitles).map(([k, v]) => <option key={k} value={k}>{v.replace(/\(.*\)/, '')}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-black uppercase text-text-secondary mb-1">Filter Sesi</label>
                            <select 
                                value={sessionFilter} 
                                onChange={(e) => {
                                    setSessionFilter(Number(e.target.value));
                                    setSelectedEventIds(new Set());
                                }}
                                className="w-full bg-background border border-border rounded p-2 text-sm font-bold"
                            >
                                <option value={0}>SEMUA SESI</option>
                                {availableSessions.map(s => <option key={s} value={s}>SESI {romanize(s)}</option>)}
                            </select>
                        </div>

                        {reportType === 'participantCards' && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-black uppercase text-text-secondary mb-1">Cari Nama Atlet</label>
                                <div className="relative">
                                    <Input 
                                        placeholder="Ketik nama lengkap atau panggilan..." 
                                        value={nameFilter} 
                                        onChange={(e) => setNameFilter(e.target.value)}
                                        className="pl-10"
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    {nameFilter && (
                                        <button 
                                            onClick={() => setNameFilter('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {['program', 'results'].includes(reportType) && (
                        <div className="mt-6 border-t pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-black uppercase text-text-secondary">Pilih Nomor Lomba ({selectedEventIds.size || 'Semua'} Dipilih)</label>
                                <div className="space-x-2">
                                    <button onClick={() => handleToggleAllEvents(true)} className="text-[10px] font-bold text-primary hover:underline">PILIH SEMUA</button>
                                    <button onClick={() => handleToggleAllEvents(false)} className="text-[10px] font-bold text-red-500 hover:underline">HAPUS SEMUA</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-background/50 rounded border">
                                {baseEvents.map(e => (
                                    <label key={e.id} className="flex items-center gap-2 p-1 hover:bg-primary/5 cursor-pointer rounded">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedEventIds.has(e.id)} 
                                            onChange={() => handleToggleEventId(e.id)} 
                                            className="h-4 w-4 rounded border-gray-300 text-primary"
                                        />
                                        <span className="text-[10px] font-bold truncate">#{e.globalEventNumber} - {formatEventName(e)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-6 mt-4 border-t border-border">
                        <div className="flex gap-4">
                             <Button onClick={() => window.print()} className="flex items-center gap-2 px-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                                CETAK / PDF
                            </Button>
                            <Button onClick={handleExportExcel} variant="secondary" className="flex items-center gap-2 px-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                UNDUH EXCEL
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="print-preview-content bg-white text-black p-2 min-h-screen">
                <ReportHeader info={competitionInfo} title={reportTitles[reportType]} />
                
                {reportType === 'schedule' && <ScheduleReport events={baseEvents} info={competitionInfo} />}
                
                {reportType === 'program' && (
                    <EventBaseReport 
                        events={processedData.detailedEvents} 
                        info={competitionInfo} 
                        records={records} 
                    />
                )}
                
                {reportType === 'results' && (
                    <EventBaseReport 
                        events={processedData.detailedEvents} 
                        info={competitionInfo} 
                        records={records} 
                        showResults 
                    />
                )}

                {reportType === 'clubMedals' && <ClubMedalsReport data={processedData.clubs} />}
                
                {reportType === 'clubSwimmerMedals' && <ClubSwimmerMedalsReport data={processedData.clubs} />}
                
                {reportType === 'swimmerTotal' && <AthleteRecapReport data={processedData.individuals} />}
                
                {reportType === 'swimmerCategory' && (
                    <div className="space-y-12">
                        {processedData.categoryLeaderboard.map(cat => (
                            <AthleteRecapReport key={cat.ku} data={cat.leaders} title={`KATEGORI: ${cat.ku}`} />
                        ))}
                    </div>
                )}

                {reportType === 'onlineRegistration' && <OnlineRegistrationReport data={processedData.registrationData} />}
                
                {reportType === 'participantCards' && <ParticipantCardsReport data={processedData.registrationData} info={competitionInfo} />}

                {reportType === 'brokenRecords' && (
                    <div className="space-y-4">
                        {processedData.broken.map((br, i) => (
                            <div key={i} className="p-4 border-2 border-black rounded bg-gray-50 flex justify-between items-center">
                                <div>
                                    <p className="font-black text-sm uppercase text-black">{br.newEventName}</p>
                                    <p className="text-lg font-black uppercase tracking-tight text-black">{br.newHolder.name} ({br.newHolder.club})</p>
                                    <p className="text-[10px] mt-1 font-bold italic text-black uppercase">MEMECAHKAN REKOR {br.record.type} ({formatTime(br.record.time)} - {br.record.holderName})</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-3xl font-black text-black">{formatTime(br.newTime)}</p>
                                </div>
                            </div>
                        ))}
                        {processedData.broken.length === 0 && <p className="text-center italic py-10">TIDAK ADA REKOR YANG TERPECAHKAN PADA SESI INI.</p>}
                    </div>
                )}

                <footer className="pt-8 mt-12 border-t-2 border-black text-center opacity-70 text-[9px] font-bold uppercase tracking-widest">
                     DICETAK PADA: {new Date().toLocaleString('id-ID')} | SYSTEM BY R.E.A.C.T | HALAMAN 1
                </footer>
            </div>
        </div>
    );
};
