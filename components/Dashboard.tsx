import React, { useEffect, useRef, useMemo, useState } from 'react';
import type { Swimmer, SwimEvent, CompetitionInfo } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { useTheme } from '../contexts/ThemeContext';

// --- ICONS ---
const UsersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);
const ClipboardListIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);
const ShieldIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.286zm0 13.036h.008v.008h-.008v-.008z" />
    </svg>
);
const DocumentTextIcon = () => (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
const SortIcon: React.FC<{ direction: 'asc' | 'desc' | 'none' }> = ({ direction }) => {
  if (direction === 'none') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline ml-1 text-text-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 inline ml-1 transition-transform ${direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
  );
};


interface AdminDashboardProps {
  swimmers: Swimmer[];
  events: SwimEvent[];
  competitionInfo: CompetitionInfo | null;
  isLoading: boolean;
}
type ClubAnalysisData = { clubName: string; maleCount: number; femaleCount: number; total: number; percentage: number; };
type SortableKey = keyof ClubAnalysisData;

// Since chart.js is loaded via a script tag, we declare it as a global variable for TypeScript.
declare var Chart: any;

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ swimmers, events, competitionInfo, isLoading }) => {
  const { theme } = useTheme();
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<any>(null); // To hold the chart instance
  const [sortConfig, setSortConfig] = useState<{ key: SortableKey; direction: 'asc' | 'desc' }>({ key: 'total', direction: 'desc' });

  const stats = useMemo(() => {
    const individualSwimmers = swimmers.filter(s => s.birthYear !== 0);
    const swimmerCount = individualSwimmers.length;
    const eventCount = events.length;
    const clubCount = new Set(individualSwimmers.map(s => s.club.trim())).size;
    const totalRegistrations = events.reduce((acc, event) => acc + event.entries.length, 0);
    return { swimmerCount, eventCount, clubCount, totalRegistrations };
  }, [swimmers, events]);

  const relayStats = useMemo(() => {
    const maleTeams = new Set<string>();
    const femaleTeams = new Set<string>();
    const mixedTeams = new Set<string>();

    events.forEach(event => {
        if (event.relayLegs && event.relayLegs > 1) {
            const targetSet = 
                event.gender === "Men's" ? maleTeams :
                event.gender === "Women's" ? femaleTeams :
                event.gender === 'Mixed' ? mixedTeams :
                null;
            
            if (targetSet) {
                event.entries.forEach(entry => {
                    targetSet.add(entry.swimmerId);
                });
            }
        }
    });

    return {
        male: maleTeams.size,
        female: femaleTeams.size,
        mixed: mixedTeams.size,
    };
  }, [events]);

  const clubAnalysisData = useMemo(() => {
    const individualSwimmers = swimmers.filter(s => s.birthYear !== 0);
    const clubData: Record<string, { male: number; female: number }> = {};
    individualSwimmers.forEach(swimmer => {
        if (!clubData[swimmer.club]) {
            clubData[swimmer.club] = { male: 0, female: 0 };
        }
        if (swimmer.gender === 'Male') {
            clubData[swimmer.club].male++;
        } else {
            clubData[swimmer.club].female++;
        }
    });

    const totalSwimmers = individualSwimmers.length;
    return Object.entries(clubData).map(([clubName, counts]) => ({
        clubName,
        maleCount: counts.male,
        femaleCount: counts.female,
        total: counts.male + counts.female,
        percentage: totalSwimmers > 0 ? ((counts.male + counts.female) / totalSwimmers) * 100 : 0,
    }));
  }, [swimmers]);
  
  const sortedClubData = useMemo(() => {
    const sortableData = [...clubAnalysisData];
    if (sortConfig.key) {
      sortableData.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableData;
  }, [clubAnalysisData, sortConfig]);

  const requestSort = (key: SortableKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const chartData = useMemo(() => {
    const topClubs = [...clubAnalysisData].sort((a,b) => b.total - a.total).slice(0, 7);
    const labels = topClubs.map(c => c.clubName);
    const data = topClubs.map(c => c.total);
    return { labels, data };
  }, [clubAnalysisData]);

  useEffect(() => {
    if (!chartRef.current || isLoading) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim();
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Jumlah Atlet',
          data: chartData.data,
          backgroundColor: `${primaryColor}BF`, // primary with 75% opacity
          borderColor: primaryColor,
          borderRadius: 4,
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: false },
            tooltip: {
                backgroundColor: 'var(--color-surface)',
                titleColor: 'var(--color-text-primary)',
                bodyColor: 'var(--color-text-secondary)',
                borderColor: 'var(--color-border)',
                borderWidth: 1,
            }
        },
        scales: {
          y: {
            ticks: { color: textColor },
            grid: { color: 'transparent' }
          },
          x: {
            beginAtZero: true,
            ticks: { color: textColor, precision: 0 },
            grid: { color: gridColor }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [chartData, isLoading, theme]);

  const StatCard: React.FC<{ icon: React.ReactNode, label: string, value: number }> = ({ icon, label, value }) => (
    <Card>
        <div className="flex items-center space-x-4">
            {icon}
            <div>
            <p className="text-text-secondary">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            </div>
        </div>
    </Card>
  );
  
  const TableHeader: React.FC<{ onSort: () => void; label: string; sortKey: SortableKey; currentSort: typeof sortConfig }> = ({ onSort, label, sortKey, currentSort }) => {
    const direction = currentSort.key === sortKey ? currentSort.direction : 'none';
    return (
        <th className="p-3 cursor-pointer hover:bg-background" onClick={onSort}>
            {label}
            <SortIcon direction={direction} />
        </th>
    );
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard Admin</h1>
      {isLoading ? (
        <div className="flex justify-center mt-8">
            <Spinner />
            <p className="ml-4 text-text-secondary">Memuat data...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard icon={<UsersIcon />} label="Total Atlet" value={stats.swimmerCount} />
            <StatCard icon={<ClipboardListIcon />} label="Total Nomor Lomba" value={stats.eventCount} />
            <StatCard icon={<ShieldIcon />} label="Total Tim" value={stats.clubCount} />
            <StatCard icon={<DocumentTextIcon />} label="Total Pendaftaran" value={stats.totalRegistrations} />
          </div>

          <Card className="mt-6">
            <h2 className="text-xl font-bold mb-4">Rekap Tim Estafet (Unik)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:divide-x divide-border">
                <div className="px-2">
                    <p className="text-sm font-semibold text-text-secondary">PUTRA</p>
                    <p className="text-4xl font-bold text-blue-500">{relayStats.male}</p>
                </div>
                <div className="px-2 pt-4 sm:pt-0 sm:border-t-0 border-t border-border">
                    <p className="text-sm font-semibold text-text-secondary">PUTRI</p>
                    <p className="text-4xl font-bold text-pink-500">{relayStats.female}</p>
                </div>
                <div className="px-2 pt-4 sm:pt-0 sm:border-t-0 border-t border-border">
                    <p className="text-sm font-semibold text-text-secondary">CAMPURAN</p>
                    <p className="text-4xl font-bold text-purple-500">{relayStats.mixed}</p>
                </div>
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="text-xl font-bold mb-4">Analisis Tim</h2>
            {swimmers.length > 0 ? (
                 <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <div>
                        <h3 className="text-lg font-semibold text-text-primary mb-2 text-center">Top 7 Tim Berdasarkan Jumlah Atlet</h3>
                         <div style={{ position: 'relative', height: '50vh', minHeight: '350px' }}>
                            <canvas ref={chartRef}></canvas>
                        </div>
                    </div>
                    <div>
                         <h3 className="text-lg font-semibold text-text-primary mb-2 text-center">Rincian Data Tim</h3>
                        <div className="overflow-y-auto max-h-[50vh] border border-border rounded-lg">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-background sticky top-0">
                                    <tr className="border-b border-border">
                                        <TableHeader onSort={() => requestSort('clubName')} label="Nama Tim" sortKey="clubName" currentSort={sortConfig} />
                                        <TableHeader onSort={() => requestSort('maleCount')} label="Putra (L)" sortKey="maleCount" currentSort={sortConfig} />
                                        <TableHeader onSort={() => requestSort('femaleCount')} label="Putri (P)" sortKey="femaleCount" currentSort={sortConfig} />
                                        <TableHeader onSort={() => requestSort('total')} label="Total" sortKey="total" currentSort={sortConfig} />
                                        <TableHeader onSort={() => requestSort('percentage')} label="Persentase" sortKey="percentage" currentSort={sortConfig} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedClubData.map(club => (
                                        <tr key={club.clubName} className="border-b border-border last:border-b-0 hover:bg-background/50">
                                            <td className="p-3 font-semibold">{club.clubName}</td>
                                            <td className="p-3 text-center">{club.maleCount}</td>
                                            <td className="p-3 text-center">{club.femaleCount}</td>
                                            <td className="p-3 text-center font-bold">{club.total}</td>
                                            <td className="p-3 text-center">{club.percentage.toFixed(2)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                 </div>
            ) : (
                <p className="text-text-secondary text-center py-10">Data atlet belum tersedia untuk ditampilkan.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
