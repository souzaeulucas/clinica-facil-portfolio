import React, { useState, useEffect } from 'react';
import { X, Calendar, Activity, RefreshCw, Archive, ArrowLeft } from 'lucide-react';
import FormPrimeiraConsulta from '../../components/FormPrimeiraConsulta';
import FormRetorno from '../../components/FormRetorno';
import TherapySessionForm from '../../components/AppointmentForms/TherapySessionForm';
import { supabase } from '../../services/supabase';

interface AppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'create' | 'edit';
    appointmentId?: string; // Optional, might be redundant if initialData is passed
    initialType?: 'Primeira Consulta' | 'Retorno' | 'Sessão';
    initialData?: any; // Full appointment object for editing
    onSuccess?: (highlightId?: string, highlightDate?: string) => void; // Callback to refresh list
    onBackdropClick?: () => void;
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({ isOpen, onClose, mode = 'create', appointmentId, initialType, initialData, onSuccess, onBackdropClick }) => {
    const [step, setStep] = useState<'type-selection' | 'form'>('type-selection');
    const [selectedType, setSelectedType] = useState<string>('');

    const handleBack = () => {
        if (mode === 'edit') {
            onClose();
        } else {
            setStep('type-selection');
        }
    };

    useEffect(() => {
        if (isOpen) {
            if (mode === 'create' && !initialType) {
                setStep('type-selection');
                setSelectedType('');
            } else {
                setStep('form');
                setSelectedType(initialType || initialData?.type || 'Primeira Consulta');
            }
        }
    }, [isOpen, mode, initialType, initialData]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // If we are in 'create' mode and in 'form' step, go back to selection
                if (mode === 'create' && step === 'form') {
                    handleBack();
                } else {
                    // Otherwise (edit mode, or already at selection), close the modal
                    onClose();
                }
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, step, mode]);

    const handleTypeSelect = (type: string) => {
        setSelectedType(type);
        setStep('form');
    };

    const handleSuccess = (highlightId?: string, highlightDate?: string) => {
        if (onSuccess) onSuccess(highlightId, highlightDate);
        onClose();
    };

    if (!isOpen) return null;

    const renderTypeSelection = () => (
        <div className="p-8">
            <h3 className="text-2xl font-black text-slate-900 mb-2">Novo Agendamento</h3>
            <p className="text-slate-500 font-bold mb-8 uppercase text-xs tracking-widest">Selecione o tipo de atendimento</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                    onClick={() => handleTypeSelect('Primeira Consulta')}
                    className="p-6 rounded-[2rem] bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-500 hover:bg-white transition-all group text-left relative overflow-hidden"
                >
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Activity size={60} className="text-indigo-600" />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white flex items-center justify-center mb-4 shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">
                        <Activity size={24} />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 group-hover:text-indigo-700 transition-colors">Primeira Consulta</h4>
                    <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wide">Cadastro inicial</p>
                </button>

                <button
                    onClick={() => handleTypeSelect('Retorno')}
                    className="p-6 rounded-[2rem] bg-amber-50 border-2 border-amber-100 hover:border-amber-500 hover:bg-white transition-all group text-left relative overflow-hidden"
                >
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <RefreshCw size={60} className="text-amber-600" />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center mb-4 shadow-lg shadow-amber-200 group-hover:scale-110 transition-transform">
                        <RefreshCw size={24} />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 group-hover:text-amber-700 transition-colors">Retorno</h4>
                    <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wide">Acompanhamento</p>
                </button>

                <button
                    onClick={() => handleTypeSelect('Sessão')}
                    className="p-6 rounded-[2rem] bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-500 hover:bg-white transition-all group text-left relative overflow-hidden"
                >
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Archive size={60} className="text-emerald-600" />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center mb-4 shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                        <Calendar size={24} />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 group-hover:text-emerald-700 transition-colors">Sessão</h4>
                    <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wide">Terapia / Tratamento</p>
                </button>
            </div>
        </div>
    );

    const renderForm = () => {
        const commonProps = {
            initialData: initialData,
            onSuccess: handleSuccess,
            isModal: true
        };

        const normalizedType = selectedType?.toLowerCase();

        if (normalizedType === 'primeira consulta') {
            return (
                <div className="p-6 md:p-8">
                    <FormPrimeiraConsulta {...commonProps} />
                </div>
            );
        }

        if (normalizedType === 'retorno') {
            return (
                <div className="p-6 md:p-8">
                    <FormRetorno {...commonProps} />
                </div>
            );
        }

        if (normalizedType === 'sessão' || normalizedType === 'avaliação') {
            return (
                <div className="h-full">
                    <TherapySessionForm {...commonProps} />
                </div>
            );
        }

        return null;
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    if (onBackdropClick) onBackdropClick();
                    else onClose();
                }
            }}
        >
            <div
                className={`bg-white w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] transition-all
                ${step === 'type-selection' ? 'max-w-4xl rounded-[2.5rem]' : 'max-w-5xl rounded-[2.5rem]'}
                `}
            >
                {/* Header for Form Step */}
                {step === 'form' && (
                    <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm sticky top-0 z-50">
                        <div className="flex items-center gap-4">
                            {mode === 'create' && (
                                <button onClick={handleBack} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-indigo-600 transition-colors">
                                    <ArrowLeft size={20} />
                                </button>
                            )}
                            <div>
                                <h3 className="text-xl font-black text-slate-900">{mode === 'edit' ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${selectedType === 'Primeira Consulta' ? 'bg-indigo-500' :
                                        selectedType === 'Retorno' ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`} />
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{selectedType}</p>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-500 transition-all">
                            <X size={20} />
                        </button>
                    </div>
                )}

                {/* Header for Selection Step (Simpler close) */}
                {step === 'type-selection' && (
                    <div className="absolute top-6 right-6 z-50">
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all">
                            <X size={24} />
                        </button>
                    </div>
                )}

                <div className="overflow-y-auto custom-scrollbar flex-1 relative bg-white mb-4 rounded-b-[2rem]">
                    {step === 'type-selection' ? renderTypeSelection() : renderForm()}
                </div>
            </div>
        </div>
    );
};

export default AppointmentModal;
