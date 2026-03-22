import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useToast } from '../../contexts/ToastContext';
import { Appointment, TreatmentPlan, FinancialRecord } from '../../types';
import { X, Calendar, DollarSign, CheckCircle2, Clock, ChevronLeft, ChevronRight, Printer, Search, ChevronDown, ChevronUp, FileText, Trash2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { rebalancePayments } from '../../services/paymentService';

interface FinancialControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBackdropClick?: () => void;
}

// Enhanced Plan Interface
interface EnhancedPlan extends TreatmentPlan {
    sessions?: any[];
    payments?: any[];
    total_paid?: number;
    balance?: number;
    patientName?: string;
    specialtyName?: string;
}

const FinancialAccordionItem = ({ plan }: { plan: EnhancedPlan }) => {
    const [isOpen, setIsOpen] = useState(false);

    const attendedApts = plan.sessions?.filter(a => a.attendance_status === 'attended') || [];
    const regularAttendedApts = attendedApts.filter(a => a.type !== 'Avaliação');
    const totalSessions = plan.total_sessions || 0;
    const attendedCount = attendedApts.length;
    const regularAttendedCount = regularAttendedApts.length;

    // Calculate totals - evaluations are free
    const totalPaid = plan.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const costOfAttended = regularAttendedCount * (plan.price_per_session || 0);
    const balance = totalPaid - costOfAttended;
    const isPaid = balance >= 0;

    return (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden transition-all hover:shadow-lg mb-4 group">
            {/* Header */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="p-6 flex items-center justify-between cursor-pointer bg-white hover:bg-slate-50/50 transition-colors"
            >
                <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-900 text-base capitalize tracking-tight">{plan.patient?.name.toLowerCase()}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase tracking-widest ${isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                {isPaid ? 'Pago' : 'Pendente'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold tracking-wide">
                                {attendedCount} / {totalSessions} Presenças
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Pago</p>
                        <p className={`font-black text-base ${isPaid ? 'text-emerald-600' : 'text-slate-900'}`}>R$ {totalPaid.toFixed(2)}</p>
                    </div>
                    <div className={`p-2.5 rounded-xl border border-slate-100 transition-all ${isOpen ? 'bg-indigo-50 text-indigo-600 border-indigo-100 rotate-180' : 'bg-white text-slate-400 group-hover:bg-slate-50'}`}>
                        <ChevronDown size={20} />
                    </div>
                </div>
            </div>

            {/* Body */}
            {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/30 p-6 animate-in slide-in-from-top-2">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Sessão</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Pago</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {attendedApts.map((apt: any) => {
                                    const allocated = apt.allocations?.reduce((sum: number, a: any) => sum + (a.amount || 0), 0) || 0;
                                    const method = apt.allocations?.[0]?.payment?.payment_method;

                                    return (
                                        <tr key={apt.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3.5 text-xs font-bold text-slate-700">
                                                {format(parseISO(apt.date), 'dd/MM/yyyy')}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-[8px] font-black px-2 py-1 rounded bg-emerald-100 text-emerald-700 uppercase tracking-wider">Presença</span>
                                            </td>
                                            <td className="px-5 py-3.5 text-xs font-bold text-slate-500 text-right">
                                                R$ {apt.type === 'Avaliação' ? '0' : plan.price_per_session}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                {apt.type === 'Avaliação' ? (
                                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Isento</span>
                                                ) : allocated > 0 ? (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-xs font-black text-emerald-600">R$ {allocated}</span>
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider border-t border-slate-100 mt-0.5 pt-0.5">{method || 'Crédito'}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider bg-rose-50 px-2 py-1 rounded">Pendente</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {attendedApts.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-50">
                                                <Calendar size={24} className="text-slate-400" />
                                                <p className="text-xs font-bold text-slate-400">Nenhuma presença registrada ainda.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const FinancialControlModal: React.FC<FinancialControlModalProps> = ({ isOpen, onClose, onBackdropClick }) => {
    const { addToast } = useToast();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [plans, setPlans] = useState<EnhancedPlan[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMethod, setFilterMethod] = useState<'todos' | 'pix' | 'credito' | 'debito'>('todos');
    const [filterSpecialty, setFilterSpecialty] = useState<'todas' | 'Fisioterapia' | 'Psicologia'>('todas');

    // Calculate week range
    const weekStart = startOfWeek(currentDate, { locale: ptBR });
    const weekEnd = endOfWeek(currentDate, { locale: ptBR });

    const fetchWeeklyData = async () => {
        setLoading(true);
        try {
            // 1. Get distinct plan IDs active this week
            const { data: weekApts, error: aptError } = await supabase
                .from('appointments')
                .select('treatment_plan_id')
                .in('type', ['Sessão', 'Primeira Consulta', 'Retorno', 'Avaliação'])
                .gte('date', weekStart.toISOString())
                .lte('date', weekEnd.toISOString());

            if (aptError) throw aptError;

            // Extract Unique IDs
            const planIds = Array.from(new Set(weekApts?.map((a: any) => a.treatment_plan_id).filter(Boolean)));

            if (planIds.length === 0) {
                setPlans([]);
                setLoading(false);
                return;
            }

            // 2. Fetch Full Plan Details for these IDs
            const { data: plansData, error: planError } = await supabase
                .from('treatment_plans')
                .select(`
                    *,
                    patient:patients(name),
                    specialty:specialties(name),
                    sessions:appointments(
                        id, date, status, attendance_status, type,
                        allocations:payment_allocations(amount, payment:therapy_payments(payment_method))
                    ),
                    payments:therapy_payments(amount, payment_method)
                `)
                .in('id', planIds)
                .order('created_at', { ascending: false });

            if (planError) throw planError;

            // Filter by specialty if needed on the JS side (or logic below)
            setPlans(plansData as any || []);

        } catch (error: any) {
            console.error('Error fetching data:', error);
            addToast('Erro ao carregar dados.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchWeeklyData();
        }
    }, [isOpen, currentDate]);

    const filteredPlans = useMemo(() => {
        return plans.filter(p => {
            // Filter out exempt plans
            if (p.is_paying === false) return false;

            const matchesSearch = (p.patient?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

            const specName = p.specialty?.name || '';
            const matchesSpecialty = filterSpecialty === 'todas' || specName.includes(filterSpecialty);

            // Check if ANY payment in the plan matches the filter method? 
            // Or if the plan has activity of that method? 
            // User likely wants to find plans that paid via 'Pix' recently.
            // For now, let's filter if the plan has ANY payment of that method.
            const matchesMethod = filterMethod === 'todos' || p.payments?.some((pay: any) => pay.payment_method === filterMethod);

            return matchesSearch && matchesSpecialty && matchesMethod;
        });
    }, [plans, searchTerm, filterSpecialty, filterMethod]);

    // Handle ESC
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    if (onBackdropClick) onBackdropClick();
                    else onClose();
                }
            }}
        >
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-300 h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <DollarSign className="text-emerald-600" size={24} />
                            Resumo Financeiro Semanal
                        </h2>
                        <p className="text-slate-500 text-sm font-medium">Resumo de sessões realizadas e pendências desta semana</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Date Navigation */}
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="text-center">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Semana de Referência</p>
                        <p className="text-lg font-bold text-slate-800">
                            {format(weekStart, "dd 'de' MMM", { locale: ptBR })} - {format(weekEnd, "dd 'de' MMM", { locale: ptBR })}
                        </p>
                    </div>
                    <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200">
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className="px-6 py-4 bg-white border-b border-slate-100 space-y-4">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex-1 max-w-sm relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Buscar por nome do paciente..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-xl text-xs font-semibold outline-none border border-slate-100 focus:border-indigo-300 focus:bg-white transition-all shadow-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Especialidade Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialidade:</span>
                            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm">
                                {['todas', 'Fisioterapia', 'Psicologia'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterSpecialty(s as any)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${filterSpecialty === s ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 border border-transparent'}`}
                                    >
                                        {s === 'todas' ? 'Todas' : s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-xs font-black uppercase tracking-widest">Carregando dados...</p>
                        </div>
                    ) : filteredPlans.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Search size={48} className="mb-4 opacity-20" />
                            <p className="font-medium text-center px-4">
                                Nenhum plano encontrado para o período/filtros.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredPlans.map((plan) => (
                                <FinancialAccordionItem key={plan.id} plan={plan} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FinancialControlModal;
