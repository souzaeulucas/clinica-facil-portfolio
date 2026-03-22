import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { Search, Stethoscope, User, Calendar, CircleCheck, CircleX, Info, Hash, List, Grid, Layout, Square, CirclePlus } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

interface DoctorWithSpecialty {
    id: string;
    name: string;
    min_age: number;
    max_age: number;
    accepts_sus: boolean;
    crm?: string;
    created_at?: string;
    specialties: {
        name: string;
        is_sus_exclusive: boolean;
    };
}

const DoctorsPublicView: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [doctors, setDoctors] = useState<DoctorWithSpecialty[]>([]);
    const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [ageFilter, setAgeFilter] = useState<string>('');
    const [susFilter, setSusFilter] = useState<'todos' | 'livre' | 'sus'>('todos');
    const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'specialty' | 'newest' | 'service'>('az');
    const [viewMode, setViewMode] = useState<'list' | 'grid-sm' | 'grid-md' | 'grid-lg'>(
        window.innerWidth < 768 ? 'grid-lg' : (localStorage.getItem('doctorViewMode') as any) || 'grid-md'
    );
    const { addToast } = useToast();

    useEffect(() => {
        fetchDoctors();

        // Garantir modo grid-lg no mobile caso redimensione
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setViewMode('grid-lg');
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchDoctors = async () => {
        try {
            const { data, error } = await supabase
                .from('doctors')
                .select('id, name, min_age, max_age, accepts_sus, crm, created_at, specialties!specialty_id(name, is_sus_exclusive)');

            if (error) throw error;

            // Normalizar dados (specialties pode vir como array em joins)
            const normalizedData = (data || []).map((doc: any) => ({
                ...doc,
                specialties: Array.isArray(doc.specialties) ? doc.specialties[0] : doc.specialties
            })) as DoctorWithSpecialty[];

            setDoctors(normalizedData);

            // Buscar contagem de pacientes pendentes por médico
            const { data: aptData, error: aptError } = await supabase
                .from('appointments')
                .select('doctor_id')
                .neq('status', 'official');

            if (!aptError && aptData) {
                const counts = aptData.reduce((acc: any, curr: any) => {
                    acc[curr.doctor_id] = (acc[curr.doctor_id] || 0) + 1;
                    return acc;
                }, {});
                setQueueCounts(counts);
            }
        } catch (error: any) {
            console.error('Error fetching doctors:', error);
            addToast('Erro ao carregar corpo clínico: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const cleanName = (name: string) => {
        return name.replace(/^(dr|dra|dr\(a\))\.\s+/i, '').trim().toLowerCase();
    };

    const filteredDoctors = useMemo(() => {
        let result = doctors.filter((doc: DoctorWithSpecialty) => {
            const matchesSearch =
                doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (doc.specialties?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

            const patientAge = parseInt(ageFilter);
            const matchesAge = isNaN(patientAge) || (patientAge >= doc.min_age && patientAge <= doc.max_age);

            const isSus = doc.specialties?.is_sus_exclusive ?? false;
            const matchesSus =
                susFilter === 'todos' ||
                (susFilter === 'livre' && !isSus) ||
                (susFilter === 'sus' && isSus);

            return matchesSearch && matchesAge && matchesSus;
        });

        // Aplicar ordenação
        result.sort((a: DoctorWithSpecialty, b: DoctorWithSpecialty) => {
            switch (sortOrder) {
                case 'az':
                    return cleanName(a.name).localeCompare(cleanName(b.name));
                case 'za':
                    return cleanName(b.name).localeCompare(cleanName(a.name));
                case 'specialty':
                    return (a.specialties?.name || '').localeCompare(b.specialties?.name || '');
                case 'newest':
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                case 'service':
                    // Livre Demanda (is_sus_exclusive: false) vem primeiro
                    const aIsSus = a.specialties?.is_sus_exclusive ?? false;
                    const bIsSus = b.specialties?.is_sus_exclusive ?? false;
                    if (aIsSus !== bIsSus) {
                        return aIsSus ? 1 : -1;
                    }
                    // Ordem alfabética como critério de desempate
                    return cleanName(a.name).localeCompare(cleanName(b.name));
                default:
                    return 0;
            }
        });

        return result;
    }, [doctors, searchTerm, ageFilter, susFilter, sortOrder]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
                <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Carregando Corpo Clínico...</p>
            </div>
        );
    }

    return (
        <div className="w-full custom-fade-in overflow-x-hidden px-4">
            {/* Header Section */}
            <div className="mb-10 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-3">Corpo Clínico</h1>
                        <p className="text-slate-500 font-medium max-w-2xl leading-relaxed">
                            Guia rápido para agendamentos. Consulte especialidades, faixas etárias atendidas e o tipo de encaminhamento necessário por cada profissional.
                        </p>
                    </div>

                    <div className="hidden md:flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-1 self-center md:self-end">
                        <button
                            onClick={() => { setViewMode('list'); localStorage.setItem('doctorViewMode', 'list'); }}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            title="Lista"
                        >
                            <List size={20} />
                        </button>
                        <button
                            onClick={() => { setViewMode('grid-sm'); localStorage.setItem('doctorViewMode', 'grid-sm'); }}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'grid-sm' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            title="Grade Curta"
                        >
                            <Grid size={20} />
                        </button>
                        <button
                            onClick={() => { setViewMode('grid-md'); localStorage.setItem('doctorViewMode', 'grid-md'); }}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'grid-md' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            title="Grade Média"
                        >
                            <Layout size={20} />
                        </button>
                        <button
                            onClick={() => { setViewMode('grid-lg'); localStorage.setItem('doctorViewMode', 'grid-lg'); }}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'grid-lg' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            title="Grade Focada"
                        >
                            <Square size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters Section */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-10 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Search size={120} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
                    <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pesquisar Profissional ou Área</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Search size={18} />
                            </div>
                            <input
                                type="text"
                                placeholder="Busque por nome ou especialidade..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Idade do Paciente</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Calendar size={18} />
                            </div>
                            <input
                                type="number"
                                placeholder="Ex: 5"
                                value={ageFilter}
                                min="0"
                                onChange={(e) => setAgeFilter(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ordenar por</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Hash size={18} />
                            </div>
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as any)}
                                className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all appearance-none cursor-pointer"
                            >
                                <option value="az">Nome: A-Z</option>
                                <option value="za">Nome: Z-A</option>
                                <option value="specialty">Especialidade</option>
                                <option value="service">Tipo de Atendimento</option>
                                <option value="newest">Mais Recentes</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar Atendimento</label>
                        <div className="flex bg-slate-100 p-1 rounded-2xl">
                            {(['todos', 'livre', 'sus'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setSusFilter(mode)}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${susFilter === mode ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    {mode === 'todos' ? 'Todos' : mode === 'livre' ? 'Livre' : 'SUS'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            {filteredDoctors.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-4">
                        <CircleX size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 leading-none">Nenhum médico encontrado</h3>
                    <p className="text-slate-500 text-sm mt-2">Tente ajustar seus filtros ou termos de pesquisa.</p>
                    <button
                        onClick={() => { setSearchTerm(''); setAgeFilter(''); setSusFilter('todos'); setSortOrder('az'); }}
                        className="mt-6 text-teal-600 font-black text-[10px] uppercase tracking-widest hover:underline"
                    >
                        Limpar todos os filtros
                    </button>
                </div>
            ) : (
                <div key={viewMode} className={`
                    custom-fade-in
                    ${viewMode === 'list' ? 'flex flex-col gap-4' : 'grid gap-6'}
                    ${viewMode === 'grid-sm' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5' : ''}
                    ${viewMode === 'grid-md' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : ''}
                    ${viewMode === 'grid-lg' ? 'grid-cols-1 md:grid-cols-2' : ''}
                `}>
                    {filteredDoctors.map(doc => (
                        <div
                            key={doc.id}
                            onClick={() => navigate(`/agendamentos?doctor_id=${doc.id}`)}
                            className={`bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex relative max-w-full overflow-hidden cursor-pointer ${viewMode === 'list' ? 'flex-row items-center gap-4 md:gap-6' : 'flex-col'}`}
                        >
                            {viewMode === 'grid-sm' && (
                                <div className="absolute top-3 right-3 flex items-center gap-1.5 translate-y-[-2px]">
                                    {doc.specialties?.is_sus_exclusive ? (
                                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" title="SUS" />
                                    ) : (
                                        <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]" title="Livre Demanda" />
                                    )}
                                </div>
                            )}

                            {viewMode === 'grid-lg' ? (
                                <>
                                    {/* Layout Refinado para Grade Focada (O que o usuário gostou no mobile) */}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100 shadow-sm group-hover:scale-110 transition-transform">
                                            <Stethoscope size={20} />
                                        </div>
                                        <div className="w-px h-6 bg-slate-200" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Tipo de Serviço</span>
                                            {doc.specialties?.is_sus_exclusive ? (
                                                <span className="text-[11px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                    SUS (UBS)
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-black text-amber-600 uppercase tracking-tight flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                    Livre Demanda
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <h3 className="font-black text-slate-900 tracking-tight transition-colors group-hover:text-teal-600 text-xl md:text-2xl mb-1">
                                            {doc.name}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2 mb-4">
                                            <span className="font-bold text-slate-500 uppercase tracking-widest block text-xs">
                                                {doc.specialties?.name || 'Sem especialidade'}
                                            </span>
                                            {doc.crm && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-tight border border-slate-200/50">
                                                    CRM {doc.crm}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white group-hover:border-teal-100 transition-all">
                                            <Calendar size={18} className="text-teal-500 shrink-0" />
                                            <div className="w-px h-6 bg-slate-200" />
                                            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Atendimento</span>
                                                <div className="hidden md:block w-1 h-1 rounded-full bg-slate-300" />
                                                <span className="text-sm font-black text-slate-700 tracking-tight">
                                                    {doc.min_age} a {doc.max_age} ANOS
                                                </span>
                                            </div>

                                            {queueCounts[doc.id] > 0 && (
                                                <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-teal-100 shadow-sm animate-pulse">
                                                    <div className="w-2 h-2 rounded-full bg-teal-500" />
                                                    <span className="text-[10px] font-black text-teal-700 uppercase tracking-tight">
                                                        {queueCounts[doc.id]} em espera
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center mt-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate('/agendamentos', {
                                                    state: {
                                                        action: 'new',
                                                        targetTab: 'retorno',
                                                        prefilledDoctor: doc.id,
                                                        prefilledDoctorName: doc.name,
                                                        prefilledSpecialty: doc.specialties?.name
                                                    }
                                                });
                                            }}
                                            className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-teal-600 text-white font-black text-[11px] uppercase tracking-widest shadow-lg shadow-teal-900/10 hover:bg-teal-700 active:scale-95 transition-all group/btn"
                                        >
                                            <CirclePlus size={16} className="group-hover/btn:rotate-90 transition-transform duration-300" />
                                            NOVO RETORNO
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Layouts Padrão para List, grid-sm, grid-md */}
                                    <div className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-teal-100 text-teal-600 shadow-inner group-hover:scale-110 transition-transform ${viewMode === 'grid-sm' ? 'w-8 h-8' : 'w-14 h-14'} ${viewMode === 'list' ? 'shrink-0' : 'mb-6'}`}>
                                        <User size={viewMode === 'grid-sm' ? 16 : 28} />
                                    </div>

                                    <div className={`flex flex-col flex-1 ${viewMode === 'list' ? 'md:flex-row md:items-center gap-6' : ''}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className={`flex flex-col ${viewMode === 'list' ? 'gap-1' : 'items-start gap-2'}`}>
                                                <div className="flex items-center gap-2">
                                                    <h3 className={`font-black text-slate-900 tracking-tight transition-colors group-hover:text-teal-600 line-clamp-2 whitespace-normal ${viewMode === 'grid-sm' ? 'text-[11px] leading-tight mb-0.5' : 'text-lg md:text-xl'}`}>
                                                        {doc.name}
                                                    </h3>
                                                </div>
                                                <div className={`flex flex-wrap items-center gap-2 ${viewMode === 'list' ? '' : 'mt-1'}`}>
                                                    <span className={`font-bold text-slate-500 uppercase tracking-widest block line-clamp-1 ${viewMode === 'grid-sm' ? 'text-[7px]' : 'text-[10px] md:text-xs'}`}>
                                                        {doc.specialties?.name || 'Sem especialidade'}
                                                    </span>
                                                    {doc.crm && viewMode !== 'grid-sm' && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-tight border border-slate-200/50 shrink-0">
                                                            CRM {doc.crm}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={`flex flex-wrap items-center gap-2 sm:gap-4 ${viewMode === 'list' ? 'mt-3' : 'mt-4 pt-4 border-t border-slate-50 justify-between'}`}>
                                            {viewMode !== 'grid-sm' && (
                                                <div className={`flex items-center gap-2 md:gap-3 bg-slate-50/50 px-3 py-1.5 rounded-xl border border-slate-100 ${viewMode === 'list' ? 'w-full md:w-auto md:inline-flex' : ''}`}>
                                                    <div className="flex items-center gap-2 text-slate-500">
                                                        <Calendar size={14} className="text-teal-500 shrink-0" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest leading-tight">Atendimento</span>
                                                    </div>
                                                    <div className="w-px h-3 bg-slate-200 hidden md:block" />
                                                    <span className="text-[10px] md:text-xs font-black text-slate-700 tracking-tight whitespace-nowrap ml-auto md:ml-0">
                                                        {doc.min_age} a {doc.max_age} ANOS
                                                    </span>
                                                </div>
                                            )}

                                            <div className={`flex flex-wrap items-center gap-2 ${viewMode === 'list' ? 'w-full md:w-auto' : 'ml-auto'}`}>
                                                {viewMode !== 'grid-sm' && (
                                                    doc.specialties?.is_sus_exclusive ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-tight border border-blue-100">
                                                            <CircleCheck size={12} />
                                                            SUS
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-tight border border-amber-100">
                                                            <Info size={12} />
                                                            Livre
                                                        </span>
                                                    )
                                                )}

                                                {queueCounts[doc.id] > 0 && (
                                                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 animate-pulse ${viewMode === 'list' ? 'ml-auto md:ml-0' : ''}`}>
                                                        <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                                        <span className="text-[10px] font-black text-teal-700 uppercase tracking-tight">
                                                            {queueCounts[doc.id]} na Fila
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`flex flex-wrap gap-2 ${viewMode === 'list' ? 'ml-auto md:ml-4 self-center' : 'mt-4'} ${viewMode === 'grid-sm' ? 'absolute bottom-3 right-3 mt-0' : ''}`}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate('/agendamentos', {
                                                    state: {
                                                        action: 'new',
                                                        targetTab: 'retorno',
                                                        prefilledDoctor: doc.id,
                                                        prefilledDoctorName: doc.name,
                                                        prefilledSpecialty: doc.specialties?.name
                                                    }
                                                });
                                            }}
                                            className={`flex items-center justify-center transition-all bg-teal-600 text-white hover:bg-teal-700 font-black uppercase tracking-widest shadow-lg shadow-teal-900/10 active:scale-95 group/btn ${viewMode === 'grid-sm'
                                                ? 'w-7 h-7 rounded-full'
                                                : viewMode === 'list'
                                                    ? 'w-11 h-11 md:w-auto rounded-full md:px-6 md:py-3 md:rounded-xl md:text-[10px] gap-1.5'
                                                    : 'flex-1 min-w-[110px] py-2.5 sm:py-3 px-3 sm:px-6 rounded-xl text-[9px] sm:text-[10px] gap-1.5'
                                                }`}
                                        >
                                            <CirclePlus size={viewMode === 'grid-sm' ? 16 : 14} className="group-hover/btn:rotate-90 transition-transform duration-300" />
                                            {(viewMode !== 'grid-sm' && viewMode !== 'list') && (
                                                <span>Novo Retorno</span>
                                            )}
                                            <span className="hidden md:inline">{viewMode === 'list' && 'Novo Retorno'}</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Footer Tip */}
            <div className="mt-12 p-6 bg-slate-900 rounded-3xl text-center md:text-left flex flex-col md:flex-row items-center gap-6 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-teal-500 flex items-center justify-center text-white shrink-0">
                    <Info size={24} />
                </div>
                <div>
                    <h4 className="text-white font-bold text-lg leading-none">Dica de Agendamento</h4>
                    <p className="text-slate-400 text-sm mt-1">Sempre verifique a idade do paciente antes de confirmar o agendamento.</p>
                </div>
            </div>
        </div>
    );
};

export default DoctorsPublicView;
