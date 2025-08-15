import { createClient } from "@supabase/supabase-js";
import { type Database } from "./supabase";

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = import.meta.env?.VITE_SUPABASE_API_KEY || process.env.SUPABASE_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseKey) missing.push('SUPABASE_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);
export default supabase;