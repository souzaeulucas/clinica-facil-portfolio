
export interface Especialidade {
  id: string;
  name: string;
  nome?: string;
  is_sus_exclusive: boolean;
}

export interface Medico {
  id: string;
  name: string;
  nome?: string;
  especialidade_id: string;
  specialty_id?: string; // DB column name
  especialidade_nome?: string;
  min_age?: number;
  max_age?: number;
  accepts_sus?: boolean;
  crm?: string;
  spec?: { name: string };
}

export interface PacienteRetorno {
  id?: string;
  nome_completo: string;
  medico: string;
  especialidade: string;
  data_consulta: string;
  periodo_retorno: number;
  proxima_consulta: string;
}

export interface PacientePrimeiraConsulta {
  id?: string;
  nome_completo: string;
  medico: string;
  especialidade: string;
  telefone: string;
}

export enum TipoAgendamento {
  PRIMEIRA_CONSULTA = "Primeira Consulta",
  RETORNO = "Retorno",
  SESSAO = "Sessão"
}

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  specialty_id: string;
  doctor_id?: string;
  start_date: string;
  total_sessions: number;
  completed_sessions: number;
  sessions_per_week: number;
  schedule_days: string[];
  schedule_time?: string;
  is_paying: boolean;
  price_per_session?: number;
  is_sus?: boolean;
  status: 'active' | 'completed' | 'cancelled' | 'alta';
  notes?: string;
  created_at: string;
  patient?: { name: string; cpf: string; phone: string; birth_date?: string; is_sus?: boolean; is_blocked?: boolean; unexcused_absences?: number };
  doctor?: { name: string };
  specialty?: { name: string };
}

export interface DoctorBaseSchedule {
  id: string;
  doctor_id: string;
  day_of_week: number;
  period: 'morning' | 'afternoon' | 'night' | 'full_day';
  start_time?: string;
  end_time?: string;
  rooms?: string[];
  service_type?: 'SUS' | 'Livre';
  observation?: string;
  created_at: string;
}

export interface DoctorScheduleException {
  id: string;
  doctor_id: string;
  specific_date: string;
  is_working: boolean;
  period?: 'morning' | 'afternoon' | 'night' | 'full_day';
  custom_start_time?: string;
  custom_end_time?: string;
  rooms?: string[];
  service_type?: 'SUS' | 'Livre';
  reason?: string;
  created_at: string;
}

export interface TherapySession {
  id: string;
  plan_id: string;
  session_date: string;
  status: 'scheduled' | 'attended' | 'missed' | 'justified' | 'cancelled';
  notes?: string;
  created_at: string;
}

export interface TherapyPayment {
  id: string;
  plan_id: string;
  amount: number;
  payment_method: 'pix' | 'cash' | 'card' | 'credito' | 'debito' | 'dinheiro' | 'other';
  payment_date: string;
  notes?: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  date: string;
  type: string;
  status: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string;
  notes: string;
  created_at: string;
  treatment_plan_id?: string;
  attendance_status?: 'scheduled' | 'attended' | 'missed' | 'justified' | 'cancelled';
  is_paid?: boolean;
  is_sus?: boolean;
  patients?: { id: string; name: string; phone: string; cpf?: string; birth_date?: string; condition?: 'none' | 'priority' | 'dpoc'; is_sus?: boolean; is_blocked?: boolean; unexcused_absences?: number };
  patient?: { id: string; name: string; phone: string; cpf?: string; birth_date?: string; condition?: 'none' | 'priority' | 'dpoc'; is_sus?: boolean; is_blocked?: boolean; unexcused_absences?: number };
  doctors?: { id: string; name: string; specialty_id: string; spec: { name: string } };
  doctor?: { id: string; name: string; specialty_id: string; spec: { name: string } };
  treatment_plans?: TreatmentPlan;
  specialty?: { name: string };
  creator?: { full_name: string | null; email: string } | null;
  allocations?: { amount: number; payment?: { payment_method: string } }[];
}

export interface FinancialRecord {
  id: string;
  patient_id: string;
  treatment_plan_id?: string;
  week_start_date: string;
  week_end_date: string;
  total_amount: number;
  status: 'pending' | 'paid';
  payment_date?: string;
  payment_method?: string;
  created_by?: string;
  created_at: string;
}
export interface PaymentAllocation {
  id: string;
  payment_id: string;
  appointment_id: string;
  amount: number;
  created_at: string;
  appointment?: Appointment;
}
