
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    if (!supabaseAdmin) {
        return { statusCode: 500, body: JSON.stringify({ success: false, message: "Database config error." }) };
    }

    try {
        const { teamData, participants } = JSON.parse(event.body);
        
        if (!teamData || !participants || participants.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Data tidak lengkap.' }) };
        }

        // 1. Process each unique swimmer from the participants list
        const uniqueSwimmersMap = new Map();
        
        // Predetermine fee per event if we can
        // We actually need the competition info to know the fee, but we can also use the proportional share of teamData.paymentAmount
        const totalEvents = participants.filter(p => p.eventId).length;
        const feePerEvent = totalEvents > 0 ? (teamData.paymentAmount || 0) / totalEvents : 0;

        participants.forEach(p => {
            const key = `${p.name.trim().toLowerCase()}_${p.birthYear}_${p.gender}`;
            if (!uniqueSwimmersMap.has(key)) {
                // Calculate events for this swimmer
                const swimmerEvents = participants.filter(x => 
                    x.name.trim().toLowerCase() === p.name.trim().toLowerCase() && 
                    x.birthYear === p.birthYear && 
                    x.gender === p.gender &&
                    x.eventId
                ).length;

                uniqueSwimmersMap.set(key, {
                    name: p.name,
                    birthYear: p.birthYear,
                    gender: p.gender === 'L' ? 'Male' : 'Female',
                    club: teamData.clubName,
                    age_group: p.ageGroup || null,
                    payment_amount: swimmerEvents * feePerEvent,
                    pic_name: teamData.picName,
                    pic_phone: teamData.picPhone
                });
            }
        });

        for (const [key, swimmerData] of uniqueSwimmersMap.entries()) {
            // Check if swimmer exists
            const { data: existing, error: findError } = await supabaseAdmin
                .from('swimmers')
                .select('id')
                .ilike('name', swimmerData.name.trim())
                .eq('birth_year', swimmerData.birthYear)
                .eq('gender', swimmerData.gender)
                .limit(1);

            if (findError) throw findError;

            let swimmerId;
            if (existing && existing.length > 0) {
                swimmerId = existing[0].id;
                // Update info with PIC contact and payment data (no payment_proof in swimmers)
                await supabaseAdmin.from('swimmers').update({
                    club: teamData.clubName,
                    payment_amount: swimmerData.payment_amount,
                    pic_name: teamData.picName,
                    pic_phone: teamData.picPhone
                }).eq('id', swimmerId);
            } else {
                const { data: created, error: createError } = await supabaseAdmin
                    .from('swimmers')
                    .insert({
                        name: swimmerData.name,
                        birth_year: swimmerData.birthYear,
                        gender: swimmerData.gender,
                        club: swimmerData.club,
                        age_group: swimmerData.age_group,
                        payment_amount: swimmerData.payment_amount,
                        pic_name: swimmerData.pic_name,
                        pic_phone: swimmerData.pic_phone
                    })
                    .select('id')
                    .single();
                if (createError) throw createError;
                swimmerId = created.id;
            }
            uniqueSwimmersMap.get(key).realId = swimmerId;

            // Save file path to payment_proofs table if present
            if (teamData.paymentProof) {
                await supabaseAdmin.from('payment_proofs').insert({
                    swimmer_id: swimmerId,
                    file_path: teamData.paymentProof
                });
            }
        }

        // 2. Process all event entries
        const allEventEntries = [];
        for (const p of participants) {
            const key = `${p.name.trim().toLowerCase()}_${p.birthYear}_${p.gender}`;
            const swimmerId = uniqueSwimmersMap.get(key).realId;
            
            if (p.eventId) {
                allEventEntries.push({
                    event_id: p.eventId,
                    swimmer_id: swimmerId,
                    seed_time: p.seedTimeMs || 0
                });
            }
        }

        if (allEventEntries.length > 0) {
            const { error: entriesError } = await supabaseAdmin.from('event_entries').upsert(allEventEntries);
            if (entriesError) throw entriesError;

            // Log registrations for each unique swimmer in this collective submission
            for (const [key, swimmerData] of uniqueSwimmersMap.entries()) {
                const swimmerId = swimmerData.realId;
                const swimmerEvents = participants.filter(p => 
                    `${p.name.trim().toLowerCase()}_${p.birthYear}_${p.gender}` === key && p.eventId
                ).map(p => p.eventId);

                if (swimmerEvents.length > 0) {
                    await supabaseAdmin.from('registration_logs').insert({
                        swimmer_id: swimmerId,
                        payment_proof: teamData.paymentProof,
                        payment_amount: swimmerData.payment_amount,
                        pic_name: teamData.picName,
                        pic_phone: teamData.picPhone,
                        event_ids: swimmerEvents
                    });

                    await supabaseAdmin.from('swimmer_payments').insert({
                        swimmer_id: swimmerId,
                        payment_proof: teamData.paymentProof,
                        payment_amount: swimmerData.payment_amount
                    });
                }
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Berhasil mendaftarkan ${uniqueSwimmersMap.size} atlet dan ${allEventEntries.length} nomor lomba.` }),
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
