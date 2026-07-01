
// We are removing the import of SupabaseUser to break a circular dependency.
// import type { User as SupabaseUser } from '@supabase/supabase-js';

export enum SwimStyle {
  FREESTYLE = 'Freestyle',
  BACKSTROKE = 'Backstroke',
  BREASTSTROKE = 'Breaststroke',
  BUTTERFLY = 'Butterfly',
  MEDLEY = 'Medley',
  PAPAN_LUNCUR = 'Papan Luncur',
}

export enum Gender {
  MALE = "Men's",
  FEMALE = "Women's",
  MIXED = 'Mixed',
}

export interface FormattableEvent {
    distance: number;
    style: SwimStyle;
    gender: Gender;
    relayLegs?: number | null;
    category?: string | null;
}

export interface CompetitionInfo {
    id?: number;
    eventName: string;
    eventDate: string;
    eventLogo: string | null;
    sponsorLogo: string | null;
    isRegistrationOpen?: boolean;
    numberOfLanes?: number;
    registrationDeadline?: string | null;
    ageGroups?: string | null;
    // Payment related fields
    isFree?: boolean;
    recipientName?: string | null;
    accountNumber?: string | null;
    feePerEvent?: number;
}

export interface Swimmer {
  id: string;
  name: string;
  birthYear: number;
  gender: 'Male' | 'Female';
  club: string;
  ageGroup?: string | null;
  // Payment and Contact data
  paymentProof?: string | null;
  paymentAmount?: number | null;
  picName?: string | null;
  picPhone?: string | null;
  paymentHistory?: SwimmerPayment[];
  registrationLogs?: RegistrationLog[];
}

export interface SwimmerPayment {
    id: string;
    swimmerId: string;
    paymentProof: string | null;
    paymentAmount: number | null;
    createdAt: string;
}

export interface RegistrationLog {
    id: string;
    swimmerId: string;
    swimmerName?: string; // Optional name for lists
    registrationDate: string;
    paymentProof: string | null;
    paymentAmount: number | null;
    picName: string | null;
    picPhone: string | null;
    eventIds: string[];
}

export interface Result {
  swimmerId: string;
  time: number; // in milliseconds
}

export interface EventEntry {
    swimmerId: string;
    seedTime: number; // in milliseconds
    checked_in?: boolean; // NEW: Track check-in status
    heatNumber?: number | null;
    laneNumber?: number | null;
}

export interface SwimEvent {
  id:string;
  distance: number;
  style: SwimStyle;
  gender: Gender;
  entries: EventEntry[]; 
  results: Result[];
  sessionNumber?: number;
  heatOrder?: number;
  sessionDateTime?: string;
  relayLegs?: number | null; // e.g., 4 for a 4x100 relay
  category?: string | null;
  lanesLocked?: boolean;
}

export enum View {
  LOGIN,
  ADMIN_DASHBOARD,
  EVENT_SETTINGS,
  RACES,
  PARTICIPANTS,
  SWIMMERS_LIST,
  LIVE_TIMING,
  RESULTS,
  PRINT_MENU,
  USER_MANAGEMENT,
  PUBLIC_RESULTS,
  ONLINE_REGISTRATION,
  CHECKIN,
  SCANNER, // NEW
  RECORD_MANAGEMENT,
  REGISTRATION_LOGS,
}

export interface User {
  id: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  email?: string;
  app_metadata: { [key: string]: any; provider?: string; providers?: string[] };
  user_metadata: { [key: string]: any };
  aud: string;
  created_at: string;
}

export interface Entry {
    swimmerId: string;
    seedTime: number;
    swimmer: Swimmer;
    checked_in?: boolean;
    heatNumber?: number | null;
    laneNumber?: number | null;
}
export interface LaneAssignment {
    lane: number;
    entry: Entry;
}
export interface Heat {
    heatNumber: number;
    assignments: LaneAssignment[];
}

export enum RecordType {
  PORPROV = 'PORPROV',
  NASIONAL = 'Nasional',
}

export interface SwimRecord {
  id: string;
  type: RecordType;
  gender: Gender;
  distance: number;
  style: SwimStyle;
  time: number;
  holderName: string;
  yearSet: number;
  locationSet?: string;
  relayLegs?: number | null;
  category?: string | null;
}

export interface BrokenRecord {
    record: SwimRecord;
    newEventName: string;
    newHolder: Swimmer;
    newTime: number;
}
