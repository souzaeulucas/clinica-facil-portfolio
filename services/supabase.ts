
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Only throw in development if variables are missing AND we aren't building
if ((!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) && import.meta.env.DEV) {
  console.warn('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Mock data for development when Supabase is not connected
export const MOCK_ESPECIALIDADES = [
  { id: '1', name: 'Cardiologia' },
  { id: '2', name: 'Dermatologia' },
  { id: '3', name: 'Ortopedia' },
  { id: '4', name: 'Pediatria' },
  { id: '5', name: 'Ginecologia' },
];

export const MOCK_MEDICOS = [
  { id: '101', name: 'Dr. Roberto Silva', especialidade_id: '1' },
  { id: '102', name: 'Dra. Maria Oliveira', especialidade_id: '1' },
  { id: '103', name: 'Dra. Ana Costa', especialidade_id: '2' },
  { id: '104', name: 'Dr. Carlos Souza', especialidade_id: '3' },
  { id: '105', name: 'Dra. Fernanda Lima', especialidade_id: '4' },
  { id: '106', name: 'Dr. João Mendes', especialidade_id: '5' },
];
