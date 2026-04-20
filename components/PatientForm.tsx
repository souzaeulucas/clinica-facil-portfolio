import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Plus, Save, X, Calendar, Copy, MessageCircle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import ModernDatePicker from './ui/ModernDatePicker';
import { copyToClipboard } from '../utils/clipboard';
import { openWhatsApp } from '../utils/whatsapp';

interface PatientFormProps {
    patientId?: string;
    onSuccess: (data?: any) => void;
    initialData?: any;
}

const PatientForm: React.FC<PatientFormProps> = ({ patientId, onSuccess, initialData }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        phone2: '',
        cpf: '',
        birth_date: '',
        condition: 'none',
        is_sus: false
    });
    const [showPhone2, setShowPhone2] = useState(false);

    useEffect(() => {
        if (initialData) {
            const [p1, p2] = (initialData.phone || '').split(' / ');
            setFormData({
                name: initialData.name,
                email: initialData.email || '',
                phone: p1 || '',
                phone2: p2 || '',
                cpf: initialData.cpf || '',
                birth_date: initialData.birth_date || '',
                condition: initialData.condition || 'none',
                is_sus: !!initialData.is_sus
            });
            if (p2) setShowPhone2(true);
        } else if (patientId) {
            // Fallback fetch if no initialData provided but ID exists
            const fetchPatient = async () => {
                try {
                    const { data, error } = await supabase.from('patients').select('*').eq('id', patientId).single();
                    if (data) {
                        const [p1, p2] = (data.phone || '').split(' / ');
                        setFormData({
                            name: data.name,
                            email: data.email || '',
                            phone: p1 || '',
                            phone2: p2 || '',
                            cpf: data.cpf || '',
                            birth_date: data.birth_date || '',
                            condition: data.condition || 'none',
                            is_sus: !!data.is_sus
                        });
                        if (p2) setShowPhone2(true);
                    }
                } catch (e) { console.error(e); }
            };
            fetchPatient();
        }
    }, [initialData, patientId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name === 'phone' || name === 'phone2') {
            let v = value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
            if (v.length > 10) v = `${v.slice(0, 10)}-${v.slice(10)}`;
            setFormData(prev => ({ ...prev, [name]: v }));
        } else if (name === 'cpf') {
            let v = value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
            if (v.length > 7) v = `${v.slice(0, 7)}.${v.slice(7)}`;
            if (v.length > 11) v = `${v.slice(0, 11)}-${v.slice(11)}`;
            setFormData(prev => ({ ...prev, [name]: v }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const finalPhone = [formData.phone, formData.phone2].filter(p => p.trim()).join(' / ');

        if (!formData.name.trim()) {
            addToast('Por favor, informe o nome completo do paciente.', 'error');
            return;
        }

        if (!finalPhone) {
            addToast('Por favor, informe pelo menos um telefone.', 'error');
            return;
        }

        setLoading(true);
        try {
            const { phone2, ...dataToSave } = formData;
            const payload = { 
                ...dataToSave, 
                name: formData.name.trim(),
                phone: finalPhone 
            };

            if (patientId) {
                const { data: updated, error } = await supabase.from('patients').update(payload).eq('id', patientId).select().single();
                if (error) throw error;
                addToast('Paciente atualizado com sucesso!', 'success');
                onSuccess(updated);
            } else {
                const { data: created, error } = await supabase.from('patients').insert([payload]).select().single();
                if (error) throw error;
                addToast('Paciente cadastrado com sucesso!', 'success');
                onSuccess(created);
            }
        } catch (error) {
            console.error('Error saving patient:', error);
            addToast('Erro ao salvar paciente', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-500">
            <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 ml-1 uppercase tracking-wider">
                    Nome Completo
                </label>
                <div className="relative group">
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 text-sm"
                        placeholder="Digite o nome completo"
                        required
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between pr-2">
                        <label className="text-xs font-black text-slate-400 ml-1 uppercase tracking-wider">
                            CPF
                        </label>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(formData.cpf, 'CPF', addToast)}
                            className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Copiar CPF"
                        >
                            <Copy size={12} />
                        </button>
                    </div>
                    <input
                        type="text"
                        name="cpf"
                        value={formData.cpf}
                        onChange={handleChange}
                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 text-sm"
                        placeholder="000.000.000-00"
                        maxLength={14}
                    />
                </div>

                <div className="space-y-1.5">
                    <ModernDatePicker
                        label="Data de Nascimento"
                        value={formData.birth_date}
                        onChange={(date) => setFormData(prev => ({ ...prev, birth_date: date }))}
                    />
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-400 ml-1 uppercase tracking-wider flex items-center gap-2">
                            Telefone
                            {!showPhone2 && (
                                <button
                                    type="button"
                                    onClick={() => setShowPhone2(true)}
                                    className="text-indigo-600 hover:text-indigo-700 p-1 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-[10px]"
                                    title="Adicionar segundo telefone"
                                >
                                    <Plus size={12} /> <span className="font-bold">ADD EXTRA</span>
                                </button>
                            )}
                        </label>
                        <div className="flex items-center gap-1 pr-1">
                            <button
                                type="button"
                                onClick={() => copyToClipboard(formData.phone, 'Telefone', addToast)}
                                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600 transition-colors"
                                title="Copiar Telefone"
                            >
                                <Copy size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={() => openWhatsApp(formData.phone)}
                                className="p-1 hover:bg-emerald-50 rounded-md text-emerald-500 hover:text-emerald-600 transition-colors"
                                title="Abrir WhatsApp"
                            >
                                <MessageCircle size={14} />
                            </button>
                        </div>
                    </div>
                    <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 text-sm"
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                    />
                </div>

                {showPhone2 && (
                    <div className="space-y-1.5 animate-in slide-in-from-left-2 duration-300 md:col-start-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black text-slate-400 ml-1 uppercase tracking-wider flex items-center gap-2">
                                Telefone 2
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPhone2(false);
                                        setFormData(prev => ({ ...prev, phone2: '' }));
                                    }}
                                    className="text-rose-500 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </label>
                            <div className="flex items-center gap-1 pr-1">
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(formData.phone2, 'Telefone 2', addToast)}
                                    className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Copiar Telefone 2"
                                >
                                    <Copy size={12} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openWhatsApp(formData.phone2)}
                                    className="p-1 hover:bg-emerald-50 rounded-md text-emerald-500 hover:text-emerald-600 transition-colors"
                                    title="Abrir WhatsApp 2"
                                >
                                    <MessageCircle size={14} />
                                </button>
                            </div>
                        </div>
                        <input
                            type="text"
                            name="phone2"
                            value={formData.phone2}
                            onChange={handleChange}
                            className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 text-sm"
                            placeholder="(00) 00000-0000"
                            maxLength={15}
                        />
                    </div>
                )}
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 ml-1 uppercase tracking-wider">
                    Email (Opcional)
                </label>
                <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 text-sm"
                    placeholder="email@exemplo.com"
                />
            </div>

            {/* Condition Selector */}
            <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 ml-1 uppercase tracking-widest">
                    Tipo de Atendimento / Condição
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { id: 'none', label: 'Padrão', icon: 'User', color: 'slate' },
                        { id: 'priority', label: 'Prioridade', icon: 'Star', color: 'amber', description: 'Autismo / Mobilidade' },
                        { id: 'dpoc', label: 'DPOC', icon: 'Activity', color: 'indigo', description: 'Ambulatório DPOC' }
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, condition: opt.id }))}
                            className={`flex flex-col p-4 rounded-2xl border-2 transition-all text-left group ${formData.condition === opt.id
                                ? (opt.id === 'priority' ? 'border-amber-500 bg-amber-50 shadow-sm' :
                                    opt.id === 'dpoc' ? 'border-indigo-500 bg-indigo-50 shadow-sm' :
                                        'border-slate-800 bg-slate-50')
                                : 'border-slate-100 bg-white hover:border-slate-200'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-black uppercase tracking-widest ${formData.condition === opt.id
                                    ? (opt.id === 'priority' ? 'text-amber-700' :
                                        opt.id === 'dpoc' ? 'text-indigo-700' :
                                            'text-slate-900')
                                    : 'text-slate-500'
                                    }`}>
                                    {opt.label}
                                </span>
                            </div>
                            {opt.description && (
                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-500 transition-colors uppercase">
                                    {opt.description}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center pt-2">
                <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, is_sus: !prev.is_sus }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${formData.is_sus ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm' : 'bg-slate-50 border-slate-300 text-slate-400 opacity-60'}`}
                >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${formData.is_sus ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {formData.is_sus && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Paciente atendido pelo SUS</span>
                </button>
            </div>

            <div className="pt-6 border-t border-slate-100">
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} />
                    {loading ? 'Salvando...' : (patientId ? 'Atualizar Dados' : 'Cadastrar Paciente')}
                </button>
            </div>
        </form>
    );
};

export default PatientForm;
