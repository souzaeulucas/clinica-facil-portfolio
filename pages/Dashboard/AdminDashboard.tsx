
// v1.0.1 - Refino de interface e tooltips mobile
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { format, parseISO, subDays, addDays, startOfDay, endOfDay, isWithinInterval, differenceInDays } from 'date-fns';
import {
    Calendar, Activity, User, FileText, Download,
    Filter, Clock, CircleHelp, TrendingUp, TrendingDown,
    Users, Stethoscope, ChevronDown, RefreshCw, Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
    Legend
} from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ModernDatePicker from '../../components/ui/ModernDatePicker';
import ModernSelect from '../../components/ui/ModernSelect';

interface DashboardAppointment {
    id: string;
    date: string;
    type: string;
    status: string;
    patient_name: string;
    doctor_id: string;
    doctor_name: string;
    specialty_id: string;
    specialty_name: string;
    created_at: string;
    is_sus?: boolean;
}

const COLORS = ['#0F172A', '#0D9488', '#6366F1', '#EC4899', '#F59E0B', '#8B5CF6', '#10B981', '#3B82F6'];

interface InsightCardProps {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    accent?: string;
    help?: string;
    tooltipAlign?: 'left' | 'right' | 'center';
}

const InsightCard: React.FC<InsightCardProps> = ({ title, value, subtitle, icon, accent = 'indigo', help, tooltipAlign = 'center' }) => {
    return (
        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 shadow-sm relative group hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
            <div className="absolute inset-0 overflow-hidden rounded-[1.5rem] md:rounded-[2rem] pointer-events-none">
                <div className={`absolute -right-4 -bottom-4 w-24 h-24 bg-${accent}-500/5 rounded-full group-hover:scale-150 transition-transform duration-700`} />
            </div>

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform duration-500 group-hover:bg-white">
                        {icon}
                    </div>
                    {help && (
                        <div className="group/help relative">
                            <CircleHelp size={14} className="text-slate-400 hover:text-indigo-400 cursor-help transition-colors" />
                            <div className="absolute right-0 top-full mt-3 w-48 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 group-hover/help:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-50 border border-white/10 after:content-[''] after:absolute after:bottom-full after:right-2 after:border-8 after:border-transparent after:border-b-slate-900">
                                {help}
                            </div>
                        </div>
                    )}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-0.5">{title}</p>
                <h3 className="text-2xl font-black text-slate-900 mb-0.5">{value}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{subtitle}</p>
            </div>
        </div>
    );
};

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState<DashboardAppointment[]>([]);
    const [doctors, setDoctors] = useState<{ id: string, name: string }[]>([]);
    const [specialties, setSpecialties] = useState<{ id: string, name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const [dateRange, setDateRange] = useState({
        start: format(new Date(), 'yyyy-MM-dd'),
        end: format(addDays(new Date(), 30), 'yyyy-MM-dd')
    });
    const [filterType, setFilterType] = useState<'all' | 'Primeira Consulta' | 'Retorno'>('all');
    const [filterDoctor, setFilterDoctor] = useState('all');
    const [filterSpecialty, setFilterSpecialty] = useState('all');
    const [isDoctorsExpanded, setIsDoctorsExpanded] = useState(false);
    const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
    const [activeFilterDays, setActiveFilterDays] = useState<number>(30);
    const queueRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchInitialData();
        const channel = supabase.channel('dashboard-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, fetchData)
            .subscribe();

        // Collapse card on Escape key or Click Outside
        const handleInteraction = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent && e.key === 'Escape') {
                setExpandedCardId(null);
            }
            if (e instanceof MouseEvent && queueRef.current && !queueRef.current.contains(e.target as Node)) {
                setExpandedCardId(null);
            }
        };

        document.addEventListener('keydown', handleInteraction);
        document.addEventListener('mousedown', handleInteraction);

        return () => {
            supabase.removeChannel(channel);
            document.removeEventListener('keydown', handleInteraction);
            document.removeEventListener('mousedown', handleInteraction);
        };
    }, []);



    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [docRes, specRes] = await Promise.all([
                supabase.from('doctors').select('id, name').order('name'),
                supabase.from('specialties').select('id, name').or('name.ilike.%fisioterap_a%,name.ilike.%psicolog_a%').order('name')
            ]);
            if (docRes.data) setDoctors(docRes.data);
            if (specRes.data) setSpecialties(specRes.data);
            await fetchData();
        } catch (error) {
            console.error('Error fetching initial data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchData = async () => {
        try {
            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    id, date, type, status, patient_id, doctor_id, specialty_id, created_at,
                    patients (name, cpf),
                    doctors (id, name, spec:specialties (name)),
                    specialty:specialties!specialty_id (id, name),
                    treatment_plans (is_sus)
                `);

            if (error) throw error;
            const formatted: DashboardAppointment[] = (data || []).map((item: any) => ({
                id: item.id,
                date: item.date,
                type: item.type,
                status: item.status,
                patient_name: item.patients?.name || 'Paciente a Definir',
                doctor_id: item.doctor_id,
                doctor_name: item.doctors?.name || 'Profissional Geral',
                specialty_id: item.specialty_id,
                specialty_name: item.specialty?.name || item.doctors?.spec?.name || 'Geral',
                created_at: item.created_at,
                is_sus: item.treatment_plans?.is_sus
            }));
            setAppointments(formatted);
        } catch (error: any) {
            console.error('Error fetching dashboard data:', error);
            const msg = error.message || '';
            if (msg.includes('JWT') || msg.includes('jwt')) {
                await supabase.auth.signOut();
                window.location.reload();
            }
        }
    };

    const exportDashboardToPDF = async () => {
        const dashboard = document.getElementById('dashboard-content');
        if (!dashboard) return;

        try {
            const canvas = await html2canvas(dashboard, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#f8fafc'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.setFontSize(10);
            pdf.text('Relatório Analítico - ClinicaFacil', 10, 10);
            pdf.text(`Período: ${format(parseISO(dateRange.start), 'dd/MM/yyyy')} até ${format(parseISO(dateRange.end), 'dd/MM/yyyy')}`, 10, 15);

            pdf.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
            pdf.save(`ClinicaFacil_Analise_${format(new Date(), 'dd_MM_yyyy')}.pdf`);
        } catch (error) {
            console.error('Erro ao gerar PDF do dashboard:', error);
        }
    };

    const [chartMetric, setChartMetric] = useState<'volume' | 'pending'>('volume');

    const { filteredData, stats, specialtyChart, doctorChart, timelineChart, insights, waitingQueue } = useMemo(() => {
        const start = startOfDay(parseISO(dateRange.start));
        const end = endOfDay(parseISO(dateRange.end));

        // Basic filtering for time and type
        const basicFiltered = appointments.filter(a => {
            const aptDate = parseISO(a.date);
            const withinDate = isWithinInterval(aptDate, { start, end });
            const matchType = filterType === 'all' || a.type === filterType;
            return withinDate && matchType;
        });

        // Top-level filters (doctor and specialty from selector)
        const fullFiltered = basicFiltered.filter(a => {
            const matchDoctor = filterDoctor === 'all' || a.doctor_id === filterDoctor;
            const matchSpecialty = filterSpecialty === 'all' || a.specialty_id === filterSpecialty;
            return matchDoctor && matchSpecialty;
        });

        const total = fullFiltered.length;
        const firsts = fullFiltered.filter(a => a.type === 'Primeira Consulta').length;
        const returns = fullFiltered.filter(a => a.type === 'Retorno').length;
        const official = fullFiltered.filter(a => a.status === 'official').length;
        const conversionRate = total > 0 ? (official / total) * 100 : 0;

        const specMap: Record<string, { id: string, count: number }> = {};
        const docMap: Record<string, number> = {};
        const timeMap: Record<string, number> = {};

        // Charts from fullFiltered initially, but we might want them to stay consistent
        // For specialty chart, let's use data filtered only by Doctor (so you see specialties of that doctor)
        const filteredByDoctor = basicFiltered.filter(a => filterDoctor === 'all' || a.doctor_id === filterDoctor);

        // Apply Chart Metric Logic (Volume vs Pending)
        const chartSourceData = chartMetric === 'volume'
            ? filteredByDoctor
            : filteredByDoctor.filter(a => a.status === 'scheduled');

        chartSourceData.forEach(p => {
            if (!specMap[p.specialty_name]) {
                specMap[p.specialty_name] = { id: p.specialty_id, count: 0 };
            }
            specMap[p.specialty_name].count++;
        });

        // For doctor chart, use data filtered by Specialty
        const filteredBySpecialty = basicFiltered.filter(a => filterSpecialty === 'all' || a.specialty_id === filterSpecialty);
        filteredBySpecialty.forEach(p => {
            docMap[p.doctor_name] = (docMap[p.doctor_name] || 0) + 1;
        });

        // Timeline always reacts to all filters
        fullFiltered.forEach(p => {
            const day = p.date.split('T')[0];
            timeMap[day] = (timeMap[day] || 0) + 1;
        });

        const specialtyChart = Object.entries(specMap)
            .map(([name, data]) => ({ name, value: data.count, id: data.id }))
            .sort((a, b) => b.value - a.value);

        const doctorChartData = [
            ...doctors.map(d => ({ name: d.name, value: docMap[d.name] || 0 })),
            ...(docMap['Profissional Geral'] ? [{ name: 'Profissional Geral', value: docMap['Profissional Geral'] }] : [])
        ].sort((a, b) => b.value - a.value);

        const daysDiff = differenceInDays(end, start);
        const timelineData = [];
        for (let i = 0; i <= daysDiff; i++) {
            const d = format(subDays(end, daysDiff - i), 'yyyy-MM-dd');
            timelineData.push({
                date: format(parseISO(d), 'dd/MM'),
                count: timeMap[d] || 0
            });
        }

        // Waiting Queue: Should react to filterSpecialty primarily
        const selectedSpecName = specialties.find(s => s.id === filterSpecialty)?.name;

        const queue = [...appointments]
            .filter(a => a.type === 'Primeira Consulta' && a.status === 'scheduled')
            .filter(a => filterSpecialty === 'all' || a.specialty_id === filterSpecialty || a.specialty_name === selectedSpecName)
            .filter(a => filterDoctor === 'all' || a.doctor_id === filterDoctor)
            .map(a => ({
                id: a.id,
                name: a.patient_name,
                specialty: a.specialty_name,
                daysWaiting: Math.max(0, differenceInDays(new Date(), parseISO(a.created_at))),
                doctor: a.doctor_name,
                is_sus: a.is_sus,
                raw: a
            }))
            .sort((a, b) => b.daysWaiting - a.daysWaiting)
            .slice(0, 5);

        const historicalTotal = appointments.length;

        return {
            filteredData: fullFiltered,
            stats: { total, firsts, returns, conversionRate, historicalTotal },
            specialtyChart,
            doctorChart: doctorChartData,
            timelineChart: timelineData,
            insights: { avgDaily: total / (daysDiff + 1) },
            waitingQueue: queue
        };
    }, [appointments, dateRange, filterType, filterDoctor, filterSpecialty, doctors, chartMetric]);

    const setQuickRange = (days: number) => {
        setActiveFilterDays(days);
        if (days === -1) {
            const allDates = appointments.map(a => parseISO(a.date).getTime());
            if (allDates.length === 0) return;
            const minDate = new Date(Math.min(...allDates));
            const maxDate = new Date(Math.max(...allDates));
            setDateRange({
                start: format(minDate, 'yyyy-MM-dd'),
                end: format(maxDate, 'yyyy-MM-dd')
            });
            return;
        }
        setDateRange({
            start: format(new Date(), 'yyyy-MM-dd'),
            end: format(addDays(new Date(), days), 'yyyy-MM-dd')
        });
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-1000 max-w-full overflow-x-hidden">
            <div className="bg-white p-4 md:p-5 rounded-[1.5rem] border border-slate-200 shadow-xl shadow-slate-200/50">
                <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
                    <div className="space-y-0.5 shrink-0">
                        <div className="flex items-center gap-2">
                            <Activity className="text-indigo-600 w-5 h-5" />
                            <h1 className="text-lg font-black text-slate-900 tracking-tight">Analytics Pro</h1>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Exploração inteligente</p>
                    </div>

                    <div className="flex flex-wrap xl:flex-nowrap items-end justify-start sm:justify-end gap-2 w-full xl:w-auto max-w-full">
                        <div className="space-y-1 w-auto">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar size={12} /> Período
                            </label>
                            <div className="flex gap-2">
                                <div className="w-48 sm:w-44">
                                    <ModernDatePicker
                                        value={dateRange.start}
                                        onChange={date => {
                                            setDateRange(prev => ({ ...prev, start: date }));
                                            setActiveFilterDays(-999); // Custom range
                                        }}
                                        dateFormat="dd/MM/yyyy"
                                    />
                                </div>
                                <div className="w-48 sm:w-44">
                                    <ModernDatePicker
                                        value={dateRange.end}
                                        onChange={date => {
                                            setDateRange(prev => ({ ...prev, end: date }));
                                            setActiveFilterDays(-999);
                                        }}
                                        dateFormat="dd/MM/yyyy"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="w-full sm:w-48">
                            <ModernSelect
                                label="Especialidade"
                                value={filterSpecialty}
                                options={[
                                    { value: 'all', label: 'Todas' },
                                    ...specialties.map(s => ({ value: s.id, label: s.name }))
                                ]}
                                onChange={setFilterSpecialty}
                            />
                        </div>

                        <div className="w-full sm:w-56">
                            <ModernSelect
                                label="Profissional"
                                value={filterDoctor}
                                options={[
                                    { value: 'all', label: 'Todos os Médicos' },
                                    ...doctors.map(d => ({ value: d.id, label: d.name }))
                                ]}
                                onChange={setFilterDoctor}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={exportDashboardToPDF}
                                className="bg-slate-900 text-white h-[42px] px-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Download size={14} /> PDF
                            </button>
                            <button
                                onClick={() => { setFilterDoctor('all'); setFilterSpecialty('all'); setFilterType('all'); setQuickRange(30); }}
                                className="h-[42px] w-[42px] bg-slate-100 text-slate-400 rounded-xl hover:text-rose-500 transition-all flex items-center justify-center"
                                title="Resetar Filtros"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                </div>


            </div>

            <div id="dashboard-content" className="space-y-4 md:space-y-4 pb-0 max-w-full overflow-x-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <InsightCard
                        title="Histórico Total"
                        value={stats.historicalTotal}
                        subtitle="Tudo já registrado"
                        icon={<FileText className="text-slate-600" />}
                        accent="slate"
                        tooltipAlign="right"
                        help="Soma absoluta de todos os pacientes registrados desde o início, independentemente de filtros."
                    />
                    <InsightCard
                        title="Solicitações"
                        value={stats.total}
                        subtitle="No período atual"
                        icon={<TrendingUp className="text-emerald-500" />}
                        tooltipAlign="right"
                        help="Agendamentos que estão dentro das datas selecionadas acima."
                    />
                    <InsightCard
                        title="Novos Pacientes"
                        value={stats.firsts}
                        subtitle="No período"
                        icon={<User className="text-indigo-500" />}
                        accent="indigo"
                        tooltipAlign="right"
                        help="Agendamentos de primeira consulta marcados para este intervalo."
                    />
                    <InsightCard
                        title="Retornos"
                        value={stats.returns}
                        subtitle="Agendados no período"
                        icon={<RefreshCw className="text-amber-500" />}
                        accent="amber"
                        tooltipAlign="right"
                        help="Agendamentos de retorno marcados para este intervalo."
                    />
                    <InsightCard
                        title="Taxa de Registro"
                        value={`${stats.conversionRate.toFixed(1)}%`}
                        subtitle="Status: Agendado"
                        icon={<Activity className="text-rose-500" />}
                        accent="rose"
                        tooltipAlign="right"
                        help="Porcentagem de solicitações que já foram confirmadas no sistema."
                    />
                </div>

                <div className="bg-white p-4 md:p-5 rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Evolução dos Atendimentos</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Fluxo cronológico de solicitações</p>
                            </div>
                            <div className="group/help relative">
                                <CircleHelp size={14} className="text-slate-400 hover:text-indigo-400 cursor-help transition-colors" />
                                <div className="absolute right-0 md:right-auto md:left-0 top-6 w-64 max-w-[85vw] p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 group-hover/help:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-50 border border-white/10">
                                    Visualização cronológica do volume de agendamentos no período selecionado, permitindo identificar picos e tendências de demanda.
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-black text-indigo-600 leading-none">{insights.avgDaily.toFixed(1)}</span>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Média Diária</p>
                        </div>
                    </div>
                    <div className="h-[350px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timelineChart}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                                    padding={{ left: 10, right: 10 }}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <Tooltip
                                    formatter={(value) => [value, 'Solicitações']}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '16px', fontWeight: 'bold' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#6366F1"
                                    strokeWidth={4}
                                    fillOpacity={1}
                                    fill="url(#colorCount)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-4 md:p-5 rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex flex-col md:flex-row items-center gap-4">
                            <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                {[
                                    { label: 'Hoje', days: 0 },
                                    { label: '7 Dias', days: 7 },
                                    { label: '15 Dias', days: 15 },
                                    { label: '30 Dias', days: 30 },
                                    { label: '90 Dias', days: 90 },
                                    { label: 'Ver Tudo', days: -1 }
                                ].map(r => {
                                    const isActive = activeFilterDays === r.days;
                                    return (
                                        <button
                                            key={r.label}
                                            onClick={() => setQuickRange(r.days)}
                                            className={`
                                            px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border active:scale-95
                                            ${isActive
                                                    ? 'bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm'
                                                    : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100'
                                                }
                                        `}
                                        >
                                            {r.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
                                <Clock size={12} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Mostrando próximos compromissos</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-100 px-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtrar Tipo</span>
                            <div className="flex bg-white/50 p-1 rounded-lg shadow-inner">
                                {['all', 'Primeira Consulta', 'Retorno'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setFilterType(t as any)}
                                        className={`px-4 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${filterType === t ? 'bg-white text-indigo-600 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {t === 'all' ? 'Todos' : t.split(' ')[0]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white p-4 md:p-5 rounded-[1.5rem] border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between md:justify-start gap-4 mb-8 w-full">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Por Especialidade</h3>
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={() => setChartMetric('volume')}
                                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${chartMetric === 'volume' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        Volume Total
                                    </button>
                                    <button
                                        onClick={() => setChartMetric('pending')}
                                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${chartMetric === 'pending' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        Pendentes
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="h-[300px] w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={specialtyChart}
                                    layout="vertical"
                                    margin={{ left: 10, right: 30, top: 0, bottom: 0 }}
                                >
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 800, fill: '#334155' }}
                                        width={150}
                                        interval={0}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        formatter={(value) => [value, 'Pacientes']}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px', fontWeight: 'bold' }}
                                    />
                                    <Bar
                                        dataKey="value"
                                        radius={[0, 8, 8, 0]}
                                        barSize={20}
                                        className="cursor-pointer transition-all duration-300"
                                        onMouseDown={(data: any) => {
                                            if (data && data.id) {
                                                setFilterSpecialty(data.id);
                                            } else if (data && data.name) {
                                                const spec = specialties.find(s => s.name === data.name);
                                                if (spec) setFilterSpecialty(spec.id);
                                            }
                                        }}
                                        onClick={(data: any) => {
                                            if (data && data.id) {
                                                setFilterSpecialty(data.id);
                                            } else if (data && data.name) {
                                                const spec = specialties.find(s => s.name === data.name);
                                                if (spec) setFilterSpecialty(spec.id);
                                            }
                                        }}
                                        label={{
                                            position: 'right',
                                            fill: '#64748b',
                                            fontSize: 10,
                                            fontWeight: 'bold',
                                            offset: 10
                                        }}
                                    >
                                        {specialtyChart.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.id === filterSpecialty ? '#6366F1' : '#0F172A'}
                                                fillOpacity={filterSpecialty === 'all' || entry.id === filterSpecialty ? 1 : 0.3}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-5 rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col h-fit">
                        <div className="flex items-center justify-between mb-8 w-full">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Ranking de Médicos</h3>
                                <div className="group/help relative">
                                    <CircleHelp size={14} className="text-slate-400 hover:text-indigo-400 cursor-help transition-colors" />
                                    <div className="absolute right-0 md:right-auto md:left-0 top-6 w-64 max-w-[85vw] p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 group-hover/help:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-50 border border-white/10">
                                        Profissionais mais agendados no período.
                                    </div>
                                </div>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100 uppercase tracking-widest leading-none">
                                {doctors.length} Profissionais
                            </span>
                        </div>
                        <div className="flex-1 space-y-3">
                            {doctorChart.length > 0 ? (
                                <>
                                    {(isDoctorsExpanded ? doctorChart : doctorChart.slice(0, 5)).map((doc, idx) => (
                                        <div key={doc.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group hover:bg-slate-900 transition-all duration-300">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center font-black shadow-sm group-hover:bg-slate-800 transition-colors ${idx < 3 && !isDoctorsExpanded ? 'text-indigo-600' : 'text-slate-400'}`}>
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-black text-slate-700 group-hover:text-white transition-colors">{doc.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 group-hover:text-slate-400 uppercase tracking-widest">{doc.value} pacientes</p>
                                                </div>
                                            </div>
                                            <div className="h-1.5 w-24 bg-slate-200 rounded-full overflow-hidden group-hover:bg-slate-800">
                                                <div
                                                    className="h-full bg-slate-900 group-hover:bg-indigo-500 transition-all"
                                                    style={{ width: `${(doc.value / (stats.total || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {doctorChart.length > 5 && (
                                        <button
                                            onClick={() => setIsDoctorsExpanded(!isDoctorsExpanded)}
                                            className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-2xl border border-dashed border-slate-200 hover:border-indigo-200 transition-all active:scale-95 group/btn"
                                        >
                                            {isDoctorsExpanded ? 'Ocultar Ranking' : `Ver Todos os ${doctorChart.length - 5} Médicos`}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                                    <Users size={48} className="mb-4 opacity-20" />
                                    <p className="text-xs font-black uppercase tracking-widest">Sem dados</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-sm mt-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                    <Clock size={18} />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Fila de Prioridade</h3>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                                {filterSpecialty === 'all'
                                    ? "Pacientes aguardando há mais tempo (Geral)"
                                    : `Solicitações em ${specialties.find(s => s.id === filterSpecialty)?.name}`}
                            </p>
                        </div>

                        {filterSpecialty !== 'all' && (
                            <button
                                onClick={() => setFilterSpecialty('all')}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow-lg shadow-slate-200"
                            >
                                <RefreshCw size={14} className="animate-spin-slow" /> Ver Lista Geral
                            </button>
                        )}
                    </div>

                    <div
                        ref={queueRef}
                        className="flex flex-wrap lg:flex-nowrap gap-6 overflow-x-auto pb-4 no-scrollbar"
                    >
                        {waitingQueue.length > 0 ? (
                            waitingQueue.map((item, idx) => {
                                const isExpanded = expandedCardId === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        id={`queue-card-${item.id}`}
                                        onClick={() => {
                                            if (isExpanded) {
                                                navigate('/agendamentos', { state: { searchTerm: item.name, targetTab: 'pending' } });
                                            } else {
                                                setExpandedCardId(item.id);
                                            }
                                        }}
                                        className={`group relative bg-slate-50 rounded-[1.5rem] p-4 border border-slate-100 hover:border-indigo-200 hover:bg-white transition-[flex,min-width,background-color,border-color,box-shadow,transform,opacity,filter] duration-500 ease-in-out overflow-hidden cursor-pointer 
                                            ${isExpanded
                                                ? 'flex-[2.5] min-w-[340px] z-20 shadow-2xl shadow-indigo-100/50 scale-[1.02]'
                                                : expandedCardId
                                                    ? 'flex-1 min-w-[150px] opacity-40 blur-[0.5px] scale-[0.98] grayscale-[0.5]'
                                                    : 'flex-1 min-w-[200px] z-10'
                                            }`}
                                    >
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <TrendingUp size={40} className="text-indigo-600" />
                                        </div>

                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${item.daysWaiting > 7 ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                                                    {item.daysWaiting} dias
                                                </div>
                                                {item.is_sus && (
                                                    <div className="px-3 py-1 bg-teal-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">
                                                        SUS
                                                    </div>
                                                )}
                                                <span className="text-xs font-black text-slate-200 group-hover:text-indigo-100 transition-colors">#{idx + 1}</span>
                                            </div>

                                            <h4 className={`text-lg font-black text-slate-900 mb-1 capitalize group-hover:text-indigo-600 transition-colors leading-tight ${isExpanded ? '' : 'truncate'}`}>{item.name}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">{item.specialty}</p>

                                            <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:border-indigo-100 transition-all">
                                                        <Stethoscope size={14} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight truncate max-w-[140px]">
                                                        {item.doctor || 'Pendente'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200">
                                <Users size={40} className="text-slate-200 mb-4" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Nenhum paciente aguardando nesta categoria</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
