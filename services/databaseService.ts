
import type { Swimmer, SwimEvent, Result, CompetitionInfo, EventEntry, SwimRecord, User, FormattableEvent, SwimmerPayment, RegistrationLog } from '../types';
import { supabase } from './supabaseClient';
import { Gender, SwimStyle, RecordType } from '../types';
import { GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, toTitleCase } from '../constants';
import { config } from '../config';

// --- MAPPING FUNCTIONS ---

const toUser = (data: any): User => ({
    id: data.id,
    role: data.role,
    created_at: data.created_at || new Date().toISOString(),
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
});

const toCompetitionInfo = (data: any): CompetitionInfo | null => (data ? {
    id: data.id,
    eventName: data.event_name,
    eventDate: data.event_date,
    eventLogo: data.event_logo,
    sponsorLogo: data.sponsor_logo,
    isRegistrationOpen: data.is_registration_open,
    numberOfLanes: data.number_of_lanes,
    // FIX: Menggunakan camelCase agar sesuai dengan interface tipe data
    registrationDeadline: data.registration_deadline,
    ageGroups: data.age_groups,
    isFree: data.is_free,
    recipientName: data.recipient_name,
    accountNumber: data.account_number,
    feePerEvent: data.fee_per_event
} : null);

const toSwimmer = (data: any): Swimmer => ({
    id: data.id,
    name: data.name,
    birthYear: data.birth_year,
    gender: data.gender,
    club: data.club,
    ageGroup: data.age_group,
    paymentProof: data.payment_proof,
    paymentAmount: data.payment_amount,
    picName: data.pic_name,
    picPhone: data.pic_phone,
    paymentHistory: data.swimmer_payments?.map(toSwimmerPayment) || [],
    registrationLogs: data.registration_logs?.map(toRegistrationLog) || []
});

const toSwimmerPayment = (data: any): SwimmerPayment => ({
    id: data.id,
    swimmerId: data.swimmer_id,
    paymentProof: data.payment_proof,
    paymentAmount: data.payment_amount,
    createdAt: data.created_at
});

const toRegistrationLog = (data: any): RegistrationLog => ({
    id: data.id,
    swimmerId: data.swimmer_id,
    swimmerName: data.swimmers?.name, // Join data
    registrationDate: data.registration_date,
    paymentProof: data.payment_proof,
    paymentAmount: data.payment_amount,
    picName: data.pic_name,
    picPhone: data.pic_phone,
    eventIds: data.event_ids || []
});

const toEventEntry = (data: any): EventEntry => ({
    swimmerId: data.swimmer_id,
    seedTime: data.seed_time,
    checked_in: data.checked_in || false
});

const toResult = (data: any): Result => ({
    swimmerId: data.swimmer_id,
    time: data.time
});

const toSwimEvent = (data: any): SwimEvent => ({
    id: data.id,
    distance: data.distance,
    style: data.style as SwimStyle,
    gender: data.gender as Gender,
    sessionNumber: data.session_number,
    heatOrder: data.heat_order,
    sessionDateTime: data.session_date_time,
    relayLegs: data.relay_legs,
    category: data.category,
    entries: data.event_entries?.map(toEventEntry) || [],
    results: data.event_results?.map(toResult) || []
});

const toRecord = (data: any): SwimRecord => ({
    id: data.id,
    type: data.type as RecordType,
    gender: data.gender as Gender,
    distance: data.distance,
    style: data.style as SwimStyle,
    time: data.time,
    holderName: data.holder_name,
    yearSet: data.year_set,
    locationSet: data.location_set,
    relayLegs: data.relay_legs,
    category: data.category
});

// --- PUBLIC DATA ---

export const getPublicData = async () => {
    const response = await fetch('/.netlify/functions/getPublicData');
    if (!response.ok) throw new Error('Failed to fetch public data');
    return response.json();
};

// --- SWIMMER SERVICES ---

