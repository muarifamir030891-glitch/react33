import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Helper functions to map DB schema to app types (camelCase)
const toCompetitionInfo = (data) => (data ? {
    eventName: data.event_name,
    eventDate: data.event_date,
    eventLogo: data.event_logo,
    sponsorLogo: data.sponsor_logo,
    isRegistrationOpen: data.is_registration_open,
    numberOfLanes: data.number_of_lanes,
    registrationDeadline: data.registration_deadline,
    ageGroups: data.age_groups,
    isFree: data.is_free,
    recipientName: data.recipient_name,
    accountNumber: data.account_number,
    feePerEvent: data.fee_per_event
} : null);

const toSwimmer = (data) => ({
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
});

const toEventEntry = (data) => ({
    swimmerId: data.swimmer_id,
    seedTime: data.seed_time
});

const toResult = (data) => ({
    swimmerId: data.swimmer_id,
    time: data.time
});

const toSwimEvent = (data) => ({
    id: data.id,
    distance: data.distance,
    style: data.style,
    gender: data.gender,
    sessionNumber: data.session_number,
    heatOrder: data.heat_order,
    sessionDateTime: data.session_date_time,
    relayLegs: data.relay_legs,
    category: data.category,
    entries: data.event_entries?.map(toEventEntry) || [],
    results: data.event_results?.map(toResult) || []
});

const toRecord = (data) => ({
    id: data.id,
    type: data.type,
    gender: data.gender,
    distance: data.distance,
    style: data.style,
    time: data.time,
    holderName: data.holder_name,
    yearSet: data.year_set,
    locationSet: data.location_set,
    relayLegs: data.relay_legs,
    category: data.category
});

export const handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
    if (!supabaseAdmin) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Database configuration error on server.' }) };
    }

    try {
        const [infoRes, swimmersRes, eventsRes, recordsRes] = await Promise.all([
            supabaseAdmin.from('competition_info').select('*').eq('id', 1).single(),
            supabaseAdmin.from('swimmers').select('id, name, club, birth_year, gender, age_group'),
            supabaseAdmin.from('events').select('id, distance, style, gender, session_number, heat_order, session_date_time, relay_legs, category, event_entries(swimmer_id, seed_time), event_results(swimmer_id, time)').order('session_number').order('heat_order'),
            supabaseAdmin.from('records').select('*')
        ]);

        if (infoRes.error && infoRes.error.code !== 'PGRST116') throw infoRes.error; // Ignore "No rows found" for info
        if (swimmersRes.error) throw swimmersRes.error;
        if (eventsRes.error) throw eventsRes.error;
        if (recordsRes.error) throw recordsRes.error;

        const competitionInfo = toCompetitionInfo(infoRes.data);
        const swimmers = swimmersRes.data.map(toSwimmer);
        const events = eventsRes.data.map(toSwimEvent);
        const records = recordsRes.data.map(toRecord);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competitionInfo, swimmers, events, records }),
        };
    } catch (error) {
        console.error("Error in getPublicData function:", error.message || error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Server error: ${error.message || 'Unknown database error.'}` })
        };
    }
};