
import React, { useState, useEffect, useCallback } from 'react';
import { View } from './types';
import type { Swimmer, SwimEvent, CompetitionInfo, User } from './types';
import { LoginView } from './components/LoginView';
import { AdminDashboard } from './components/AdminDashboard';
import { EventSettingsView } from './components/EventSettingsView';
import { EventsView } from './components/EventsView';
import { ParticipantsView } from './components/ParticipantsView';
import { SwimmersView } from './components/SwimmersView';
import { EventDetailView } from './components/EventDetailView';
import { LiveTimingView } from './components/LiveTimingView';
import { ResultsView } from './components/ResultsView';
import { PrintView } from './components/PrintView';
import { PublicResultsView } from './components/PublicResultsView';
import { UserManagementView } from './components/UserManagementView';
import { OnlineRegistrationView } from './components/OnlineRegistrationView';
import { CheckinView } from './components/CheckinView';
import { ScannerView } from './components/ScannerView';
import { RecordManagementView } from './components/RecordManagementView';
import { RegistrationLogsView } from './components/RegistrationLogsView';
import { logout, getCurrentUser } from './services/authService';
import { getPublicData, getSwimmers, getEvents } from './services/databaseService';
import { Button } from './components/ui/Button';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { supabase } from './services/supabaseClient';
import { Spinner } from './components/ui/Spinner';
import { ConnectionStatusIndicator } from './components/ui/ConnectionStatusIndicator';
import { NotificationContainer } from './components/ui/NotificationManager';

type ArduinoStatus = 'connected' | 'disconnected' | 'error' | 'unavailable';