export const getSwimmers = async (): Promise<Swimmer[]> => {
    const { data, error } = await supabase
        .from('swimmers')
        .select('id, name, birth_year, gender, club, age_group, payment_amount, pic_name, pic_phone, swimmer_payments(id, swimmer_id, payment_amount, created_at), registration_logs(id, swimmer_id, registration_date, payment_amount, pic_name, pic_phone, event_ids)');
    if (error) throw error;
    return data.map(toSwimmer);
};

export const getSwimmerById = async (id: string): Promise<Swimmer | null> => {
    const { data, error } = await supabase
        .from('swimmers')
        .select('id, name, birth_year, gender, club, age_group, payment_amount, pic_name, pic_phone, swimmer_payments(id, swimmer_id, payment_amount, created_at), registration_logs(id, swimmer_id, registration_date, payment_amount, pic_name, pic_phone, event_ids)')
        .eq('id', id)
        .single();
    if (error) return null;
    return toSwimmer(data);
};

export const findSwimmerByName = async (name: string): Promise<Swimmer | null> => {
    const { data, error } = await supabase
        .from('swimmers')
        .select('id, name, birth_year, gender, club, age_group, payment_amount, pic_name, pic_phone')
        .ilike('name', name)
        .limit(1)
        .maybeSingle(); // Better than single() which errors if no rows
    if (error) return null;
    return data ? toSwimmer(data) : null;
};

export const getSwimmerBestTime = async (swimmerId: string, distance: number, style: SwimStyle): Promise<number> => {
    // Cari semua event yang sesuai dengan jarak dan gaya
    const { data: events, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('distance', distance)
        .eq('style', style);
    
    if (eventError || !events || events.length === 0) return 0;

    const eventIds = events.map(e => e.id);

    // Cari waktu terbaik di antara event-event tersebut
    const { data: results, error: resultError } = await supabase
        .from('event_results')
        .select('time')
        .eq('swimmer_id', swimmerId)
        .in('event_id', eventIds)
        .gt('time', 0) // Pastikan bukan DQ, NS, atau NT
        .order('time', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (resultError || !results) return 0;
    return results.time;
};

export const getSwimmerRegisteredEventIds = async (swimmerId: string): Promise<string[]> => {
    const { data, error } = await supabase
        .from('event_entries')
        .select('event_id')
        .eq('swimmer_id', swimmerId);
    
    if (error) return [];
    return data.map(entry => entry.event_id);
};

export const getSwimmerResults = async (swimmerId: string): Promise<Result[]> => {
    const { data, error } = await supabase
        .from('event_results')
        .select('*')
        .eq('swimmer_id', swimmerId);
    if (error) return [];
    return data.map(toResult);
};

// --- CHECKIN SERVICE ---
export const updateCheckinStatus = async (eventId: string, swimmerId: string, status: boolean) => {
    const { error } = await supabase
        .from('event_entries')
        .update({ checked_in: status } as any)
        .eq('event_id', eventId)
        .eq('swimmer_id', swimmerId);
    
    if (error) throw error;
    return true;
};

// --- REST OF SERVICES ---
import { getCurrentUser } from './authService';

export const addSwimmer = async (swimmer: Omit<Swimmer, 'id'>): Promise<Swimmer> => {
    const { data, error } = await supabase.from('swimmers').insert({
        name: swimmer.name,
        birth_year: swimmer.birthYear,
        gender: swimmer.gender,
        club: swimmer.club,
        age_group: swimmer.ageGroup || null,
        payment_proof: swimmer.paymentProof || null,
        payment_amount: swimmer.paymentAmount || 0,
        pic_name: swimmer.picName || null,
        pic_phone: swimmer.picPhone || null
    } as any).select('*').single();
    if (error) throw error;
    return toSwimmer(data);
};

export const updateSwimmer = async (id: string, swimmer: Partial<Omit<Swimmer, 'id'>>): Promise<Swimmer> => {
    const { data, error } = await supabase.from('swimmers').update({
        name: swimmer.name,
        birth_year: swimmer.birthYear,
        gender: swimmer.gender,
        club: swimmer.club,
        age_group: swimmer.ageGroup || null,
        payment_proof: swimmer.paymentProof,
        payment_amount: swimmer.paymentAmount,
        pic_name: swimmer.picName || null,
        pic_phone: swimmer.picPhone || null
    } as any).eq('id', id).select('*').single();
    if (error) throw error;
    return toSwimmer(data);
};

export const deleteSwimmer = async (id: string): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().eq('id', id);
    if (error) throw error;
};

export const deleteAllSwimmers = async (): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
};

