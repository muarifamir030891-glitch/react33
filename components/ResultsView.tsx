import React, { useMemo, useState, useEffect, useRef, FC } from 'react';
import type { SwimEvent, Swimmer, BrokenRecord, SwimRecord } from '../types';
import { RecordType, Gender } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { getRecords } from '../services/databaseService';
import { formatEventName, formatTime } from '../constants';

declare var XLSX: any;

interface ResultsViewProps {
  events: SwimEvent[];
  swimmers: Swimmer[];
  isLoading: boolean;
}

const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v3a3 3 0 01-3 3z" /></svg>;
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas">🥇</span>;
    if (rank === 2) return <span title="Perak">🥈</span>;
    if (rank === 3) return <span title="Perunggu">🥉</span>;
    return null;
};

type MedalCounts = { gold: number, silver: number, bronze: number };

export const ResultsView: React.FC<ResultsViewProps> = ({ events, swimmers, isLoading }) => {
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        const fetchRecords = async () => {
            const recordsData = await getRecords();
            setRecords(recordsData);
        };
        fetchRecords();
    }, []);

    const { clubMedals, maleIndividualMedals, femaleIndividualMedals, brokenRecords, eventsWithResults } = useMemo(() => {
        const clubMedals: Record<string, MedalCounts> = {};
        const individualMedals: Record<string, MedalCounts & { swimmer: Swimmer }> = {};
        const brokenRecordsList: BrokenRecord[] = [];
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        // First, calculate all broken records across all events
        events.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winner = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time)[0];
                const winnerSwimmer = winner ? swimmersMap.get(winner.swimmerId) : undefined;
                if (winner && winnerSwimmer) {
                    const checkRecord = (type: string) => {
                        const record = records.find(r => 
                            r.type.toUpperCase() === type.toUpperCase() &&
                            r.gender === event.gender &&
                            r.distance === event.distance &&
                            r.style === event.style &&
                            (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
                            (r.category ?? null) === (event.category ?? null)
                        );
                        if (record && winner.time < record.time) {
                            brokenRecordsList.push({
                               record: record,
                               newEventName: formatEventName(event),
                               newHolder: winnerSwimmer,
                               newTime: winner.time,
                           });
                        }
                    };
                    checkRecord(RecordType.PORPROV);
                    checkRecord(RecordType.NASIONAL);
                }
            }
        });

        const eventsWithResults = events
            .filter(event => event.results && event.results.length > 0)
            .map(event => {
                const validResultsForMedals = [...event.results]
                    .filter(r => r.time > 0)
                    .sort((a, b) => a.time - b.time);

                validResultsForMedals.forEach((result, index) => {
                        const rank = index + 1;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        
                        if (swimmer) {
                            // Tally medals for clubs
                            if (!clubMedals[swimmer.club]) clubMedals[swimmer.club] = { gold: 0, silver: 0, bronze: 0 };
                            if (rank === 1) clubMedals[swimmer.club].gold++;
                            else if (rank === 2) clubMedals[swimmer.club].silver++;
                            else if (rank === 3) clubMedals[swimmer.club].bronze++;

                            // Tally medals for individuals (non-mixed events)
                            if (event.gender !== Gender.MIXED && rank <= 3) {
                                if (!individualMedals[swimmer.id]) {
                                    individualMedals[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 };
                                }
                                if (rank === 1) individualMedals[swimmer.id].gold++;
                                else if (rank === 2) individualMedals[swimmer.id].silver++;
                                else if (rank === 3) individualMedals[swimmer.id].bronze++;
                            }
                        }
                    });

                const getPenalty = (time: number) => {
                    if (time > 0) return 0; // Valid time
                    if (time === -1 || (time < 0 && time !== -2)) return 1; // DQ
                    if (time === -2) return 2; // NS
                    return 3; // Not yet recorded (NT) or 0
                };

                const allSortedResults = [...event.results]
                    .sort((a, b) => {
                        if (a.time > 0 && b.time > 0) return a.time - b.time;
                        return getPenalty(a.time) - getPenalty(b.time);
                    })
                    .map((result) => {
                        const rank = result.time > 0 ? validResultsForMedals.findIndex(r => r.swimmerId === result.swimmerId) + 1 : 0;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        
                        const brokenRecordDetails = brokenRecordsList.filter(br => 
                            br.newHolder.id === swimmer?.id && 
                            br.newTime === result.time &&
                            br.record.style === event.style &&
                            br.record.distance === event.distance &&
                            br.record.gender === event.gender &&
                            (br.record.category ?? null) === (event.category ?? null)
                        );

                        return { ...result, rank, swimmer, brokenRecordDetails };
                    });

                return { ...event, sortedResults: allSortedResults };
            });

        const sortedClubMedals = Object.entries(clubMedals)
            .sort(([, a], [, b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
            
        const sortedIndividualMedals = Object.values(individualMedals)
            .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);

        const uniqueBrokenRecords = [...new Map(brokenRecordsList.map(item => [item.record.id, item])).values()];
        
        const maleIndividualMedals = sortedIndividualMedals.filter(data => data.swimmer.gender === 'Male');
        const femaleIndividualMedals = sortedIndividualMedals.filter(data => data.swimmer.gender === 'Female');

        return { 
            clubMedals: sortedClubMedals, 
            maleIndividualMedals,
            femaleIndividualMedals,
            brokenRecords: uniqueBrokenRecords, 
            eventsWithResults 
        };
    }, [events, swimmers, records]);
    

    if (isLoading) return <div className="flex justify-center mt-8"><Spinner /></div>;
    
    const handleToggleEvent = (eventId: string) => setExpandedEventId(prevId => (prevId === eventId ? null : eventId));
    
    const handleDownloadWinners = () => {
        if (typeof XLSX === 'undefined') {
            alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
            return;
        }
        if (eventsWithResults.length === 0) {
            alert('Tidak ada juara untuk diunduh.');
            return;
        }

        setIsDownloading(true);

        try {
            const dataToExport: {
                "Nomor Lomba": string;
                "Peringkat": number;
                "Nama Peserta": string;
                "Klub/Tim": string;
                "Waktu": string;
            }[] = [];

            const sortedEventsForExport = [...eventsWithResults].sort((a,b) => formatEventName(a).localeCompare(formatEventName(b)));

            sortedEventsForExport.forEach(event => {
                const eventName = formatEventName(event);
                const winners = event.sortedResults.slice(0, 3);

                if (winners.length > 0) {
                    winners.forEach(result => {
                        dataToExport.push({
                            "Nomor Lomba": eventName,
                            "Peringkat": result.rank,
                            "Nama Peserta": result.swimmer?.name || 'N/A',
                            "Klub/Tim": result.swimmer?.club || 'N/A',
                            "Waktu": formatTime(result.time),
                        });
                    });
                }
            });
            
            const finalData = dataToExport.map(d => ({
                'Juara': d.Peringkat,
                'Nama Peserta': d['Nama Peserta'],
                'Klub/Tim': d['Klub/Tim'],
                'Nomor Lomba yang Dimenangkan': d['Nomor Lomba'],
                'Waktu': d.Waktu
            }));


            const worksheet = XLSX.utils.json_to_sheet(finalData);
            worksheet['!cols'] = [
                { wch: 10 }, // Juara
                { wch: 30 }, // Nama Peserta
                { wch: 30 }, // Klub/Tim
                { wch: 40 }, // Nomor Lomba
                { wch: 15 }, // Waktu
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Juara");
            XLSX.writeFile(workbook, "Rekap_Juara_Kompetisi.xlsx");
        } catch (error) {
            console.error("Failed to download winners report:", error);
            alert("Gagal membuat laporan. Silakan coba lagi.");
        } finally {
            setIsDownloading(false);
        }
    };


    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Rekapitulasi Hasil Lomba</h1>
                <Button
                    onClick={handleDownloadWinners}
                    disabled={isDownloading || eventsWithResults.length === 0}
                    variant="secondary"
                    title={eventsWithResults.length === 0 ? "Tidak ada juara untuk diunduh" : "Unduh rekap medali emas, perak, dan perunggu"}
                >
                    {isDownloading ? <Spinner /> : 'Unduh Rekap Juara'}
                </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Team Scores */}
                <Card>
                    <div className="flex items-center space-x-4 mb-4"><TrophyIcon /><h2 className="text-2xl font-bold">Rekapitulasi Medali Tim</h2></div>
                    {clubMedals.length > 0 ? (
                        <div className="overflow-y-auto max-h-96">
                            <table className="w-full text-left">
                                <thead><tr className="border-b-2 border-border"><th className="p-2 w-12 text-center">#</th><th className="p-2">Nama Tim</th><th className="p-2 text-center">🥇</th><th className="p-2 text-center">🥈</th><th className="p-2 text-center">🥉</th></tr></thead>
                                <tbody>{clubMedals.map(([club, medals], index) => (<tr key={club} className="border-b border-border last:border-b-0 hover:bg-background"><td className="p-2 text-center font-bold">{index + 1}</td><td className="p-2 font-semibold">{club}</td><td className="p-2 text-center">{medals.gold}</td><td className="p-2 text-center">{medals.silver}</td><td className="p-2 text-center">{medals.bronze}</td></tr>))}</tbody>
                            </table>
                        </div>
                    ) : <p className="text-text-secondary text-center py-4">Belum ada medali yang diraih.</p>}
                </Card>

                {/* Individual Scores */}
                <Card>
                    <div className="flex items-center space-x-4 mb-4"><UserGroupIcon /><h2 className="text-2xl font-bold">Klasemen Perorangan</h2></div>
                     {(maleIndividualMedals.length > 0 || femaleIndividualMedals.length > 0) ? (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-4">
                            {/* Putra Table */}
                            <div>
                                <h3 className="text-lg font-semibold text-center p-2 rounded-t-lg bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">Putra</h3>
                                <div className="overflow-y-auto max-h-80">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b-2 border-border"><th className="p-2 w-8 text-center">#</th><th className="p-2">Nama Atlet</th><th className="p-2 text-center">🥇</th><th className="p-2 text-center">🥈</th><th className="p-2 text-center">🥉</th></tr></thead>
                                        <tbody>
                                        {maleIndividualMedals.length > 0 ? (
                                            maleIndividualMedals.map((data, index) => (
                                                <tr key={data.swimmer.id} className="border-b border-border last:border-b-0 hover:bg-background">
                                                    <td className="p-2 text-center font-bold">{index + 1}</td>
                                                    <td className="p-2 text-sm"><span className="font-semibold">{data.swimmer.name}</span><span className="block text-xs text-text-secondary">{data.swimmer.club}</span></td>
                                                    <td className="p-2 text-center">{data.gold}</td><td className="p-2 text-center">{data.silver}</td><td className="p-2 text-center">{data.bronze}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan={5} className="text-center p-4 text-text-secondary">Tidak ada data.</td></tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {/* Putri Table */}
                            <div>
                                <h3 className="text-lg font-semibold text-center p-2 rounded-t-lg bg-pink-100 dark:bg-pink-900/50 text-pink-800 dark:text-pink-200">Putri</h3>
                                <div className="overflow-y-auto max-h-80">
                                     <table className="w-full text-left">
                                        <thead><tr className="border-b-2 border-border"><th className="p-2 w-8 text-center">#</th><th className="p-2">Nama Atlet</th><th className="p-2 text-center">🥇</th><th className="p-2 text-center">🥈</th><th className="p-2 text-center">🥉</th></tr></thead>
                                        <tbody>
                                        {femaleIndividualMedals.length > 0 ? (
                                            femaleIndividualMedals.map((data, index) => (
                                                <tr key={data.swimmer.id} className="border-b border-border last:border-b-0 hover:bg-background">
                                                    <td className="p-2 text-center font-bold">{index + 1}</td>
                                                    <td className="p-2 text-sm"><span className="font-semibold">{data.swimmer.name}</span><span className="block text-xs text-text-secondary">{data.swimmer.club}</span></td>
                                                    <td className="p-2 text-center">{data.gold}</td><td className="p-2 text-center">{data.silver}</td><td className="p-2 text-center">{data.bronze}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan={5} className="text-center p-4 text-text-secondary">Tidak ada data.</td></tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : <p className="text-text-secondary text-center py-4">Belum ada medali perorangan yang diraih.</p>}
                    <p className="text-xs text-text-secondary mt-2 text-center">Rekap perorangan tidak termasuk medali dari nomor lomba campuran.</p>
                </Card>
            </div>

            {/* Broken Records */}
            {brokenRecords.length > 0 && (
                <Card className="mt-8">
                    <div className="flex items-center space-x-4 mb-4"><StarIcon /><h2 className="text-2xl font-bold">Pemecahan Rekor</h2></div>
                    <div className="space-y-4">
                        {brokenRecords.map(({ record, newEventName, newHolder, newTime }, i) => (
                           <div key={i} className="bg-background p-4 rounded-lg border border-red-500/50">
                               <p className="font-bold text-lg text-primary">{newEventName} - 
                                <span className={`record-badge ${record.type.toLowerCase()}`}>{record.type}</span>
                               </p>
                               <p className="font-semibold text-xl text-text-primary">{newHolder.name} ({newHolder.club}) - <span className="font-mono">{formatTime(newTime)}</span></p>
                               <p className="text-sm text-text-secondary mt-1">
                                   Memecahkan Rekor <strong className="uppercase">{record.type}</strong> ({formatTime(record.time)}) atas nama {record.holderName} ({record.yearSet})
                               </p>
                           </div>
                        ))}
                    </div>
                </Card>
            )}

            <h2 className="text-2xl font-bold mb-4 mt-8">Hasil per Nomor Lomba</h2>
            <div className="space-y-4">
                {eventsWithResults.length > 0 ? eventsWithResults.map(event => (
                    <Card key={event.id} className="overflow-hidden p-0">
                        <button onClick={() => handleToggleEvent(event.id)} className="w-full flex justify-between items-center p-4 text-left">
                            <h3 className="text-xl font-bold text-primary whitespace-normal break-words">{formatEventName(event)}</h3>
                            <svg className={`h-6 w-6 transform transition-transform text-text-secondary ${expandedEventId === event.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {expandedEventId === event.id && (
                             <div className="pb-4 px-4"><div className="mt-2 pt-4 border-t border-border overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead><tr className="border-b border-border"><th className="p-2 text-center w-12">Rank</th><th className="p-2">Nama Peserta</th><th className="p-2">Klub/Tim</th><th className="p-2 text-right">Waktu</th><th className="p-2 text-center w-16">Medali</th></tr></thead>
                                    <tbody>{event.sortedResults.map(result => (
                                        <tr key={result.swimmerId} className="border-b border-border last:border-b-0 text-sm hover:bg-background">
                                            <td className="p-2 text-center font-bold">{result.rank > 0 ? result.rank : formatTime(result.time)}</td>
                                            <td className="p-2 font-semibold">{result.swimmer?.name || 'N/A'}</td>
                                            <td className="p-2 text-text-secondary">{result.swimmer?.club || 'N/A'}</td>
                                            <td className="p-2 text-right font-mono">
                                                {formatTime(result.time)}
                                                {result.brokenRecordDetails.map(br => (
                                                    <span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>
                                                        {br.record.type}
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="p-2 text-center font-bold text-primary"><Medal rank={result.rank} /></td>
                                        </tr>
                                     ))}</tbody>
                                </table>
                             </div></div>
                        )}
                    </Card>
                )) : ( <Card><p className="text-text-secondary text-center py-6">Tidak ada hasil lomba yang tercatat.</p></Card> )}
            </div>
        </div>
    );
};