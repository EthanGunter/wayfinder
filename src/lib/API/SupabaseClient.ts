import { createClient } from "@supabase/supabase-js";
import { type Database } from "./supabase";
import { settings } from "@/user-settings";
import { get } from "svelte/store";

export const AUTH_TABLE_NAME = 'users';
export const TASK_TABLE_NAME = 'tasks';

const keyOverride = get(settings.dev.overrides.supabaseKey);
const urlOverride = get(settings.dev.overrides.supabaseUrl);
const supabaseUrl = urlOverride || import.meta.env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = keyOverride || import.meta.env?.VITE_SUPABASE_API_KEY || process.env.SUPABASE_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseKey) missing.push('SUPABASE_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);
export default supabase;