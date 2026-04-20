import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { format, parseISO, isAfter, startOfDay, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Appointment {
  id: string;
  date: string;
  type: string;
  status: string;
  attendance_status: string | null;
  doctor: any;
  specialty: any;
}

interface PatientUpcomingAppointmentsProps {
  patientId: string;
  currentSelection?: Date | null;
  onConflict?: (hasConflict: boolean) => void;
  allowedSpecialties?: string[];
}

const PatientUpcomingAppointments: React.FC<PatientUpcomingAppointmentsProps> = ({ 
  patientId, 
  currentSelection,
  onConflict,
  allowedSpecialties
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId) return;

    const fetchUpcoming = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('appointments')
          .select(`
            id,
            date,
            type,
            status,
            attendance_status,
            doctor:doctors(name),
            specialty:specialties${allowedSpecialties ? '!inner' : ''}(name)
          `)
          .eq('patient_id', patientId)
          .gte('date', startOfDay(new Date()).toISOString())
          .neq('attendance_status', 'cancelled')
          .order('date', { ascending: true })
          .limit(10);

        if (allowedSpecialties && allowedSpecialties.length > 0) {
          query = query.in('specialty.name', allowedSpecialties);
        }

        const { data, error } = await query;

        if (error) throw error;
        setAppointments(data || []);
      } catch (err) {
        console.error('Error fetching upcoming appointments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcoming();
  }, [patientId, allowedSpecialties]);

  useEffect(() => {
    if (currentSelection && appointments.length > 0) {
      const conflict = appointments.some(apt => isSameDay(parseISO(apt.date), currentSelection));
      onConflict?.(conflict);
    } else {
      onConflict?.(false);
    }
  }, [currentSelection, appointments, onConflict]);

  if (!patientId) return null;
  if (loading) return <div className="animate-pulse flex space-y-2 flex-col p-4 bg-slate-50 rounded-2xl">
    <div className="h-2 bg-slate-200 rounded w-1/2"></div>
    <div className="h-2 bg-slate-200 rounded w-3/4"></div>
  </div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Calendar size={12} /> Próximos Agendamentos
        </h4>
        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
          {appointments.length} encontrados
        </span>
      </div>

      {appointments.length === 0 ? (
        <div className="p-4 rounded-2xl border-2 border-dashed border-slate-100 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Nenhum agendamento futuro</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {appointments.map((apt) => {
            const aptDate = parseISO(apt.date);
            const isConflict = currentSelection ? isSameDay(aptDate, currentSelection) : false;

            return (
              <div 
                key={apt.id} 
                className={`p-3 rounded-xl border transition-all ${
                  isConflict 
                    ? 'bg-rose-50 border-rose-200 ring-1 ring-rose-500 shadow-md shadow-rose-100' 
                    : 'bg-white border-slate-100 hover:border-indigo-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-tight ${isConflict ? 'text-rose-600' : 'text-slate-700'}`}>
                    {format(aptDate, "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <Clock size={10} />
                    {format(aptDate, 'HH:mm')}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-slate-400 uppercase truncate pr-2">
                    {apt.specialty?.name || (Array.isArray(apt.specialty) ? apt.specialty[0]?.name : apt.specialty?.name) || 'Geral'} • {apt.doctor?.name || (Array.isArray(apt.doctor) ? apt.doctor[0]?.name : apt.doctor?.name) || 'Profissional'}
                  </p>
                  {isConflict && (
                    <span className="text-[8px] font-black text-rose-500 uppercase flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-rose-200">
                      <AlertCircle size={8} /> No mesmo dia
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PatientUpcomingAppointments;
