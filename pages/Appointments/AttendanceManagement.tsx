import React, { useState, useEffect } from 'react';
import { supabase, MOCK_ESPECIALIDADES as specialties, MOCK_MEDICOS as doctors } from '../../services/supabase';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User, Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Search, Activity, Plus, Save, X, Trash2, Pencil, Filter } from 'lucide-react';
import ModernDatePicker from '../../components/ui/ModernDatePicker';
import PatientSearchSelect from '../../components/ui/PatientSearchSelect';
import ModernDoctorSelect from '../../components/ui/ModernDoctorSelect';
import ConfirmModal from '../../components/ConfirmModal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { normalizeString, includesNormalized } from '../../utils/string';

interface AttendanceAppointment {
    id: string;
    date: string;
    status: string;
    type: string;
    patient_id: string;
    patients: {
        name: string;
        phone: string;
        is_blocked: boolean;
        unexcused_absences: number;
    };
    specialty: {
        name: string;
        id: string;
    };
    doctors: {
        name: string;
        id: string;
        specialty_id: string;
    };
    treatment_plans?: {
        is_sus: boolean;
    };
}

const AttendanceManagement: React.FC = () => {
    const { addToast } = useToast();
    const [appointments, setAppointments] = useState<AttendanceAppointment[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter State
    const [patientSearch, setPatientSearch] = useState('');
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');
    const [showOnlyBlocked, setShowOnlyBlocked] = useState(false);

    const [showManualModal, setShowManualModal] = useState(false);
    const [manualLoading, setManualLoading] = useState(false);
    const [dbSpecialties, setDbSpecialties] = useState<any[]>([]);
    const [dbDoctors, setDbDoctors] = useState<any[]>([]);
    const [editingAptId, setEditingAptId] = useState<string | null>(null);

    // Initial state for manual form
    const initialManualForm = {
        patientId: '' as string | null,
        patientName: '',
        cpf: '',
        phone: '',
        date: new Date().toISOString().split('T')[0],
        doctorId: '',
        specialty: '',
        notes: 'Falta registrada manualmente'
    };
    const [manualForm, setManualForm] = useState(initialManualForm);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [isDocOpen, setIsDocOpen] = useState(false);
    const [activeDocIdx, setActiveDocIdx] = useState(-1);

    const formatCPF = (value: string) => {
        const v = value.replace(/\D/g, '').slice(0, 11);
        return v
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    };

    const formatPhone = (value: string) => {
        const v = value.replace(/\D/g, '').slice(0, 11);

        if (v.length > 10) {
            return v.replace(/^(\d\d)(\d{5})(\d{4}).*/, '($1) $2-$3');
        } else if (v.length > 5) {
            return v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        } else if (v.length > 2) {
            return v.replace(/^(\d\d)(\d{0,5}).*/, '($1) $2');
        } else {
            return v.replace(/^(\d*)/, '($1');
        }
    };

    const fetchMetadata = async () => {
        try {
            const { data: sData } = await supabase.from('specialties').select('*');
            const { data: dData } = await supabase.from('doctors').select('*, specialties!specialty_id(name)');

            if (sData) setDbSpecialties(sData);
            if (dData) setDbDoctors(dData);
        } catch (error) {
            console.error('Metadata fetch error:', error);
        }
    };

    const fetchTodayAppointments = async () => {
        try {
            setLoading(true);

            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    *,
                    patients (name, phone, is_blocked, unexcused_absences, cpf),
                    specialty:specialties!specialty_id (name, id),
                    doctors:doctors!doctor_id (name, id),
                    treatment_plans (is_sus)
                `)
                .in('status', ['absent', 'absent_justified']) // Remove 'missed' and 'cancelled' to keep it manual/medical
                .order('date', { ascending: false });

            if (error) throw error;
            setAppointments(data as any || []);
        } catch (error: any) {
            console.error('Error fetching attendance:', error);
            const errorDetails = error.message || error.details || JSON.stringify(error);
            addToast(`Falha no Controle de Faltas: ${errorDetails}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodayAppointments();
        fetchMetadata();
    }, []);

    // Handle Escape key to close modal
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowManualModal(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleUpdateStatus = async (appointmentId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('appointments')
                .update({ status: newStatus })
                .eq('id', appointmentId);

            if (error) throw error;

            // Update local state
            setAppointments(prev => prev.map(apt =>
                apt.id === appointmentId ? { ...apt, status: newStatus } : apt
            ));

            let message = 'Presença confirmada!';
            if (newStatus === 'absent') message = 'Falta registrada (computada no limite).';
            if (newStatus === 'absent_justified') message = 'Falta justificada registrada.';

            addToast(message, 'success');

            // Re-fetch to see updated patient block status if it was a final strike
            if (newStatus === 'absent') {
                setTimeout(fetchTodayAppointments, 500);
            }
        } catch (error: any) {
            addToast(`Erro ao atualizar: ${error.message}`, 'error');
        }
    };

    const handleToggleType = async (appointmentId: string, currentType: string) => {
        try {
            const newType = currentType === 'Sessão' ? 'Avaliação' : 'Sessão';
            const { error } = await supabase
                .from('appointments')
                .update({ type: newType })
                .eq('id', appointmentId);

            if (error) throw error;

            setAppointments(prev => prev.map(apt =>
                apt.id === appointmentId ? { ...apt, type: newType } : apt
            ));
            addToast(`Alterado para ${newType}!`, 'success');
        } catch (error: any) {
            addToast(`Erro ao alterar tipo: ${error.message}`, 'error');
        }
    };

    const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: '', type: '' });

    const handleDelete = (id: string, type: string) => {
        setDeleteModal({ isOpen: true, id, type });
    };

    const executeDelete = async () => {
        try {
            const { error } = await supabase
                .from('appointments')
                .delete()
                .eq('id', deleteModal.id);

            if (error) throw error;

            setAppointments(prev => prev.filter(a => a.id !== deleteModal.id));
            addToast('Registro excluído com sucesso.', 'success');
        } catch (error: any) {
            addToast(`Erro ao excluir: ${error.message}`, 'error');
        } finally {
            setDeleteModal({ isOpen: false, id: '', type: '' });
        }
    };

    const handleEdit = (apt: AttendanceAppointment) => {
        setEditingAptId(apt.id);
        const doc = dbDoctors.find(d => d.id === apt.doctors?.id);
        setManualForm({
            patientId: apt.patient_id,
            patientName: apt.patients?.name || '',
            cpf: (apt.patients as any).cpf || '',
            phone: apt.patients?.phone || '',
            date: apt.date.split('T')[0],
            doctorId: apt.doctors?.id || '',
            specialty: apt.specialty?.name || doc?.specialties?.name || '',
            notes: (apt as any).notes || 'Falta registrada manualmente'
        });
        setDoctorSearch(apt.doctors?.name || '');
        setShowManualModal(true);
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setManualLoading(true);

        try {
            if (!manualForm.patientName.trim()) {
                addToast('Informe o nome do paciente.', 'error');
                setManualLoading(false);
                return;
            }

            let patientId = manualForm.patientId;
            const cleanCPF = manualForm.cpf.replace(/\D/g, '');

            // 1. Check for patient ONLY if we don't have patientId from autocomplete
            if (!patientId && cleanCPF) {
                const { data: cpfResults } = await supabase
                    .from('patients')
                    .select('id, is_blocked')
                    .or(`cpf.eq.${manualForm.cpf},cpf.eq.${cleanCPF}`)
                    .maybeSingle();

                if (cpfResults) {
                    if (cpfResults.is_blocked) {
                        addToast('Este paciente já está bloqueado por limite de faltas.', 'error');
                        setManualLoading(false);
                        return;
                    }
                    patientId = cpfResults.id;
                }
            }

            if (!patientId) {
                const broadNameSearch = manualForm.patientName.trim();

                const { data: nameResults } = await supabase
                    .from('patients')
                    .select('id, name, is_blocked')
                    .ilike('name', `%${broadNameSearch}%`)
                    .eq('phone', manualForm.phone);

                if (nameResults && nameResults.length > 0) {
                    // Refine with strict normalized check in JS
                    const matchedPatient = nameResults.find(p =>
                        normalizeString(p.name) === normalizeString(manualForm.patientName.trim())
                    );

                    if (matchedPatient) {
                        if (matchedPatient.is_blocked) {
                            addToast('Este paciente já está bloqueado por limite de faltas.', 'error');
                            setManualLoading(false);
                            return;
                        }
                        patientId = matchedPatient.id;
                    }
                }
            }

            // 2. Create patient if doesn't exist
            if (!patientId) {
                const { data: newPatient, error: pError } = await supabase
                    .from('patients')
                    .insert([{
                        name: manualForm.patientName,
                        cpf: manualForm.cpf,
                        phone: manualForm.phone
                    }])
                    .select().single();
                if (pError) throw pError;
                patientId = newPatient.id;
            }

            // 3. Create 'absent' appointment
            const effectiveDoctors = dbDoctors.length > 0 ? dbDoctors : doctors;
            const doctor = effectiveDoctors.find((d: any) => d.id === manualForm.doctorId);
            const doctorSpecId = doctor?.specialty_id || doctor?.especialidade_id;

            if (editingAptId) {
                const { error: aError } = await supabase
                    .from('appointments')
                    .update({
                        patient_id: patientId,
                        doctor_id: manualForm.doctorId,
                        specialty_id: doctorSpecId,
                        date: new Date(manualForm.date + 'T12:00:00').toISOString(),
                        notes: manualForm.notes
                    })
                    .eq('id', editingAptId);

                if (aError) throw aError;
                addToast('Registro atualizado com sucesso!', 'success');
            } else {
                const { error: aError } = await supabase
                    .from('appointments')
                    .insert([{
                        patient_id: patientId,
                        doctor_id: manualForm.doctorId,
                        specialty_id: doctorSpecId,
                        date: new Date(manualForm.date + 'T12:00:00').toISOString(),
                        type: 'Retorno',
                        status: 'absent',
                        notes: manualForm.notes
                    }]);

                if (aError) throw aError;
                addToast('Falta registrada e strike computado!', 'success');
            }

            setShowManualModal(false);
            setManualForm(initialManualForm);
            setEditingAptId(null);
            setDoctorSearch('');
            fetchTodayAppointments();
        } catch (error: any) {
            console.error('Manual error:', error);
            addToast(`Erro ao registrar falta: ${error.message}`, 'error');
        } finally {
            setManualLoading(false);
        }
    };

    // Prepare Options for Selects
    const doctorOptions = (dbDoctors.length > 0 ? dbDoctors : doctors).map((d: any) => ({
        value: d.id,
        label: d.name
    }));

    const specialtyOptions = (dbSpecialties.length > 0 ? dbSpecialties : specialties).map((s: any) => ({
        value: s.id,
        label: s.name
    }));

    // Search and Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 15;

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [patientSearch, selectedDoctorId, selectedSpecialtyId, showOnlyBlocked]);

    const filteredAppointments = appointments.filter(apt => {
        const matchesPatient = includesNormalized(apt.patients?.name || '', patientSearch);

        const matchesDoctor = selectedDoctorId
            ? (apt.doctors?.id === selectedDoctorId)
            : true;

        const matchesSpecialty = selectedSpecialtyId
            ? (apt.specialty?.id === selectedSpecialtyId)
            : true;

        const isAtLimit = (apt.patients?.unexcused_absences || 0) >= 2;
        const isBlocked = apt.patients?.is_blocked || isAtLimit;

        const matchesBlocked = showOnlyBlocked ? isBlocked : true;

        return matchesPatient && matchesDoctor && matchesSpecialty && matchesBlocked;
    });

    // Pagination Logic
    // Grouping Logic
    const groupedGroups: { [key: string]: any } = {};

    filteredAppointments.forEach(apt => {
        const key = `${apt.patient_id}-${apt.specialty?.id || 'no-spec'}`;
        if (!groupedGroups[key]) {
            groupedGroups[key] = {
                patientId: apt.patient_id,
                patient: apt.patients,
                specialty: apt.specialty,
                doctor: apt.doctors, // Show first doctor as reference
                absences: [],
                is_sus: apt.treatment_plans?.is_sus
            };
        }
        groupedGroups[key].absences.push(apt);
    });

    const groupedList = Object.values(groupedGroups);

    // Pagination Logic for grouped list
    const totalPages = Math.ceil(groupedList.length / ITEMS_PER_PAGE);

    const paginatedGroups = groupedList.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className="w-full pb-8">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 mb-8 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Controle de Faltas</h1>
                        <p className="text-slate-500 text-sm font-medium">Gestão de presença por paciente</p>
                    </div>

                    <button
                        onClick={() => {
                            setEditingAptId(null);
                            setManualForm(initialManualForm);
                            setDoctorSearch('');
                            setShowManualModal(true);
                        }}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                    >
                        <Plus size={18} />
                        Registrar Falta
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar paciente..."
                            className="pl-12 pr-6 py-2.5 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm w-full"
                            value={patientSearch}
                            onChange={(e) => setPatientSearch(e.target.value)}
                        />
                    </div>

                    <SearchableSelect
                        options={doctorOptions}
                        value={selectedDoctorId}
                        onChange={setSelectedDoctorId}
                        onClear={() => setSelectedDoctorId('')}
                        placeholder="Filtrar por Médico..."
                    />

                    <SearchableSelect
                        options={specialtyOptions}
                        value={selectedSpecialtyId}
                        onChange={setSelectedSpecialtyId}
                        onClear={() => setSelectedSpecialtyId('')}
                        placeholder="Filtrar por Especialidade..."
                    />
                </div>

                <div className="flex items-center justify-end">
                    <button
                        onClick={() => setShowOnlyBlocked(!showOnlyBlocked)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${showOnlyBlocked
                            ? 'bg-rose-600 text-white border-rose-700 shadow-lg shadow-rose-200'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                    >
                        {showOnlyBlocked ? <XCircle size={14} /> : <Filter size={14} />}
                        {showOnlyBlocked ? 'Ver Todos' : 'Ver Apenas Bloqueados'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Sincronizando agendamentos...</p>
                </div>
            ) : filteredAppointments.length === 0 ? (
                <div className="bg-white rounded-3xl p-20 text-center border border-slate-200 shadow-sm">
                    <Calendar size={48} className="text-slate-200 mx-auto mb-4" />
                    <h3 className="text-slate-900 font-black text-xl mb-1">Nenhum agendamento encontrado</h3>
                    <p className="text-slate-400 text-sm font-medium">Tente buscar por outro termo ou registre uma falta.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {paginatedGroups.map((group: any) => {
                            const mainApt = group.absences[0];
                            const lastAbsence = group.absences[0]; // Already ordered by date desc in query
                            const unexcusedCount = group.absences.filter((a: any) => a.status === 'absent').length;

                            return (
                                <div key={`${group.patientId}-${group.specialty?.id}`} className={`bg-white rounded-2xl p-6 border-2 transition-all flex items-center justify-between gap-6 ${group.patient?.is_blocked ? 'border-rose-200 bg-rose-50/10' :
                                    unexcusedCount >= 2 ? 'border-amber-200 bg-amber-50/10' :
                                        'border-slate-100 hover:border-indigo-200'
                                    }`}>
                                    <div className="flex items-center gap-5 min-w-0">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${group.patient?.is_blocked ? 'bg-rose-100 text-rose-600' :
                                            'bg-slate-100 text-slate-500'
                                            }`}>
                                            <User size={28} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-black text-slate-900 text-base leading-tight truncate">{group.patient?.name || 'Paciente Desconhecido'}</h3>
                                            <div className="flex flex-col gap-0.5 mt-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                                                        Última: {format(new Date(lastAbsence.date), 'dd/MM/yyyy')}
                                                    </span>
                                                    <span className="text-[9px] text-indigo-500 font-black uppercase tracking-widest truncate">{group.specialty?.name || 'Sem Especialidade'}</span>
                                                </div>
                                                {group.is_sus && (
                                                    <span className="w-fit bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-teal-200">SUS</span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {unexcusedCount > 0 && (
                                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${unexcusedCount >= 2 ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
                                                        <AlertCircle size={10} />
                                                        {unexcusedCount} Falta{unexcusedCount > 1 ? 's' : ''}
                                                    </div>
                                                )}
                                                {group.patient?.is_blocked && (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest">
                                                        <XCircle size={10} />
                                                        BLOQUEADO
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleEdit(mainApt)}
                                            className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                            title="Gerenciar Faltas"
                                        >
                                            <Pencil size={20} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(mainApt.id, mainApt.type)}
                                            className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                            title="Excluir Última"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination Controls */}
                    {filteredAppointments.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-center gap-4 mt-8">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Anterior
                            </button>
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Próxima
                            </button>
                        </div>
                    )}
                </>
            )}

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, id: '', type: '' })}
                onConfirm={executeDelete}
                title="Excluir Registro de Presença"
                message="Tem certeza que deseja excluir este registro? A ação não pode ser desfeita e afetará o histórico do paciente."
                type="danger"
            />

            {/* Manual Absence Modal */}
            {showManualModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-[2.5rem]">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">{editingAptId ? 'Editar Falta' : 'Registrar Falta'}</h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Manual (Urgência ou Histórico)</p>
                            </div>
                            <button onClick={() => { setShowManualModal(false); setEditingAptId(null); }} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-rose-500 shadow-sm transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleManualSubmit} className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="md:col-span-2">
                                    <PatientSearchSelect
                                        label="Nome do Paciente"
                                        value={manualForm.patientName}
                                        onChange={(val) => setManualForm({ ...manualForm, patientName: val })}
                                        onSelect={(p) => setManualForm({
                                            ...manualForm,
                                            patientId: p.id,
                                            patientName: p.name,
                                            cpf: p.cpf || '',
                                            phone: p.phone || ''
                                        })}
                                        placeholder="Digite o nome ou sobrenome..."
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">CPF</label>
                                    <input
                                        type="text"
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 text-sm"
                                        placeholder="000.000.000-00"
                                        maxLength={14}
                                        value={manualForm.cpf}
                                        onChange={e => setManualForm({ ...manualForm, cpf: formatCPF(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">Telefone</label>
                                    <input
                                        type="text"
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 text-sm"
                                        placeholder="(00) 00000-0000"
                                        maxLength={15}
                                        value={manualForm.phone}
                                        onChange={e => setManualForm({ ...manualForm, phone: formatPhone(e.target.value) })}
                                    />
                                </div>
                                <ModernDatePicker
                                    label="Data da Consulta"
                                    required
                                    value={manualForm.date}
                                    onChange={date => setManualForm({ ...manualForm, date })}
                                />
                                <ModernDoctorSelect
                                    label="Médico"
                                    options={doctorOptions}
                                    value={manualForm.doctorId}
                                    onChange={(val) => {
                                        const dr = dbDoctors.find(d => d.id === val);
                                        setManualForm({
                                            ...manualForm,
                                            doctorId: val,
                                            specialty: dr?.specialties?.name || ''
                                        });
                                    }}
                                    placeholder="Busque o médico..."
                                    required
                                />

                                {manualForm.doctorId && (
                                    <div className="mt-2 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                                        <Activity size={12} className="text-indigo-500" />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">
                                            {manualForm.specialty}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={manualLoading || !manualForm.patientName || !manualForm.date || !manualForm.doctorId}
                                className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                            >
                                <Save size={18} />
                                {manualLoading ? 'Salvando...' : 'Salvar Registro de Falta'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceManagement;