const NavLink: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}> = ({ label, isActive, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-3 w-full text-left px-3 py-2 rounded-md transition-colors ${
      isActive ? 'bg-primary text-white' : 'hover:bg-surface text-text-secondary'
    }`}
    aria-current={isActive ? 'page' : undefined}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const DashboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 10a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const ClipboardListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
const CogIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const MedalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
const PrintIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
const HistoryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const HamburgerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;

const App: React.FC = () => {
  const [appStatus, setAppStatus] = useState<'loading' | 'ready'>('loading');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [navigationState, setNavigationState] = useState<any>(null);

  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [events, setEvents] = useState<SwimEvent[]>(() => {
    try {
      const cached = localStorage.getItem('react_cached_registration_events');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [competitionInfo, setCompetitionInfo] = useState<CompetitionInfo | null>(() => {
    try {
      const cached = localStorage.getItem('react_cached_competition_info');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  const [internetStatus, setInternetStatus] = useState<'online' | 'offline'>('online');
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error' | 'offline' | 'reconnecting'>('checking');
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>('unavailable');

  const refreshData = useCallback(async () => {
    setIsDataLoading(true);
    try {
      const user = getCurrentUser();
      const urlParams = new URLSearchParams(window.location.search);
      const isOnlineReg = urlParams.get('view') === 'registration';
      
      if (user) {
        // ADMIN MODE: Fetch full data safely and directly from supabase client (fast!)
        const [swimmersData, eventsData, infoResult] = await Promise.all([
          getSwimmers(),
          getEvents(),
          supabase.from('competition_info').select('*').eq('id', 1).maybeSingle()
        ]);
        
        const infoData = infoResult.data;
        const formattedInfo = infoData ? {
            id: infoData.id,
            eventName: infoData.event_name,
            eventDate: infoData.event_date,
            eventLogo: infoData.event_logo,
            sponsorLogo: infoData.sponsor_logo,
            isRegistrationOpen: infoData.is_registration_open,
            numberOfLanes: infoData.number_of_lanes,
            registrationDeadline: infoData.registration_deadline,
            ageGroups: infoData.age_groups,
            isFree: infoData.is_free,
            recipientName: infoData.recipient_name,
            accountNumber: infoData.account_number,
            feePerEvent: infoData.fee_per_event
        } : null;
        
        if (formattedInfo) {
          localStorage.setItem('react_cached_competition_info', JSON.stringify(formattedInfo));
        }
        localStorage.setItem('react_cached_registration_events', JSON.stringify(eventsData));
        
        setSwimmers(swimmersData);
        setEvents(eventsData);
        setCompetitionInfo(formattedInfo);
      } else if (isOnlineReg) {
        // ONLINE REGISTRATION VIEW: DO NOT LOAD ALL SWIMMERS! Crucial for performance!
        // We only need competition_info and events list. We can fetch them extremely fast in parallel.
        const [infoResult, eventsData] = await Promise.all([
          supabase.from('competition_info').select('*').eq('id', 1).maybeSingle(),
          getEventsForRegistration()
        ]);

        const infoData = infoResult.data;
        const formattedInfo = infoData ? {
            id: infoData.id,
            eventName: infoData.event_name,
            eventDate: infoData.event_date,
            eventLogo: infoData.event_logo,
            sponsorLogo: infoData.sponsor_logo,
            isRegistrationOpen: infoData.is_registration_open,
            numberOfLanes: infoData.number_of_lanes,
            registrationDeadline: infoData.registration_deadline,
            ageGroups: infoData.age_groups,
            isFree: infoData.is_free,
            recipientName: infoData.recipient_name,
            accountNumber: infoData.account_number,
            feePerEvent: infoData.fee_per_event
        } : null;

        if (formattedInfo) {
          localStorage.setItem('react_cached_competition_info', JSON.stringify(formattedInfo));
        }
        localStorage.setItem('react_cached_registration_events', JSON.stringify(eventsData));

        setCompetitionInfo(formattedInfo);
        setEvents(eventsData);
        setSwimmers([]); // Not needed
      } else {
        // PUBLIC RESULTS VIEW: Load optimized public data (swimmers has no base64 images, events has sparse entries/results)
        const { competitionInfo: infoData, swimmers: swimmersData, events: eventsData } = await getPublicData();
        
        if (infoData) {
          localStorage.setItem('react_cached_competition_info', JSON.stringify(infoData));
        }
        localStorage.setItem('react_cached_registration_events', JSON.stringify(eventsData));
        
        setSwimmers(swimmersData);
        setEvents(eventsData);
        setCompetitionInfo(infoData);
      }
      setDbStatus('connected');
    } catch (error: any) {
      console.error("Failed to refresh data from server:", error.message || JSON.stringify(error));
      setDbStatus('error');
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    const checkUserAndLoadData = async () => {
        const user = getCurrentUser();
        setCurrentUser(user);
        
        const urlParams = new URLSearchParams(window.location.search);
        const publicView = urlParams.get('view');
        const entityId = urlParams.get('id');
        
        if (publicView === 'results') {
            setCurrentView(View.PUBLIC_RESULTS);
        } else if(publicView === 'registration') {
            setCurrentView(View.ONLINE_REGISTRATION);
        } else if(publicView === 'checkin' && entityId) {
            setSelectedEventId(entityId); 
            setCurrentView(View.CHECKIN);
        } else if (user) {
            setCurrentView(View.ADMIN_DASHBOARD);
        } else {
            setCurrentView(View.LOGIN);
        }

        // Load database data immediately on startup
        try {
            setDbStatus('checking');
            await refreshData();
        } catch (error) {
            console.error("Initial data load error:", error);
            setDbStatus('error');
        }

        setAppStatus('ready');
    };

    checkUserAndLoadData();
  }, [refreshData]);

  useEffect(() => {
      const channel = supabase.channel('schema-db-changes');
      channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          refreshData();
      });
      channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
              console.log('Real-time database subscription active.');
              setDbStatus('connected');
          }
          if (status === 'CHANNEL_ERROR') {
              console.warn('Real-time channel socket connection unavailable. Standard Queries/CRUD will continue to work via HTTPS Rest API.', err);
          }
          if (status === 'TIMED_OUT') {
              console.warn('Real-time channel websocket timeout. Standard Queries/CRUD still active.', err);
          }
      });
      return () => {
          supabase.removeChannel(channel);
      };
  }, [refreshData]);
  
  useEffect(() => {
      const handleOnline = () => { 
          setInternetStatus('online'); 
          setDbStatus('checking'); 
          refreshData();
      };
      const handleOffline = () => { 
          setInternetStatus('offline'); 
          setDbStatus('offline'); 
      };
      if (navigator.onLine) setInternetStatus('online');
      else { setInternetStatus('offline'); setDbStatus('offline'); }
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, []);

  const handleArduinoStatusChange = useCallback((status: ArduinoStatus) => {
    setArduinoStatus(status);
  }, []);

  const handleLogin = () => {
    const user = getCurrentUser();
    setCurrentUser(user);
    if(user){
      setCurrentView(View.ADMIN_DASHBOARD);
      refreshData();
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setCurrentView(View.LOGIN);
  };

  const navigateTo = (view: View, state: any = null) => {
    setCurrentView(view);
    setSelectedEventId(null);
    setNavigationState(state);
    setIsMenuOpen(false);
  }

  const handleSelectEvent = (id: string) => {
    setSelectedEventId(id);
    setCurrentView(View.RACES); 
  };
  
  const handleStartTiming = (id: string) => {
    setSelectedEventId(id);
    setCurrentView(View.LIVE_TIMING);
  };

  const handleBackToEvents = () => {
      setSelectedEventId(null);
      setCurrentView(View.RACES);
  }
  
  const handleShowPublicResults = () => setCurrentView(View.PUBLIC_RESULTS);
  const handleBackToLogin = () => setCurrentView(View.LOGIN);
  const handleShowRegistration = () => setCurrentView(View.ONLINE_REGISTRATION);

  const handleScanDetected = (swimmerId: string) => {
    setSelectedEventId(swimmerId);
    setCurrentView(View.CHECKIN);
  };
  
  if (appStatus === 'loading') {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <Spinner />
        <p className="ml-4 text-text-secondary">Initializing Application...</p>
      </div>
    );
  }

  const renderContent = () => {
    const isLoading = isDataLoading;

    if (currentView === View.PUBLIC_RESULTS) return <PublicResultsView onAdminLogin={handleBackToLogin} />;
    if (currentView === View.ONLINE_REGISTRATION) return <OnlineRegistrationView competitionInfo={competitionInfo} events={events} onBackToLogin={handleBackToLogin} onRegistrationSuccess={refreshData} />;
    if (currentView === View.CHECKIN && selectedEventId) return <CheckinView swimmerId={selectedEventId} onBackToLogin={currentUser ? () => navigateTo(View.ADMIN_DASHBOARD) : handleBackToLogin} />;
    
    if (currentView === View.SCANNER) return <ScannerView onBack={() => navigateTo(View.ADMIN_DASHBOARD)} onDetected={handleScanDetected} />;

    if (!currentUser) return (
      <LoginView 
        onLoginSuccess={handleLogin} 
        onShowPublicResults={handleShowPublicResults} 
        onShowRegistration={handleShowRegistration} 
        competitionInfo={competitionInfo}
        isLoadingCompetition={isDataLoading && !competitionInfo}
      />
    );

    if (currentView === View.LIVE_TIMING && selectedEventId) return <LiveTimingView eventId={selectedEventId} onBack={handleBackToEvents} onDataUpdate={refreshData} swimmers={swimmers} competitionInfo={competitionInfo} onStatusChange={handleArduinoStatusChange} />;
    if (currentView === View.RACES && selectedEventId) return <EventDetailView eventId={selectedEventId} onBack={handleBackToEvents} onDataUpdate={refreshData} competitionInfo={competitionInfo} />;
    
    switch (currentView) {
      case View.ADMIN_DASHBOARD: return <AdminDashboard swimmers={swimmers} events={events} competitionInfo={competitionInfo} isLoading={isLoading} navigateTo={navigateTo} />;
      case View.EVENT_SETTINGS: return <EventSettingsView competitionInfo={competitionInfo} events={events} onDataUpdate={refreshData} isLoading={isDataLoading} />;
      case View.RACES: return <EventsView events={events} isLoading={isLoading} onSelectEvent={handleSelectEvent} onStartTiming={handleStartTiming} onDataUpdate={refreshData} />;
      case View.PARTICIPANTS: return <ParticipantsView swimmers={swimmers} events={events} onUploadSuccess={refreshData} competitionInfo={competitionInfo} />;
      case View.SWIMMERS_LIST: return <SwimmersView swimmers={swimmers} events={events} isLoading={isLoading} onDataUpdate={refreshData} initialState={navigationState} competitionInfo={competitionInfo} />;
      case View.RESULTS: return <ResultsView events={events} swimmers={swimmers} isLoading={isLoading} />;
      case View.RECORD_MANAGEMENT: return <RecordManagementView />;
      case View.PRINT_MENU: return <PrintView events={events} swimmers={swimmers} competitionInfo={competitionInfo} isLoading={isLoading} />;
      case View.REGISTRATION_LOGS: return <RegistrationLogsView />;
      case View.USER_MANAGEMENT:
          return <UserManagementView onDataUpdate={refreshData} />;
      default: return <AdminDashboard swimmers={swimmers} events={events} competitionInfo={competitionInfo} isLoading={isLoading} navigateTo={navigateTo}/>;
    }
  };
  
  if (currentView === View.LOGIN || currentView === View.PUBLIC_RESULTS || currentView === View.ONLINE_REGISTRATION || (currentView === View.CHECKIN && !currentUser)) {
      return (
        <>
          <NotificationContainer />
          {renderContent()}
        </>
      );
  }

  return (
    <div className="flex h-screen bg-background text-text-primary">
      <NotificationContainer />
      {isMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" onClick={() => setIsMenuOpen(false)} aria-hidden="true"></div>}
      <aside className={`w-64 bg-surface p-4 flex flex-col justify-between fixed inset-y-0 left-0 z-40 transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:relative md:translate-x-0 no-print`}>
        <div>
            <div className="flex items-center space-x-3 pb-4 mb-4 border-b border-border">
                <svg viewBox="0 0 100 100" className="h-12 w-12 flex-shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs><linearGradient id="waveGradient" x1="20" y1="70" x2="80" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#0077BE"/><stop offset="1" stopColor="#00A8E8"/></linearGradient></defs>
                    <circle cx="50" cy="54" r="38" stroke="#003F88" strokeWidth="6" fill="white"/>
                    <path d="M42 16 H58" stroke="#003F88" strokeWidth="6" strokeLinecap="round"/><path d="M50 16 V8" stroke="#003F88" strokeWidth="6" strokeLinecap="round"/><path d="M78 28 L84 22" stroke="#003F88" strokeWidth="6" strokeLinecap="round"/>
                    <path d="M25 68 C 35 50, 55 52, 60 62 C 65 72, 75 70, 80 65 L 80 85 L 25 85 Z" fill="url(#waveGradient)"/>
                </svg>
                <div>
                    <h1 className="text-xl font-bold text-primary" style={{fontStyle: 'italic'}}>R.E.A.C.T</h1>
                    <p className="text-xs text-text-secondary leading-tight">Real-time Evaluation for Aquatic Competition & Timing</p>
                </div>
            </div>
            <nav className="space-y-2">
                <NavLink label="Dashboard" icon={<DashboardIcon />} isActive={currentView === View.ADMIN_DASHBOARD} onClick={() => navigateTo(View.ADMIN_DASHBOARD)}/>
                <NavLink label="Pengaturan Acara" icon={<CogIcon />} isActive={currentView === View.EVENT_SETTINGS} onClick={() => navigateTo(View.EVENT_SETTINGS)}/>
                <NavLink label="Nomor Lomba" icon={<ClipboardListIcon />} isActive={currentView === View.RACES || currentView === View.LIVE_TIMING} onClick={() => navigateTo(View.RACES)}/>
                <NavLink label="Unggah Peserta" icon={<UploadIcon />} isActive={currentView === View.PARTICIPANTS} onClick={() => navigateTo(View.PARTICIPANTS)}/>
                <NavLink label="Daftar Atlet" icon={<UsersIcon />} isActive={currentView === View.SWIMMERS_LIST} onClick={() => navigateTo(View.SWIMMERS_LIST)}/>
                <NavLink label="Log Pendaftaran" icon={<HistoryIcon />} isActive={currentView === View.REGISTRATION_LOGS} onClick={() => navigateTo(View.REGISTRATION_LOGS)}/>
                <NavLink label="Manajemen Rekor" icon={<MedalIcon />} isActive={currentView === View.RECORD_MANAGEMENT} onClick={() => navigateTo(View.RECORD_MANAGEMENT)}/>
                <NavLink label="Hasil Lomba" icon={<MedalIcon />} isActive={currentView === View.RESULTS} onClick={() => navigateTo(View.RESULTS)}/>
                <NavLink label="Unduh Laporan" icon={<PrintIcon />} isActive={currentView === View.PRINT_MENU} onClick={() => navigateTo(View.PRINT_MENU)}/>
            </nav>
        </div>
        <div className="space-y-2">
            <ConnectionStatusIndicator internetStatus={internetStatus} dbStatus={dbStatus} arduinoStatus={arduinoStatus} />
            <ThemeToggle />
            <Button onClick={handleLogout} variant="secondary" className="w-full flex items-center justify-center space-x-2"><LogoutIcon /><span>Logout</span></Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className="md:hidden flex items-center p-4 border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-20 no-print">
            <button onClick={() => setIsMenuOpen(true)} className="p-2 rounded-md text-text-secondary hover:bg-background focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary" aria-label="Open menu"><HamburgerIcon /></button>
            <h1 className="text-lg font-bold text-primary ml-4 truncate">{competitionInfo?.eventName.split('\n')[0] || "R.E.A.C.T"}</h1>
        </header>
        <div className="p-8 flex-grow">{renderContent()}</div>
      </main>
    </div>
  );
};

export default App;
