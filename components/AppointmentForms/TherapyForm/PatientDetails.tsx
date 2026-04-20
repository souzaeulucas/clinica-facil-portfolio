import React, { useState } from 'react';
import { Plus, CircleAlert, Pencil, Copy, MessageCircle } from 'lucide-react';
import { copyToClipboard } from '../../../utils/clipboard';
import { openWhatsApp } from '../../../utils/whatsapp';
import PatientSearchSelect from '../../ui/PatientSearchSelect';
import ModernDatePicker from '../../ui/ModernDatePicker';
import PatientModal from '../../Modals/PatientModal';

interface Patient {
    id: string;
    name: string;
    cpf: string;
    phone: string;
    is_blocked?: boolean;
    birth_date?: string;
    is_sus?: boolean;
}

interface Specialty {
    id: string;
    name: string;
}

interface PatientDetailsProps {
    patientSearch: string;
    setPatientSearch: (val: string) => void;
    setSelectedPatient: (p: Patient | null) => void;
    selectedPatient: Patient | null;
    birthDate: string;
    setBirthDate: (val: string) => void;
    age: number | '';
    patients: any[];
    setPatients: (p: any[]) => void;
    newPatientCPF: string;
    setNewPatientCPF: (val: string) => void;
    newPatientPhone: string;
    setNewPatientPhone: (val: string) => void;
    formatPatientName: (name: string) => string;
    formatCPF: (v: string) => string;
    formatPhone: (v: string) => string;
    addToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const PatientDetails: React.FC<PatientDetailsProps> = ({
    patientSearch, setPatientSearch, setSelectedPatient, selectedPatient,
    birthDate, setBirthDate, age, patients, setPatients,
    newPatientCPF, setNewPatientCPF, newPatientPhone, setNewPatientPhone,
    formatPatientName, formatCPF, formatPhone, addToast
}) => {
    const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
    return (
        <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200 relative z-50">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
                Identificação e Especialidade
            </h3>

            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 lg:col-span-8 space-y-1.5 relative z-[60]">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            Nome do Paciente
                        </label>
                        {selectedPatient && (
                            <button
                                type="button"
                                onClick={() => setIsPatientModalOpen(true)}
                                className="flex items-center gap-1 text-[9px] font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg transition-all uppercase tracking-tighter"
                            >
                                <Pencil size={10} /> Editar Cadastro
                            </button>
                        )}
                    </div>
                    <div className="relative group">
                        <PatientSearchSelect
                            value={patientSearch}
                            onChange={(text) => {
                                setPatientSearch(formatPatientName(text));
                                setSelectedPatient(null);
                            }}
                            onSelect={(patient) => {
                                const formattedName = formatPatientName(patient.name);
                                setPatientSearch(formattedName);
                                setSelectedPatient({
                                    id: patient.id,
                                    name: formattedName,
                                    cpf: patient.cpf || '',
                                    phone: patient.phone || '',
                                    is_blocked: patient.is_blocked,
                                    birth_date: patient.birth_date,
                                    is_sus: patient.is_sus
                                });
                                // Auto-fill fields
                                setNewPatientCPF(patient.cpf || '');
                                setNewPatientPhone(patient.phone || '');
                                if (patient.birth_date) {
                                    setBirthDate(patient.birth_date);
                                } else {
                                    setBirthDate('');
                                }

                                if (patient.is_blocked) {
                                    addToast('Este paciente possui pendências de faltas.', 'error');
                                } else {
                                    addToast('Paciente selecionado com sucesso!', 'success');
                                }
                            }}
                            onResults={(results) => setPatients(results as any)}
                            placeholder="Busque por nome, CPF ou telefone..."
                        />
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-4 space-y-1.5 relative z-30">
                    <ModernDatePicker
                        label="Data de Nascimento"
                        value={birthDate}
                        onChange={setBirthDate}
                        allowManualInput
                    />
                    {age !== '' && (
                        <p className="mt-2 text-[10px] text-amber-600 font-bold flex items-center gap-1">
                            <CircleAlert size={10} />
                            Sugestão automática: {age} anos
                        </p>
                    )}
                </div>

                {(selectedPatient || (patientSearch.length > 2 && patients.length === 0)) && (
                    <div className="col-span-12 bg-slate-50 border-2 border-slate-100 rounded-xl p-4 space-y-3 animate-in fade-in zoom-in duration-300 shadow-sm relative z-40">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                                <div className="bg-indigo-100 p-1.5 rounded-lg">
                                    <Plus size={14} className="text-indigo-600" />
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                    {selectedPatient ? 'Dados do Paciente' : 'Novo Paciente'}
                                </span>
                            </div>
                            {!selectedPatient && (
                                <span className="text-[9px] font-bold text-amber-500 italic">Preencha para cadastrar</span>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">CPF</label>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(newPatientCPF, 'CPF', addToast)}
                                        className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600 transition-colors"
                                        title="Copiar CPF"
                                    >
                                        <Copy size={12} />
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    placeholder="000.000.000-00"
                                    maxLength={14}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-slate-100 rounded-xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm shadow-inner"
                                    value={newPatientCPF}
                                    onChange={(e) => setNewPatientCPF(formatCPF(e.target.value))}
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Telefone</label>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(newPatientPhone, 'Telefone', addToast)}
                                            className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600 transition-colors"
                                            title="Copiar Telefone"
                                        >
                                            <Copy size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openWhatsApp(newPatientPhone)}
                                            className="p-1 hover:bg-emerald-50 rounded-md text-emerald-500 hover:text-emerald-600 transition-colors"
                                            title="Abrir WhatsApp"
                                        >
                                            <MessageCircle size={14} />
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    placeholder="(00) 00000-0000"
                                    maxLength={15}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-slate-100 rounded-xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm shadow-inner"
                                    value={newPatientPhone}
                                    onChange={(e) => setNewPatientPhone(formatPhone(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {selectedPatient?.is_blocked && (
                    <div className="col-span-12 bg-rose-50 border-2 border-rose-100 rounded-xl p-4 mt-3 animate-in fade-in zoom-in duration-300 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-rose-100 p-1.5 rounded-lg">
                                <CircleAlert size={14} className="text-rose-600" />
                            </div>
                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Acesso Bloqueado</span>
                        </div>
                        <p className="text-xs text-rose-700 font-bold leading-relaxed">
                            Este paciente atingiu o limite de <span className="underline">2 faltas não justificadas</span> e está bloqueado.
                        </p>
                    </div>
                )}
            </div>
            
            <PatientModal
                isOpen={isPatientModalOpen}
                onClose={(updatedPatient) => {
                    setIsPatientModalOpen(false);
                    if (updatedPatient) {
                        const formattedName = formatPatientName(updatedPatient.name);
                        const [p1, p2] = (updatedPatient.phone || '').split(' / ');
                        setPatientSearch(formattedName);
                        setSelectedPatient({
                            id: updatedPatient.id,
                            name: formattedName,
                            cpf: updatedPatient.cpf || '',
                            phone: p1 || '',
                            is_blocked: updatedPatient.is_blocked,
                            birth_date: updatedPatient.birth_date,
                            is_sus: updatedPatient.is_sus
                        });
                        setNewPatientCPF(updatedPatient.cpf || '');
                        setNewPatientPhone(p1 || ''); // Use first phone for the main phone field
                        if (updatedPatient.birth_date) {
                            setBirthDate(updatedPatient.birth_date);
                        }
                    }
                }}
                patientId={selectedPatient?.id}
            />
        </div>
    );
};

export default PatientDetails;
