import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async () => {
    if (!supabaseAdmin) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ status: 'error', message: 'Database configuration error on server.' }) 
        };
    }

    try {
        // A lightweight query to check if the database is responsive.
        const { error } = await supabaseAdmin.from('competition_info').select('id').limit(1);
        
        if (error && error.code !== 'PGRST116') { // "No rows found" is not a connection error
            throw error;
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ status: 'ok' }) 
        };
    } catch (error) {
        console.error("Health check failed:", error.message || error);
        return { 
            statusCode: 503, 
            body: JSON.stringify({ status: 'error', message: error.message || 'Unknown database error.' }) 
        };
    }
};
