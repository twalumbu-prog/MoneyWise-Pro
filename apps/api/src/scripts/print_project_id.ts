
import { supabase } from '../lib/supabase';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const url = process.env.SUPABASE_URL || '';
// URL format: https://<project_id>.supabase.co
const projectId = url.replace('https://', '').replace('.supabase.co', '');

console.log('Project ID:', projectId);
