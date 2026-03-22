import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Trash2, Calendar, UserRound, GraduationCap, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import SearchableSelect from './ui/SearchableSelect';
import ConfirmModal from './ConfirmModal';

interface PatientDischargesProps {
    patientId: string;
}

interface Discharge {
    id: string;
    discharge_date: string;
    notes: string;
    doctor_id: string;
    specialty_id: string;
    doctors?: { name: string };
    specialties?: { name: string };
}

const PatientDischarges: React.FC<PatientDischargesProps> = ({ patientId }) => {
    const { addToast } = useToast();
    const [discharges, setDischarges] = useState<Discharge[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, id: string}>({ isOpen: false, id: '' });
    
    const [doctors, setDoctors] = useState<{id: string, name: string, specialty_id: string}[]>([]);
    const [specialties, setSpecialties] = useState<{id: string, name: string}[]>([]);
    
    // Form State
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');
    const [dischargeDate, setDischargeDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (patientId) fetchDischarges();
    }, [patientId]);

    useEffect(() => {
        const fetchFilters = async () => {
            const [docsRes, specsRes] = await Promise.all([
                supabase.from('doctors').select('id, name, specialty_id').order('name'),
                supabase.from('specialties').select('id, name').order('name')
            ]);
            if (docsRes.data) setDoctors(docsRes.data);
            if (specsRes.data) setSpecialties(specsRes.data);
        };
        fetchFilters();
    }, []);

    const handleDoctorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const docId = e.target.value;
        setSelectedDoctorId(docId);
        if (docId) {
            const doc = doctors.find(d => d.id === docId);
            if (doc && doc.specialty_id) {
                setSelectedSpecialtyId(doc.specialty_id);
            }
        }
    };

    const fetchDischarges = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('patient_discharges')
                .select(`
                    *,
                    doctors ( name ),
                    specialties ( name )
                `)
                .eq('patient_id', patientId)
                .order('discharge_date', { ascending: false });

            if (error) throw error;
            setDischarges(data || []);
        } catch (error) {
            console.error('Error fetching discharges:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSpecialtyId && !selectedDoctorId) {
            addToast('Selecione pelo menos um profissional ou especialidade.', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('patient_discharges').insert([{
                patient_id: patientId,
                doctor_id: selectedDoctorId || null,
                specialty_id: selectedSpecialtyId || null,
                discharge_date: dischargeDate,
                notes: notes.trim() || null
            }]);

            if (error) throw error;

            addToast('Alta registrada com sucesso!', 'success');
            setShowForm(false);
            setSelectedDoctorId('');
            setSelectedSpecialtyId('');
            setNotes('');
            fetchDischarges();
        } catch (error) {
            console.error('Error saving discharge:', error);
            addToast('Erro ao registrar alta.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteClick = (id: string) => {
        setConfirmModal({ isOpen: true, id });
    };

    const confirmDelete = async () => {
        try {
            const { error } = await supabase.from('patient_discharges').delete().eq('id', confirmModal.id);
            if (error) throw error;
            addToast('Registro de alta cancelado.', 'success');
            setConfirmModal({ isOpen: false, id: '' });
            fetchDischarges();
        } catch (error) {
            addToast('Erro ao reverter alta.', 'error');
        }
    };

    if (loading) return (
         <div className="p-10 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-[3px] border-slate-200 border-t-indigo-600 mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carregando histórico...</p>
        </div>
    );

    const specialtyOptions = specialties.map(s => ({ value: s.id, label: s.name }));
    const doctorOptions = doctors.map(d => ({ value: d.id, label: d.name }));

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Histórico de Altas</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">Gerencie de onde o paciente já recebeu alta (encerrou tratamento)</p>
                </div>
                {!showForm && (
                     <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100"
                    >
                        <Plus size={16} /> Registrar Alta
                    </button>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 relative shadow-sm">
                    <button type="button" onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors p-1 bg-white rounded-full shadow-sm"><X size={16}/></button>
                    
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">Nova Alta Médica</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data da Alta</label>
                            <input
                                type="date"
                                required
                                value={dischargeDate}
                                onChange={(e) => setDischargeDate(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm font-bold text-slate-700 shadow-sm h-[42px]"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-1">
                            <SearchableSelect
                                label="Especialidade (Opcional)"
                                value={selectedSpecialtyId}
                                onChange={(val) => setSelectedSpecialtyId(val)}
                                options={specialtyOptions}
                                placeholder="Selecione..."
                                onClear={() => setSelectedSpecialtyId('')}
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <SearchableSelect
                                label="Profissional (Opcional)"
                                value={selectedDoctorId}
                                onChange={(val) => {
                                    setSelectedDoctorId(val);
                                    if (val) {
                                        const doc = doctors.find(d => d.id === val);
                                        if (doc && doc.specialty_id) {
                                            setSelectedSpecialtyId(doc.specialty_id);
                                        }
                                    }
                                }}
                                options={doctorOptions}
                                placeholder="Selecione (Geral)..."
                                onClear={() => setSelectedDoctorId('')}
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações / Motivo</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm font-medium text-slate-700 shadow-sm resize-none custom-scrollbar"
                                placeholder="Descreva brevemente o motivo da alta (opcional)"
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-indigo-600 text-white font-black text-xs uppercase tracking-widest px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar Registro'}
                        </button>
                    </div>
                </form>
            )}

            {discharges.length === 0 ? (
                <div className="p-10 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 text-center">
                    <p className="text-slate-400 font-bold text-sm">Nenhum registro de alta encontrado para este paciente.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {discharges.map((d) => (
                        <div key={d.id} className="bg-white border text-left p-4 rounded-2xl border-slate-100 shadow-sm hover:border-indigo-100 transition-all group overflow-hidden relative">
                           <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-50 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                           
                           <div className="flex justify-between items-start mb-3 relative z-10">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100">
                                        <GraduationCap size={16} />
                                    </div>
                                    <div>
                                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</span>
                                         <p className="text-sm font-black text-slate-800">
                                            {format(new Date(d.discharge_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteClick(d.id)}
                                    className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Excluir/Reverter Alta"
                                >
                                    <Trash2 size={14} />
                                </button>
                           </div>

                            <div className="space-y-2 relative z-10">
                                {d.doctors && (
                                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                        <UserRound size={12} className="text-indigo-400" />
                                        <span className="text-xs font-bold truncate">{d.doctors.name}</span>
                                    </div>
                                )}
                                {d.specialties && (
                                    <div className="inline-flex items-center px-2 py-1 bg-violet-50 text-violet-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-violet-100">
                                        {d.specialties.name}
                                    </div>
                                )}
                                {!d.doctors && !d.specialties && (
                                     <span className="inline-block text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md uppercase">Alta Geral</span>
                                )}
                                {d.notes && (
                                    <p className="text-xs font-medium text-slate-500 mt-2 bg-yellow-50/50 p-2 rounded-lg border border-yellow-100/50">
                                        "{d.notes}"
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false, id: '' })}
                onConfirm={confirmDelete}
                title="Reverter Alta Médica"
                message="Tem certeza que deseja reverter (apagar) esta alta? O paciente voltará a aceitar novos agendamentos vinculados a esta especialidade ou profissional."
                type="danger"
            />
        </div>
    );
};

export default PatientDischarges;
