
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
        const { swimmerData, registrations } = JSON.parse(event.body);
        
        if (!swimmerData || !registrations || !swimmerData.name || !swimmerData.club) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Data tidak lengkap.' }) };
        }
        
        const { data: existingSwimmers, error: searchError } = await supabaseAdmin
            .from('swimmers')
            .select('id')
            .ilike('name', swimmerData.name.trim())
            .eq('birth_year', swimmerData.birthYear)
            .eq('gender', swimmerData.gender)
            .limit(1);
            
        if (searchError) throw searchError;
        
        let swimmer;
        if (existingSwimmers && existingSwimmers.length > 0) {
            swimmer = existingSwimmers[0];
            // Update swimmer info including payment and contact data (no payment_proof in swimmers table)
            await supabaseAdmin.from('swimmers').update({
                club: swimmerData.club,
                age_group: swimmerData.ageGroup,
                payment_amount: swimmerData.paymentAmount,
                pic_name: swimmerData.picName,
                pic_phone: swimmerData.picPhone
            }).eq('id', swimmer.id);
        } else {
            const { data: newSwimmer, error: addError } = await supabaseAdmin
                .from('swimmers')
                .insert({
                    name: swimmerData.name,
                    birth_year: swimmerData.birthYear,
                    gender: swimmerData.gender,
                    club: swimmerData.club,
                    age_group: swimmerData.ageGroup,
                    payment_amount: swimmerData.paymentAmount,
                    pic_name: swimmerData.picName,
                    pic_phone: swimmerData.picPhone
                })
                .select('id')
                .single();
            if (addError) throw addError;
            swimmer = newSwimmer;
        }

        // Save file path into payment_proofs table if present
        if (swimmerData.paymentProof) {
            await supabaseAdmin.from('payment_proofs').insert({
                swimmer_id: swimmer.id,
                file_path: swimmerData.paymentProof
            });
        }

        const entriesToInsert = registrations.map(reg => ({
            event_id: reg.eventId,
            swimmer_id: swimmer.id,
            seed_time: reg.seedTime
        }));
        
        if (entriesToInsert.length > 0) {
            const { error: entriesError } = await supabaseAdmin.from('event_entries').upsert(entriesToInsert);
            if (entriesError) throw entriesError;
            
            // Record this registration session in the logs (stores short file path, not image data)
            await supabaseAdmin.from('registration_logs').insert({
                swimmer_id: swimmer.id,
                payment_proof: swimmerData.paymentProof || null,
                payment_amount: swimmerData.paymentAmount,
                pic_name: swimmerData.picName,
                pic_phone: swimmerData.picPhone,
                event_ids: registrations.map(r => r.eventId)
            });

            // Also keep a record in swimmer_payments for simpler accounting (stores short file path)
            await supabaseAdmin.from('swimmer_payments').insert({
                swimmer_id: swimmer.id,
                payment_proof: swimmerData.paymentProof || null,
                payment_amount: swimmerData.paymentAmount
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, swimmer }),
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
