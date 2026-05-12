import React, { useState, useEffect } from 'react';
import { X, Trash2, RefreshCcw, AlertTriangle, Calendar, User, Search, RefreshCw, FileQuestion, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useToast } from '../../contexts/ToastContext';
import { format, parseISO } from 'date-fns';
import ConfirmModal from '../ConfirmModal';
import { includesNormalized } from '../../utils/string';

interface DeletedAppointment {
    id: string;
    date: string;
    type: string;
    status: string;
    deleted_at: string;
    patients: { name: string; phone: string };
    doctors: { name: string };
    specialties: { name: string };
}

interface RecycleBinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRestored: () => void;
}

const RecycleBinModal: React.FC<RecycleBinModalProps> = ({ isOpen, onClose, onRestored }) => {
    const { addToast } = useToast();
    const [deletedItems, setDeletedItems] = useState<DeletedAppointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modals state
    const [confirmDeleteModal, setConfirmDeleteModal] = useState({ isOpen: false, id: '' });
    const [confirmEmptyModal, setConfirmEmptyModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchDeletedItems();
        }
    }, [isOpen]);

    // Handle Escape Key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !confirmDeleteModal.isOpen && !confirmEmptyModal) {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, confirmDeleteModal.isOpen, confirmEmptyModal, onClose]);


    const fetchDeletedItems = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    id, date, type, status, deleted_at,
                    patients (name, phone),
                    doctors (name),
                    specialties!specialty_id (name)
                `)
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

            if (error) throw error;

            // Handle potential array from specialties if not single reference
            const formatted = (data || []).map((item: any) => ({
                ...item,
                specialties: Array.isArray(item.specialties) ? item.specialties[0] : item.specialties
            }));

            setDeletedItems(formatted as DeletedAppointment[]);
        } catch (error: any) {
            console.error('Error fetching recycle bin:', error);
            addToast('Erro ao carregar a lixeira: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (id: string) => {
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('appointments')
                .update({ deleted_at: null })
                .eq('id', id);

            if (error) throw error;

            addToast('Agendamento restaurado com sucesso.', 'success');
            setDeletedItems(prev => prev.filter(item => item.id !== id));
            onRestored();
        } catch (error: any) {
            addToast('Erro ao restaurar: ' + error.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handlePermanentDelete = async () => {
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('appointments')
                .delete()
                .eq('id', confirmDeleteModal.id);

            if (error) throw error;

            addToast('Agendamento excluído permanentemente.', 'success');
            setDeletedItems(prev => prev.filter(item => item.id !== confirmDeleteModal.id));
        } catch (error: any) {
            addToast('Erro ao excluir permanentemente: ' + error.message, 'error');
        } finally {
            setActionLoading(false);
            setConfirmDeleteModal({ isOpen: false, id: '' });
        }
    };

    const handleEmptyBin = async () => {
        setActionLoading(true);
        try {
            // Bulk delete all that have deleted_at not null
            const { error } = await supabase
                .from('appointments')
                .delete()
                .not('deleted_at', 'is', null);

            if (error) throw error;

            addToast('Lixeira esvaziada com sucesso.', 'success');
            setDeletedItems([]);
        } catch (error: any) {
            addToast('Erro ao esvaziar lixeira: ' + error.message, 'error');
        } finally {
            setActionLoading(false);
            setConfirmEmptyModal(false);
        }
    };

    const filteredItems = deletedItems.filter(item => 
        includesNormalized(item.patients?.name || '', searchQuery) ||
        includesNormalized(item.doctors?.name || '', searchQuery)
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div 
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={() => !actionLoading && onClose()}
            />
            
            <div className="bg-white w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col relative z-10 animate-in zoom-in-95 duration-300 overflow-hidden">
                
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                            <Trash2 size={28} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Lixeira de Agendamentos</h2>
                            <p className="text-slate-500 font-medium text-sm mt-0.5">Recupere registros deletados acidentalmente.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar na lixeira..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-12 pr-4 py-3 bg-white border border-slate-200 focus:border-rose-500 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm w-full md:w-64"
                            />
                        </div>
                        
                        {deletedItems.length > 0 && (
                            <button
                                onClick={() => setConfirmEmptyModal(true)}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-5 py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap"
                            >
                                <Trash2 size={16} />
                                Esvaziar
                            </button>
                        )}
                        
                        <button 
                            onClick={onClose}
                            className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all ml-2"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8 no-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                            <RefreshCw size={40} className="animate-spin text-rose-500/50" />
                            <p className="font-black text-xs uppercase tracking-widest">Carregando Lixeira...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-6 text-slate-300">
                                <CheckCircle2 size={48} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2">A Lixeira está Vazia</h3>
                            <p className="text-slate-500 font-medium">Não há registros excluídos no momento ou que correspondam à sua busca.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredItems.map((item) => (
                                <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-rose-300 hover:shadow-md transition-all">
                                    <div className="flex items-center gap-5 min-w-0 flex-1">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                            <User size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-black text-slate-900 truncate text-lg">{item.patients?.name || 'Paciente Desconhecido'}</h4>
                                            <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                                                    <Calendar size={12} className="text-indigo-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Data Alvo: {format(parseISO(item.date), 'dd/MM/yyyy')}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[120px]">{item.doctors?.name || 'Sem Médico'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Deletado em: {format(parseISO(item.deleted_at), 'dd/MM/yyyy HH:mm')}</span>
                                                </div>
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-slate-200 text-slate-500">
                                                    {item.type}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 shrink-0 mt-4 md:mt-0">
                                        <button
                                            onClick={() => handleRestore(item.id)}
                                            disabled={actionLoading}
                                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                        >
                                            <RefreshCcw size={16} />
                                            Restaurar
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteModal({ isOpen: true, id: item.id })}
                                            disabled={actionLoading}
                                            className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                            title="Excluir Permanentemente"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                isOpen={confirmDeleteModal.isOpen}
                onClose={() => setConfirmDeleteModal({ isOpen: false, id: '' })}
                onConfirm={handlePermanentDelete}
                title="Excluir Permanentemente"
                message="Tem certeza que deseja excluir permanentemente este agendamento? Esta ação NÃO pode ser desfeita e o registro será apagado do banco de dados."
                type="danger"
            />

            <ConfirmModal
                isOpen={confirmEmptyModal}
                onClose={() => setConfirmEmptyModal(false)}
                onConfirm={handleEmptyBin}
                title="Esvaziar Lixeira"
                message="Tem certeza que deseja esvaziar a lixeira? TODOS os registros atualmente aqui serão excluídos permanentemente do banco de dados de forma irreversível."
                type="danger"
            />
        </div>
    );
};

export default RecycleBinModal;
