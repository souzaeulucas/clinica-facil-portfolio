import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Plus, Trash2, Search, Pencil, Check, Star, Activity, User } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../contexts/ToastContext';
import PatientModal from '../../components/Modals/PatientModal';
import { formatPatientName } from '../../utils/formatters';
import { includesNormalized } from '../../utils/string';

interface Patient {
    id: string;
    name: string;
    phone: string;
    cpf: string;
    condition?: 'none' | 'priority' | 'dpoc';
    is_sus?: boolean;
}

const PatientList: React.FC = () => {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 15;
    const { addToast } = useToast();
    const navigate = useNavigate();
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'single' | 'bulk';
        id?: string;
    }>({ isOpen: false, type: 'single' });

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchPatients(searchTerm);
        }, 400);
        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const fetchPatients = async (queryTerm = '') => {
        try {
            setLoading(true);
            let query = supabase
                .from('patients')
                .select('*')
                .order('name')
                .limit(200);

            if (queryTerm) {
                const cleanCPF = queryTerm.replace(/\D/g, '');
                // Creates a wildcard pattern for accent-insensitive search in SQL
                // e.g. "João" -> "%J__o%"
                const getWildcardPattern = (term: string) => {
                    return `%${term}%`;
                };

                if (cleanCPF.length >= 3) {
                    query = query.or(`cpf.ilike.%${cleanCPF}%,cpf.ilike.%${queryTerm}%,name.ilike."${getWildcardPattern(queryTerm)}"`);
                } else {
                    query = query.ilike('name', getWildcardPattern(queryTerm));
                }
            }

            const { data, error } = await query;

            if (error) throw error;
            setPatients(data || []);
        } catch (error) {
            console.error('Error fetching patients:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setConfirmModal({ isOpen: true, type: 'single', id });
    };

    const handleBulkDeleteClick = () => {
        setConfirmModal({ isOpen: true, type: 'bulk' });
    };

    const executeDelete = async () => {
        const idsToDelete = confirmModal.type === 'bulk' ? selectedIds : [confirmModal.id!];

        if (idsToDelete.length === 0) return;

        try {
            const { error, count } = await supabase
                .from('patients')
                .delete({ count: 'exact' })
                .in('id', idsToDelete);

            if (error) throw error;

            if (count === 0) {
                addToast('Nenhum paciente foi excluído. Verifique se você tem permissão de administrador.', 'warning');
            } else {
                addToast(idsToDelete.length > 1 ? `${count} pacientes excluídos!` : 'Paciente excluído com sucesso!', 'success');
                setSelectedIds([]);
                fetchPatients(searchTerm);
            }
        } catch (error: any) {
            console.error('Error deleting patient:', error);
            const errorMessage = error.message || '';
            if (errorMessage.includes('foreign key constraint')) {
                addToast('Não é possível excluir: existem agendamentos ou planos vinculados a este paciente.', 'error');
            } else {
                addToast(`Erro ao excluir: ${errorMessage || 'Entre em contato com o suporte.'}`, 'error');
            }
        } finally {
            setConfirmModal({ isOpen: false, type: 'single' });
        }
    };

    const filteredPatients = patients.filter(p => {
        if (!searchTerm) return true;
        const cleanCPF = searchTerm.replace(/\D/g, '');
        return includesNormalized(p.name, searchTerm) ||
            (cleanCPF.length > 0 && p.cpf && p.cpf.includes(cleanCPF)) ||
            (p.cpf && p.cpf.includes(searchTerm));
    });

    const paginatedPatients = React.useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredPatients.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredPatients, currentPage]);

    const totalPages = Math.ceil(filteredPatients.length / ITEMS_PER_PAGE);

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredPatients.length && filteredPatients.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredPatients.map(p => p.id));
        }
    };

    const toggleSelectPatient = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        patientId?: string;
        initialData?: any;
    }>({ isOpen: false });

    // Handle "Novo" action from other parts of the app
    const location = import.meta.env ? useLocation() : { state: null, pathname: '' } as any;
    // Fix: useLocation import needed

    useEffect(() => {
        if (location.state?.action === 'new') {
            setModalConfig({ isOpen: true });
            // Clear state to prevent reopening on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const handleCreate = () => {
        setModalConfig({ isOpen: true });
    };

    const handleEdit = (e: React.MouseEvent, patient: Patient) => {
        e.stopPropagation();
        setModalConfig({
            isOpen: true,
            patientId: patient.id,
            initialData: patient
        });
    };

    const handleCloseModal = () => {
        setModalConfig({ isOpen: false });
        fetchPatients(searchTerm);
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Pacientes</h1>
                    <p className="text-slate-500 font-medium">Gerencie o cadastro e histórico dos pacientes</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus size={18} />
                    Cadastrar Paciente
                </button>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row gap-6 items-center justify-between bg-slate-50/50">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou CPF..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 shadow-sm"
                        />
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-4 animate-in zoom-in duration-300 w-full md:w-auto">
                            <span className="text-sm font-bold text-slate-500">{selectedIds.length} selecionados</span>
                            <button
                                onClick={handleBulkDeleteClick}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-50 text-rose-600 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all border-2 border-rose-100"
                            >
                                <Trash2 size={18} />
                                Excluir Selecionados
                            </button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="p-20 text-center">
                        <div className="inline-block animate-spin rounded-full h-12 w-12 border-[4px] border-slate-200 border-t-indigo-600 mb-4" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando Pacientes...</p>
                    </div>
                ) : filteredPatients.length === 0 ? (
                    <div className="p-20 text-center">
                        <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                            <Search size={40} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-2">Nenhum paciente encontrado</h3>
                        <p className="text-slate-500 font-medium">
                            {searchTerm ? 'Tente buscar com outros termos.' : 'Comece cadastrando seu primeiro paciente.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="pl-8 pr-4 py-6 w-10">
                                        <button
                                            onClick={toggleSelectAll}
                                            className={`w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${selectedIds.length === filteredPatients.length && filteredPatients.length > 0
                                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                                : 'bg-white border-slate-200'
                                                }`}
                                        >
                                            {selectedIds.length === filteredPatients.length && filteredPatients.length > 0 && <Check size={14} strokeWidth={4} />}
                                        </button>
                                    </th>
                                    <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Nome do Paciente</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">CPF / Identificação</th>
                                    <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Telefone de Contato</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {paginatedPatients.map((patient) => (
                                    <tr
                                        key={patient.id}
                                        onClick={(e) => handleEdit(e, patient)}
                                        className={`group cursor-pointer transition-all ${selectedIds.includes(patient.id)
                                            ? 'bg-indigo-50/50'
                                            : patient.condition === 'priority'
                                                ? 'bg-amber-50/40 hover:bg-amber-100/40'
                                                : patient.condition === 'dpoc'
                                                    ? 'bg-indigo-50/40 hover:bg-indigo-100/40'
                                                    : 'hover:bg-slate-50/80'
                                            }`}
                                    >
                                        <td className="pl-8 pr-4 py-5" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => toggleSelectPatient(e, patient.id)}
                                                className={`w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${selectedIds.includes(patient.id)
                                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                                    : 'bg-white border-slate-200 group-hover:border-indigo-300'
                                                    }`}
                                            >
                                                {selectedIds.includes(patient.id) && <Check size={14} strokeWidth={4} />}
                                            </button>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-700 text-base group-hover:text-indigo-600 transition-colors">
                                                        {formatPatientName(patient.name)}
                                                    </span>
                                                    {patient.condition === 'priority' && (
                                                        <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border border-amber-200 shadow-sm animate-in zoom-in">
                                                            <Star size={10} fill="currentColor" />
                                                            Prioridade
                                                        </span>
                                                    )}
                                                    {patient.condition === 'dpoc' && (
                                                        <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border border-indigo-200 shadow-sm animate-in zoom-in">
                                                            <Activity size={10} />
                                                            DPOC
                                                        </span>
                                                    )}
                                                    {patient.is_sus && (
                                                        <span className="flex items-center gap-1 bg-blue-600 text-white px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-sm animate-in zoom-in">
                                                            SUS
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block md:hidden">{patient.cpf}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-sm font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/50">
                                                {patient.cpf || 'NÃO INFORMADO'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                {patient.phone || '-'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => handleEdit(e, patient)}
                                                    className="text-slate-400 hover:text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-50 transition-all"
                                                    title="Editar"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteClick(e, patient.id)}
                                                    className="text-slate-400 hover:text-rose-600 p-2.5 rounded-xl hover:bg-rose-50 transition-all"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && filteredPatients.length > ITEMS_PER_PAGE && (
                <div className="mt-8 flex items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-2">
                        Página {currentPage} de {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            Anterior
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
                        >
                            Próximo
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false, type: 'single' })}
                onConfirm={executeDelete}
                title={confirmModal.type === 'bulk' ? 'Excluir Pacientes' : 'Excluir Paciente'}
                message={
                    confirmModal.type === 'bulk'
                        ? `Tem certeza que deseja excluir os ${selectedIds.length} pacientes selecionados? Esta ação é irreversível.`
                        : "Tem certeza que deseja excluir este paciente? Esta ação é irreversível."
                }
                type="danger"
            />

            <PatientModal
                isOpen={modalConfig.isOpen}
                onClose={handleCloseModal}
                patientId={modalConfig.patientId}
                initialData={modalConfig.initialData}
            />
        </div>
    );
};

export default PatientList;