export const getEvents = async (): Promise<SwimEvent[]> => {
    const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)');
    if (error) throw error;
    return data.map(toSwimEvent);
};

export const getEventById = async (id: string): Promise<SwimEvent | null> => {
    const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)').eq('id', id).single();
    if (error) return null;
    return toSwimEvent(data);
};

export const addEvent = async (event: Omit<SwimEvent, 'id' | 'entries' | 'results'>): Promise<SwimEvent> => {
    const { data, error } = await supabase.from('events').insert({
        distance: event.distance,
        style: event.style,
        gender: event.gender,
        relay_legs: event.relayLegs || null,
        category: event.category || null
    } as any).select('*, event_entries(*), event_results(*)').single();
    if (error) throw error;
    return toSwimEvent(data);
};

export const deleteEvent = async (id: string): Promise<void> => {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
};

export const updateEvent = async (id: string, event: Partial<Omit<SwimEvent, 'id' | 'entries' | 'results'>>): Promise<SwimEvent> => {
    const { data, error } = await supabase.from('events').update({
        distance: event.distance,
        style: event.style,
        gender: event.gender,
        relay_legs: event.relayLegs,
        category: event.category
    } as any).eq('id', id).select('*, event_entries(*), event_results(*)').single();
    if (error) throw error;
    return toSwimEvent(data);
};

export const deleteAllEvents = async (): Promise<void> => {
    const { error } = await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
};

export const registerSwimmerToEvent = async (eventId: string, swimmerId: string, seedTime: number) => {
    const { error } = await supabase.from('event_entries').upsert({
        event_id: eventId,
        swimmer_id: swimmerId,
        seed_time: seedTime
    } as any);
    if (error) return { success: false, message: error.message };
    return { success: true };
};

export const unregisterSwimmerFromEvent = async (eventId: string, swimmerId: string) => {
    const { error } = await supabase.from('event_entries').delete().eq('event_id', eventId).eq('swimmer_id', swimmerId);
    if (error) throw error;
};

export const updateSwimmerSeedTime = async (eventId: string, swimmerId: string, seedTime: number) => {
    const { error } = await supabase.from('event_entries').update({ seed_time: seedTime } as any).eq('event_id', eventId).eq('swimmer_id', swimmerId);
    if (error) throw error;
};

export const recordEventResults = async (eventId: string, results: Result[]) => {
    const { error } = await supabase.from('event_results').upsert(
        results.map(r => ({ event_id: eventId, swimmer_id: r.swimmerId, time: r.time })) as any[]
    );
    if (error) throw error;
};

export const addOrUpdateEventResults = recordEventResults;

export const getEventsForRegistration = async (): Promise<SwimEvent[]> => {
    const { data, error } = await supabase.from('events').select('*');
    if (error) throw error;
    return data.map(toSwimEvent);
};

export const getRecords = async (): Promise<SwimRecord[]> => {
    const { data, error } = await supabase.from('records').select('*');
    if (error) throw error;
    return data.map(toRecord);
};

export const addOrUpdateRecord = async (record: Partial<SwimRecord>): Promise<void> => {
    const { error } = await supabase.from('records').upsert({
        id: record.id,
        type: record.type,
        gender: record.gender,
        distance: record.distance,
        style: record.style,
        time: record.time,
        holder_name: record.holderName,
        year_set: record.yearSet,
        location_set: record.locationSet || null,
        relay_legs: record.relayLegs || null,
        category: record.category || null
    } as any);
    if (error) throw error;
};

export const deleteRecord = async (id: string): Promise<void> => {
    const { error } = await supabase.from('records').delete().eq('id', id);
    if (error) throw error;
};

