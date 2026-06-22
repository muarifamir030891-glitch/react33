import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { SwimEvent, Swimmer, CompetitionInfo, SwimRecord, BrokenRecord } from '../types';
import { RecordType } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { formatEventName } from '../constants';
import { useTheme } from '../contexts/ThemeContext';
import { getPublicData } from '../services/databaseService';
import { supabase } from '../services/supabaseClient';


interface PublicResultsViewProps {
  onAdminLogin: () => void;
}

// --- Custom Hook to get previous value ---
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

// --- Helper Components & Functions ---
const formatTime = (ms: number) => {
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    if (ms === 0) return 'NT';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    const formattedMs = milliseconds.toString().padStart(3, '0').slice(0, 2);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${formattedMs}`;
};

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas" className="text-xl ml-1">🥇</span>;
    if (rank === 2) return <span title="Perak" className="text-xl ml-1">🥈</span>;
    if (rank === 3) return <span title="Perunggu" className="text-xl ml-1">🥉</span>;
    return null;
};


export const PublicResultsView: React.FC<PublicResultsViewProps> = ({ onAdminLogin }) => {
    const [localEvents, setLocalEvents] = useState<SwimEvent[]>([]);
    const [localSwimmers, setLocalSwimmers] = useState<Swimmer[]>([]);
    const [localCompetitionInfo, setLocalCompetitionInfo] = useState<CompetitionInfo | null>(null);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    
    const { theme } = useTheme();
    const prevEvents = usePrevious(localEvents);

    // Real-time data subscription effect
    useEffect(() => {
        const fetchDataAndSubscribe = async () => {
            setIsDataLoading(true);
            const { events: eventsData, swimmers: swimmersData, competitionInfo: infoData, records: recordsData } = await getPublicData();
            
            setLocalEvents(eventsData);
            setLocalSwimmers(swimmersData);
            setLocalCompetitionInfo(infoData);
            setRecords(recordsData || []);
            setIsDataLoading(false);
            setLastUpdated(new Date());

            const channel = supabase
                .channel('public-results')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'event_results' },
                    (payload) => {
                        console.log('Real-time update received!', payload);
                         // Just refetch all public data on any change for simplicity and consistency
                        getPublicData().then(data => {
                            setLocalEvents(data.events);
                            setLastUpdated(new Date());
                        });
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        };

        let cleanup: (() => void) | undefined;
        fetchDataAndSubscribe().then(cleanupFn => {
            if (cleanupFn) cleanup = cleanupFn;
        });

        return () => {
            cleanup?.();
        };
    }, []);
    
    // Highlight effect
    useEffect(() => {
        if (prevEvents && prevEvents.length > 0 && localEvents.length > 0) {
            const prevResultsCount = new Map(prevEvents.map(e => [e.id, e.results.length]));
            for (const event of localEvents) {
                if ((prevResultsCount.get(event.id) ?? 0) < event.results.length) {
                    setHighlightedEventId(event.id);
                    document.getElementById(`event-card-${event.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => setHighlightedEventId(null), 2500);
                    break;
                }
            }
        }
    }, [localEvents, prevEvents]);


    const { eventsWithResults } = useMemo(() => {
        const brokenRecordsList: BrokenRecord[] = [];
        const swimmersMap = new Map<string, Swimmer>(localSwimmers.map(s => [s.id, s]));

        localEvents.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winner = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time)[0];
                const winnerSwimmer = winner ? swimmersMap.get(winner.swimmerId) : undefined;
                if (winner && winnerSwimmer) {
                     [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                        const record = records.find(r => r.type === type && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                        if (record && winner.time < record.time) {
                            brokenRecordsList.push({ record, newEventName: formatEventName(event), newHolder: winnerSwimmer, newTime: winner.time });
                        }
                    });
                }
            }
        });

        const filteredEvents = localEvents
            .filter(event => {
                 if (!event.results || event.results.length === 0) return false;
                 return !searchQuery || formatEventName(event).toLowerCase().includes(searchQuery.toLowerCase());
            })
            .map(event => {
                const getPenalty = (time: number) => {
                    if (time > 0) return 0; // Valid time
                    if (time === -1 || (time < 0 && time !== -2)) return 1; // DQ
                    if (time === -2) return 2; // NS
                    return 3; // Not yet recorded (NT) or 0
                };
                const validResultsForRanking = [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time);

                const sortedResults = [...event.results]
                    .sort((a, b) => {
                        if (a.time > 0 && b.time > 0) return a.time - b.time;
                        return getPenalty(a.time) - getPenalty(b.time);
                    })
                    .map((result) => {
                        const swimmer = swimmersMap.get(result.swimmerId);
                        const rank = result.time > 0 ? validResultsForRanking.findIndex(r => r.swimmerId === result.swimmerId) + 1 : 0;
                        const brokenRecordDetails = brokenRecordsList.filter(br => 
                            br.newHolder.id === swimmer?.id && 
                            br.newTime === result.time &&
                            br.record.style === event.style &&
                            br.record.distance === event.distance
                        );
                        return { ...result, rank, swimmer, brokenRecordDetails };
                    });
                return { ...event, sortedResults };
            })
            .sort((a,b) => (b.sessionNumber ?? 0) - (a.sessionNumber ?? 0) || (b.heatOrder ?? 0) - (a.heatOrder ?? 0));
            
        return { eventsWithResults: filteredEvents };
    }, [localEvents, localSwimmers, searchQuery, records]);
    
    const renderHeader = () => (
        <header className="relative text-center p-4 md:p-6">
            {localCompetitionInfo?.eventLogo && <img src={localCompetitionInfo.eventLogo} alt="Logo Acara" className={`mx-auto h-20 md:h-24 object-contain mb-4 ${theme === 'dark' ? 'bg-white p-2 rounded' : ''}`} />}
            {localCompetitionInfo ? (
                <div>
                    {localCompetitionInfo.eventName.split('\n').map((line, index) => {
                        if (index === 0) {
                            return <h1 key={index} className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">{line}</h1>;
                        } else if (index === 1) {
                            return <h2 key={index} className="text-xl md:text-2xl font-semibold text-text-secondary tracking-wide mt-1">{line}</h2>;
                        } else { // For line 3 and beyond, if any
                            return <h3 key={index} className="text-lg md:text-xl font-medium text-text-secondary tracking-wide">{line}</h3>;
                        }
                    })}
                </div>
            ) : (
                <h1 className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">Hasil Lomba</h1>
            )}
            <p className="text-md md:text-xl text-text-secondary mt-2">{localCompetitionInfo?.eventDate ? new Date(localCompetitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}</p>
        </header>
    );

    return (
        <div className="min-h-screen bg-background text-text-primary secure-view">
            <div className="secure-view-content">
                <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-sm shadow-sm no-print">
                    {renderHeader()}
                </div>
                
                <main className="container mx-auto p-2 md:p-6 no-select">
                    <div className="flex justify-end items-center mb-4">
                        {lastUpdated && <div className="text-right"><p className="text-sm text-text-secondary">Pembaruan Terakhir</p><p className="font-bold">{lastUpdated.toLocaleTimeString('id-ID')}</p></div>}
                    </div>

                    {isDataLoading && localEvents.length === 0 ? <div className="flex justify-center items-center py-20"><Spinner /></div>
                    : (
                        <div className="space-y-4">
                            <Card>
                                <div>
                                    <Input label="Cari Nomor Lomba" id="results-search" type="text" placeholder="Cth: 50m Gaya Bebas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                </div>
                            </Card>
                            {eventsWithResults.length > 0 ? eventsWithResults.map(event => (
                                <Card key={event.id} id={`event-card-${event.id}`} className={`p-4 md:p-6 transition-shadow duration-300 hover:shadow-xl ${highlightedEventId === event.id ? 'flash-animation' : ''}`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-xl md:text-2xl font-bold text-primary">{formatEventName(event)}</h3>
                                        <span className="text-xs md:text-sm font-semibold bg-background px-3 py-1 rounded-full text-text-secondary whitespace-nowrap">{event.sortedResults.length} Finisher</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b-2 border-border text-sm text-text-secondary uppercase">
                                                    <th className="p-2 font-semibold text-center w-16">Peringkat</th>
                                                    <th className="p-2 font-semibold">Nama Peserta</th>
                                                    <th className="p-2 font-semibold hidden md:table-cell">Klub/Tim</th>
                                                    <th className="p-2 font-semibold text-right">Waktu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {event.sortedResults.map(result => {
                                                    const getRankClasses = (rank: number) => {
                                                        if (rank === 1) return 'border-l-4 border-amber-400 bg-amber-400/5';
                                                        if (rank === 2) return 'border-l-4 border-slate-400 bg-slate-400/5';
                                                        if (rank === 3) return 'border-l-4 border-orange-600 bg-orange-600/5';
                                                        return 'border-l-4 border-transparent';
                                                    };
                                                    const isDq = result.time === -1;
                                                    const isNs = result.time === -2;
                                                    return (
                                                        <tr key={result.swimmerId} className={`border-b border-border last:border-b-0 ${isDq ? 'bg-red-500/10' : isNs ? 'bg-gray-500/10' : getRankClasses(result.rank)}`}>
                                                            <td className="p-3 text-center font-bold text-lg">
                                                                {isDq ? <span className="text-red-500">DQ</span> :
                                                                 isNs ? <span className="text-gray-500">NS</span> :
                                                                <>
                                                                <span>{result.rank}</span>
                                                                <Medal rank={result.rank} />
                                                                </>}
                                                            </td>
                                                            <td className="p-3 font-semibold">
                                                                {result.swimmer?.name || 'N/A'}
                                                                <span className="block md:hidden text-xs font-normal text-text-secondary">{result.swimmer?.club || 'N/A'}</span>
                                                            </td>
                                                            <td className="p-3 text-text-secondary hidden md:table-cell">{result.swimmer?.club || 'N/A'}</td>
                                                            <td className="p-3 text-right font-mono">
                                                                {formatTime(result.time)}
                                                                {result.brokenRecordDetails.map(br => (
                                                                    <span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>
                                                                        {br.record.type}
                                                                    </span>
                                                                ))}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )) : ( <Card><p className="text-text-secondary text-center py-10 text-lg">{searchQuery ? `Tidak ada hasil yang cocok dengan "${searchQuery}".` : 'Menunggu hasil lomba pertama...'}</p></Card> )}
                        </div>
                    )}
                </main>
                <footer className="text-center p-4 mt-8 border-t border-border no-print">
                    <Button variant="primary" onClick={onAdminLogin} className="px-6 py-3 text-lg mb-4">
                        &larr; Kembali ke Halaman Utama
                    </Button>
                    <p className="text-xs text-text-secondary">&copy; {new Date().getFullYear()} {localCompetitionInfo?.eventName.split('\n')[0]}. Didukung oleh R.E.A.C.T.</p>
                </footer>
            </div>
            <div className="secure-view-print-message" />
        </div>
    );
};