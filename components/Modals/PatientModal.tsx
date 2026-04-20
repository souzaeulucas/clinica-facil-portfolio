import React, { useState } from 'react';
import { X, UserRound, GraduationCap } from 'lucide-react';
import PatientForm from '../PatientForm';
import PatientDischarges from '../PatientDischarges';
import Portal from '../Portal';

interface PatientModalProps {
    isOpen: boolean;
    onClose: (data?: any) => void;
    patientId?: string;
    initialData?: any;
}

const PatientModal: React.FC<PatientModalProps> = ({ isOpen, onClose, patientId, initialData }) => {
    const [activeTab, setActiveTab] = useState<'cadastro' | 'altas'>('cadastro');

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Reset tab when modal opens for a different patient
    React.useEffect(() => {
        if (isOpen) setActiveTab('cadastro');
    }, [isOpen, patientId]);

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
                <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm z-10 flex-shrink-0">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                            {patientId ? 'Editar Paciente' : 'Novo Paciente'}
                        </h3>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                            {patientId ? 'Atualize os dados abaixo' : 'Preencha os dados para cadastro'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-rose-500 shadow-sm transition-all flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {patientId && (
                    <div className="flex border-b border-slate-100 px-8 bg-slate-50/50 flex-shrink-0 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setActiveTab('cadastro')}
                            className={`flex items-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'cadastro' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 group hover:border-slate-300'}`}
                        >
                            <UserRound size={14} className={activeTab === 'cadastro' ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'} /> Dados Cadastrais
                        </button>
                        <button
                            onClick={() => setActiveTab('altas')}
                            className={`flex items-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'altas' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600 group hover:border-slate-300'}`}
                        >
                            <GraduationCap size={16} className={activeTab === 'altas' ? 'text-emerald-500' : 'text-slate-400 group-hover:text-slate-600'} /> Histórico de Altas
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    <div className="p-8">
                        {activeTab === 'cadastro' || !patientId ? (
                            <PatientForm
                                patientId={patientId}
                                initialData={initialData}
                                onSuccess={onClose}
                            />
                        ) : (
                            <PatientDischarges patientId={patientId} />
                        )}
                    </div>
                </div>
            </div>
        </div>
        </Portal>
    );
};

export default PatientModal;