export const deleteAllRecords = async (): Promise<void> => {
    const { error } = await supabase.from('records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
};

export const updateCompetitionInfo = async (info: CompetitionInfo): Promise<void> => {
    const { error } = await supabase.from('competition_info').upsert({
        id: 1,
        event_name: info.eventName,
        event_date: info.eventDate,
        event_logo: info.eventLogo,
        sponsor_logo: info.sponsorLogo,
        is_registration_open: info.isRegistrationOpen,
        number_of_lanes: info.numberOfLanes,
        registration_deadline: info.registrationDeadline,
        age_groups: info.ageGroups,
        is_free: info.isFree,
        recipient_name: info.recipientName,
        account_number: info.accountNumber,
        fee_per_event: info.feePerEvent
    } as any);
    if (error) throw error;
};

export const updateEventSchedule = async (events: SwimEvent[]): Promise<void> => {
    if (events.length === 0) return;
    
    const { error } = await supabase.from('events').upsert(
        events.map(e => ({
            id: e.id,
            distance: e.distance,
            style: e.style,
            gender: e.gender,
            session_number: e.sessionNumber ?? null,
            heat_order: e.heatOrder ?? null,
            session_date_time: e.sessionDateTime || null,
            relay_legs: e.relayLegs || null,
            category: e.category || null
        })) as any[]
    );
    if (error) {
        console.error("Supabase Error in updateEventSchedule:", error);
        throw error;
    }
};

export const processEventUpload = async (json: any[]) => {
    let success = 0;
    const errors: string[] = [];
    for (const row of json) {
        try {
            const distance = parseInt(row["Jarak (m)"]);
            const styleName = row["Gaya"];
            const genderName = row["Jenis Kelamin"];
            const category = row["Kategori"] || null;
            const relayLegs = parseInt(row["Jumlah Atlet"]) || null;

            let style: SwimStyle | undefined;
            for (const [s, t] of Object.entries(SWIM_STYLE_TRANSLATIONS)) {
                if (t === styleName) { style = s as SwimStyle; break; }
            }
            if (!style) throw new Error(`Gaya "${styleName}" tidak valid.`);

            let gender: Gender | undefined;
            for (const [g, t] of Object.entries(GENDER_TRANSLATIONS)) {
                if (t === genderName) { gender = g as Gender; break; }
            }
            if (!gender) throw new Error(`Jenis Kelamin "${genderName}" tidak valid.`);

            await addEvent({ distance, style, gender, category, relayLegs });
            success++;
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    return { success, errors };
};

export const processParticipantUpload = async (json: any[]) => {
    let newSwimmers = 0;
    let updatedSwimmers = 0;
    const errors: string[] = [];

    for (const row of json) {
        try {
            const name = toTitleCase(row["Nama Atlet"] || "");
            const birthYear = parseInt(row["Tahun Lahir"]);
            const genderSymbol = row["Jenis Kelamin (L/P)"];
            const club = toTitleCase(row["Nama Tim"] || "");
            const ageGroup = row["KU"] || null;
            const eventName = row["Nomor Lomba"];
            const seedTimeStr = row["Waktu Unggulan (mm:ss.SS)"] || "99:99.99";

            if (!name || !club || !eventName) throw new Error("Data tidak lengkap.");

            const gender = genderSymbol === 'L' ? 'Male' : 'Female';

            const { data: existingSwimmers } = await supabase.from('swimmers').select('*').ilike('name', name).eq('birth_year', birthYear).eq('gender', gender);
            let swimmer: Swimmer;
            if (existingSwimmers && existingSwimmers.length > 0) {
                swimmer = toSwimmer(existingSwimmers[0]);
                updatedSwimmers++;
            } else {
                swimmer = await addSwimmer({ name, birthYear, gender, club, ageGroup });
                newSwimmers++;
            }

            const allEvents = await getEvents();
            const event = allEvents.find(e => formatEventName(e) === eventName);
            if (!event) throw new Error(`Nomor lomba "${eventName}" tidak ditemukan.`);

            let seedTime = 0;
            if (seedTimeStr.includes(':')) {
                const [min, rest] = seedTimeStr.split(':');
                const [sec, centi] = rest.split('.');
                seedTime = (parseInt(min) * 60000) + (parseInt(sec) * 1000) + (parseInt(centi) * 10);
            }
            if (seedTimeStr === "99:99.99") seedTime = 0;

            await registerSwimmerToEvent(event.id, swimmer.id, seedTime);
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    return { newSwimmers, updatedSwimmers, errors };
};

export const processRecordUpload = async (json: any[]) => {
    let success = 0;
    const errors: string[] = [];
    for (const row of json) {
        try {
            const type = row["Tipe"] || RecordType.PORPROV;
            const distance = parseInt(row["Jarak (m)"]);
            const styleName = row["Gaya"];
            const genderName = row["Jenis Kelamin"];
            const category = row["Kategori"] || null;
            const holderName = row["Pemegang Rekor"];
            const yearSet = parseInt(row["Tahun"]);
            const timeStr = row["Waktu"];

            let style: SwimStyle | undefined;
            for (const [s, t] of Object.entries(SWIM_STYLE_TRANSLATIONS)) {
                if (t === styleName) { style = s as SwimStyle; break; }
            }
            if (!style) throw new Error(`Gaya "${styleName}" tidak valid.`);

            let gender: Gender | undefined;
            for (const [g, t] of Object.entries(GENDER_TRANSLATIONS)) {
                if (t === genderName) { gender = g as Gender; break; }
            }
            if (!gender) throw new Error(`Jenis Kelamin "${genderName}" tidak valid.`);

            let time = 0;
            if (timeStr && timeStr.includes(':')) {
                const [min, rest] = timeStr.split(':');
                const [sec, centi] = rest.split('.');
                time = (parseInt(min) * 60000) + (parseInt(sec) * 1000) + (parseInt(centi) * 10);
            }

            const recordId = `${type.toUpperCase()}_${gender}_${distance}_${style}${category ? `_${category}` : ''}`;

            await addOrUpdateRecord({
                id: recordId,
                type: type as RecordType,
                distance,
                style,
                gender,
                category,
                holderName,
                yearSet,
                time
            });
            success++;
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    return { success, errors };
};

export const backupDatabase = async () => {
    const [info, swimmers, events, event_entries, event_results, records] = await Promise.all([
        supabase.from('competition_info').select('*'),
        supabase.from('swimmers').select('*'),
        supabase.from('events').select('*'),
        supabase.from('event_entries').select('*'),
        supabase.from('event_results').select('*'),
        supabase.from('records').select('*'),
    ]);
    return {
        competition_info: info.data,
        swimmers: swimmers.data,
        events: events.data,
        event_entries: event_entries.data,
        event_results: event_results.data,
        records: records.data,
    };
};

export const clearAllData = async (): Promise<void> => {
    // SECURITY: Ensure user is still authenticated (check both Supabase and app state)
    const { data: { session } } = await supabase.auth.getSession();
    const localUser = getCurrentUser();
    
    if (!session && !localUser) {
        throw new Error("Sesi berakhir. Silakan login kembali untuk menghapus data.");
    }

    console.log("Starting full database wipe...");

    // 1. Delete results first (references swimmers and events)
    const results = await supabase.from('event_results').delete().neq('swimmer_id', '00000000-0000-0000-0000-000000000000');
    if (results.error) {
        console.error("Error clearing event_results:", results.error);
        throw new Error(`Gagal menghapus hasil lomba: ${results.error.message}`);
    }

    // 2. Delete entries (references swimmers and events)
    const entries = await supabase.from('event_entries').delete().neq('swimmer_id', '00000000-0000-0000-0000-000000000000');
    if (entries.error) {
        console.error("Error clearing event_entries:", entries.error);
        throw new Error(`Gagal menghapus entri pendaftaran: ${entries.error.message}`);
    }

    // 3. Delete swimmers
    const swimmers = await supabase.from('swimmers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (swimmers.error) {
        console.error("Error clearing swimmers:", swimmers.error);
        throw new Error(`Gagal menghapus atlet: ${swimmers.error.message}`);
    }

    // 4. Delete events
    const events = await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (events.error) {
        console.error("Error clearing events:", events.error);
        throw new Error(`Gagal menghapus nomor lomba: ${events.error.message}`);
    }

    // 5. Delete records
    const records = await supabase.from('records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (records.error) {
        console.error("Error clearing records:", records.error);
        throw new Error(`Gagal menghapus rekor: ${records.error.message}`);
    }

    console.log("Full database wipe completed successfully.");
};

export const restoreDatabase = async (data: any) => {
    // SECURITY: Ensure user is still authenticated (check both Supabase and app state)
    const { data: { session } } = await supabase.auth.getSession();
    const localUser = getCurrentUser();

    if (!session && !localUser) {
        throw new Error("Sesi berakhir. Silakan login kembali untuk memulihkan data.");
    }

    await clearAllData();
    console.log("Starting data restoration...");

    const tables = [
        { name: 'competition_info', payload: data.competition_info, op: 'upsert' },
        { name: 'swimmers', payload: data.swimmers, op: 'insert' },
        { name: 'events', payload: data.events, op: 'insert' },
        { name: 'event_entries', payload: data.event_entries, op: 'insert' },
        { name: 'event_results', payload: data.event_results, op: 'insert' },
        { name: 'records', payload: data.records, op: 'insert' }
    ];

    for (const table of tables) {
        if (table.payload && table.payload.length > 0) {
            console.log(`Restoring table: ${table.name} (${table.payload.length} rows)`);
            
            // Supabase supports up to ~1000 rows per request usually, but let's chunk if very large.
            // Swimmers payload might contain massive base64 image data (payment proof), so use a small chunk size of 5 to avoid timeouts.
            const CHUNK_SIZE = table.name === 'swimmers' ? 5 : 200;
            for (let i = 0; i < table.payload.length; i += CHUNK_SIZE) {
                const chunk = table.payload.slice(i, i + CHUNK_SIZE);
                let res;
                if (table.op === 'upsert') {
                    res = await supabase.from(table.name).upsert(chunk);
                } else {
                    res = await supabase.from(table.name).insert(chunk);
                }
                
                if (res.error) {
                    console.error(`Error restoring ${table.name}:`, res.error);
                    throw new Error(`Gagal memulihkan tabel ${table.name} pada baris ${i}: ${res.error.message}`);
                }
            }
        }
    }
    console.log("Data restoration completed successfully.");
};

export const processOnlineRegistration = async (
    swimmerData: Omit<Swimmer, 'id'>,
    registrations: { eventId: string, seedTime: number }[]
): Promise<{ success: boolean; message: string; swimmer: Swimmer | null }> => {
    try {
        const response = await fetch('/.netlify/functions/submitRegistration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ swimmerData, registrations }),
        });

        if (!response.ok) {
            let errorMessage = `Server error: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || JSON.stringify(errorData);
            } catch (e) {}
            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (error: any) {
        return { success: false, message: error.message, swimmer: null };
    }
};

export const processCollectiveRegistration = async (
    teamData: { clubName: string, picName: string, picPhone: string, paymentProof: string | null, paymentAmount: number },
    participants: any[]
): Promise<{ success: boolean; message: string }> => {
    try {
        const response = await fetch('/.netlify/functions/submitCollectiveRegistration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ teamData, participants }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Gagal mengirim pendaftaran kolektif.');
        }

        return await response.json();
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};



export const getUsers = async (): Promise<User[]> => { 
    const { data, error } = await supabase.from('users').select('*'); 
    if (error) throw error; 
    return data.map(toUser); 
};

export const getAllRegistrationLogs = async (): Promise<RegistrationLog[]> => {
    const { data, error } = await supabase
        .from('registration_logs')
        .select('*, swimmers(name)')
        .order('registration_date', { ascending: false });
    
    if (error) throw error;
    return data.map(toRegistrationLog);
};

