import React from 'react';
import { Plus, CircleAlert } from 'lucide-react';
import PatientSearchSelect from '../../ui/PatientSearchSelect';
import ModernDatePicker from '../../ui/ModernDatePicker';

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
    return (
        <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200 relative z-50">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
                Identificação e Especialidade
            </h3>

            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 lg:col-span-8 space-y-1.5 relative z-[60]">
                    <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider flex items-center gap-2">
                        Nome do Paciente
                    </label>
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
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">CPF</label>
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
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Telefone</label>
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
        </div>
    );
};

export default PatientDetails;
