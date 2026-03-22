import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { Medico, DoctorBaseSchedule, DoctorScheduleException, Especialidade } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Plus,
    Trash2,
    Clock,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Stethoscope,
    Search,
    Save,
    CalendarDays,
    DoorOpen,
    User,
    MoreVertical,
    Filter,
    LayoutGrid,
    List,
    ArrowRight,
    X,
    ShieldAlert,
    Download,
    FileSpreadsheet,
    StickyNote,
    ChevronDown,
    Pencil
} from 'lucide-react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays,
    eachDayOfInterval,
    getDay,
    parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { includesNormalized } from '../../utils/string';

const ScaleManagement: React.FC = () => {
    const { addToast } = useToast();
    const [doctors, setDoctors] = useState<Medico[]>([]);
    const [specialties, setSpecialties] = useState<Especialidade[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Data State
    const [baseSchedules, setBaseSchedules] = useState<DoctorBaseSchedule[]>([]);
    const [exceptions, setExceptions] = useState<DoctorScheduleException[]>([]);

    // UI State
    const [activeTab, setActiveTab] = useState<'weekly' | 'exceptions'>('weekly');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [docSearchQuery, setDocSearchQuery] = useState('');
    const [showDocDropdown, setShowDocDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');
    const [collapsedDays, setCollapsedDays] = useState<number[]>([]);
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Export Logic
    // Consistent Colors for Specialties - Softer Teal/Mint Palette
    const getColorForSpecialty = (specialty: string): [number, number, number] => {
        const colors: [number, number, number][] = [
            [20, 184, 166],  // teal-500
            [13, 148, 136],  // teal-600
            [15, 118, 110],  // teal-700
            [45, 212, 191],  // teal-400
            [94, 234, 212],  // teal-300
            [101, 163, 182], // blue-teal mix
            [16, 185, 129],  // emerald-500
            [5, 150, 105],   // emerald-600
        ];
        let hash = 0;
        for (let i = 0; i < specialty.length; i++) {
            hash = specialty.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    // Export Logic
    const handleExport = async (type: 'csv' | 'pdf') => {
        const filteredData = baseSchedules.filter(s => selectedDayFilter === 'all' ? true : s.day_of_week === selectedDayFilter);

        if (type === 'csv') {
            // ... (CSV logic remains unchanged)
            const headers = ['Medico', 'Especialidade', 'Dia da Semana', 'Periodo', 'Entrada', 'Saida', 'Salas', 'Tipo', 'Observacao'];
            const data = filteredData.map(s => {
                const doc = doctors.find(d => d.id === s.doctor_id);
                const docName = doc?.name || 'N/A';
                const spec = specialties.find(sp => sp.id === doc?.especialidade_id)?.name || 'N/A';
                const dayName = daysOfWeek.find(d => d.id === s.day_of_week)?.label || 'N/A';
                const periodName = periods.find(p => p.id === s.period)?.label || 'N/A';

                return [
                    docName,
                    spec,
                    dayName,
                    periodName,
                    s.start_time || '',
                    s.end_time || '',
                    (s.rooms || []).join(', '),
                    s.service_type || '',
                    s.observation || ''
                ].map(v => `"${v}"`).join(',');
            });

            const csvContent = [headers.join(','), ...data].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `escala_export_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (type === 'pdf') {
            const doc = new jsPDF({ orientation: 'landscape' });
            const pageWidth = doc.internal.pageSize.getWidth();

            // Try to load logo
            const img = new Image();
            img.src = '/logo_uam.png';
            await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
            });

            // Header Box - Teal Theme
            doc.setFillColor(13, 148, 136); // teal-600
            doc.rect(0, 0, pageWidth, 40, 'F');

            if (img.complete && img.naturalWidth > 0) {
                const imgWidth = img.naturalWidth;
                const imgHeight = img.naturalHeight;
                const ratio = imgWidth / imgHeight;
                const targetHeight = 22;
                const targetWidth = targetHeight * ratio;
                doc.addImage(img, 'PNG', 15, 9, targetWidth, targetHeight);
            }

            // Title and Metadata in Header
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(24);
            doc.setFont("helvetica", "bold");
            doc.text("ESCALA MÉDICA", pageWidth - 15, 20, { align: 'right' });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(204, 251, 241); // teal-100
            const dateStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
            doc.text(`Gerado em: ${dateStr}`, pageWidth - 15, 28, { align: 'right' });

            const tableRows: any[] = [];
            const sortedDays = daysOfWeek.sort((a, b) => a.id - b.id);

            sortedDays.forEach(day => {
                const daySlots = filteredData.filter(s => s.day_of_week === day.id);
                if (daySlots.length === 0) return;

                // Day Separator (Clean & Delicate)
                tableRows.push({
                    content: day.label.toUpperCase(),
                    colSpan: 5,
                    type: 'day-header'
                });

                periods.forEach(period => {
                    const periodSlots = daySlots.filter(s => s.period === period.id);
                    if (periodSlots.length === 0) return;

                    // Period Identification (Subtle)
                    tableRows.push({
                        content: `PERÍODO: ${period.label.toUpperCase()}`,
                        colSpan: 5,
                        type: 'period-header'
                    });

                    // Group by Specialty
                    const bySpecialty: Record<string, typeof periodSlots> = {};
                    periodSlots.forEach(s => {
                        const doctor = doctors.find(d => d.id === s.doctor_id);
                        const spec = specialties.find(sp => sp.id === (doctor?.specialty_id || doctor?.especialidade_id))?.name || 'OUTROS';
                        if (!bySpecialty[spec]) bySpecialty[spec] = [];
                        bySpecialty[spec].push(s);
                    });

                    Object.entries(bySpecialty).sort().forEach(([specName, specSlots]) => {
                        tableRows.push({
                            content: specName.toUpperCase(),
                            colSpan: 5,
                            type: 'spec-header',
                            specName: specName
                        });

                        specSlots.forEach(s => {
                            const doctor = doctors.find(d => d.id === s.doctor_id);
                            const spec = specialties.find(sp => sp.id === (doctor?.specialty_id || doctor?.especialidade_id))?.name || '---';
                            const timeStr = (s.start_time && s.end_time)
                                ? `${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}`
                                : '';

                            tableRows.push([
                                doctor?.name || 'N/A',
                                spec.toUpperCase(),
                                `SALA ${(s.rooms || []).join(', ')}`,
                                timeStr,
                                s.observation || ''
                            ]);
                        });
                    });
                });
            });

            autoTable(doc, {
                head: [['PROFISSIONAL', 'ESPECIALIDADE', 'LOCALIZAÇÃO', 'HORÁRIO', 'OBSERVAÇÃO']],
                body: tableRows,
                startY: 50,
                theme: 'grid',
                styles: {
                    fontSize: 8,
                    cellPadding: 4,
                    lineColor: [204, 214, 224], // Lighter lines
                    lineWidth: 0.05,
                    font: "helvetica"
                },
                headStyles: {
                    fillColor: [17, 94, 89], // teal-800
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    halign: 'left',
                    fontSize: 9,
                    cellPadding: 5
                },
                columnStyles: {
                    0: { fontStyle: 'bold', textColor: [17, 24, 39], cellWidth: 65 },
                    1: { textColor: [51, 65, 85], fontSize: 7.5, fontStyle: 'bold' },
                    2: { halign: 'center', fontStyle: 'bold', textColor: [13, 148, 136], cellWidth: 40 },
                    3: { halign: 'center', textColor: [71, 85, 105], cellWidth: 35 }
                },
                didParseCell: (data) => {
                    const raw = data.row.raw as any;

                    if (raw && raw.type === 'day-header') {
                        data.cell.styles.fillColor = [20, 184, 166]; // teal-500
                        data.cell.styles.textColor = [255, 255, 255];
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.halign = 'center';
                        data.cell.styles.fontSize = 11;
                        data.cell.styles.lineWidth = 0;
                        data.cell.styles.cellPadding = 3;
                    }

                    if (raw && raw.type === 'period-header') {
                        data.cell.styles.fillColor = [240, 253, 250]; // teal-50
                        data.cell.styles.textColor = [15, 118, 110]; // teal-700
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.halign = 'left';
                        data.cell.styles.fontSize = 8.5;
                        data.cell.styles.lineWidth = 0;
                        data.cell.styles.cellPadding = 2.5;
                    }

                    if (raw && raw.type === 'spec-header') {
                        const color = getColorForSpecialty(raw.specName);
                        // Make it very subtle - border left instead of full fill?
                        // For now let's use a very light version of the color as fill
                        data.cell.styles.fillColor = [color[0], color[1], color[2], 0.1] as any;
                        // Note: jsPDF autotable might not support alpha in fillColor array directly.
                        // Let's use a lightened version manually or just teal-100
                        data.cell.styles.fillColor = [229, 231, 235]; // Neutral gray for spec rows to avoid "pollution"
                        data.cell.styles.textColor = [55, 65, 81];
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.halign = 'left';
                        data.cell.styles.fontSize = 8;
                        data.cell.styles.cellPadding = 2;
                    }
                },
                margin: { bottom: 20 }
            });

            // Footer
            const totalPages = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(
                    `Clínica Fácil - Sistema de Gestão Inteligente | Página ${i} de ${totalPages}`,
                    pageWidth / 2,
                    doc.internal.pageSize.getHeight() - 10,
                    { align: 'center' }
                );
            }

            // Open in new tab instead of direct download
            window.open(doc.output('bloburl'), '_blank');
        }
    };

    // Unified Form State
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [commonObservation, setCommonObservation] = useState('');

    // Slots per day: { dayId: { ...config } }
    type SlotConfig = {
        period: 'morning' | 'afternoon' | 'night' | 'full_day';
        start_time: string;
        end_time: string;
        rooms: string[];
        id?: string; // If editing a specific existing record
    };

    // We map Day ID (1-5) to an array of slots? Or just one slot per day per modal?
    // User implies: "if I put two (Tue, Fri)... appears two times the option".
    // Usually a doctor *might* work Morning AND Afternoon on the same day.
    // But the user request implies One Config per Day for now? 
    // "abre a opção de escolher o período (manhã ou tarde)" -> Suggests 1 choice per day block.
    // Let's use a Map: DayID -> Config.
    const [scheduleSlots, setScheduleSlots] = useState<Record<number, SlotConfig>>({});

    const initialSlot: SlotConfig = {
        period: 'morning',
        start_time: '',
        end_time: '',
        rooms: ['']
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [docRes, specRes, baseRes, exRes] = await Promise.all([
                supabase.from('doctors').select('*').order('name'),
                supabase.from('specialties').select('*'),
                supabase.from('doctor_base_schedule').select(`
                    *,
                    doctor:doctors(name)
                `),
                supabase.from('doctor_schedule_exceptions').select('*')
            ]);

            setDoctors(docRes.data || []);
            setSpecialties(specRes.data || []);
            setBaseSchedules(baseRes.data || []);
            setExceptions(exRes.data || []);
        } catch (err) {
            console.error(err);
            addToast('Erro ao carregar dados da escala.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // ESC Key Listener for Modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isModalOpen) {
                setIsModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModalOpen]);




    const daysOfWeek = [
        { id: 1, label: 'Segunda-feira' },
        { id: 2, label: 'Terça-feira' },
        { id: 3, label: 'Quarta-feira' },
        { id: 4, label: 'Quinta-feira' },
        { id: 5, label: 'Sexta-feira' }
    ];

    const periods = [
        { id: 'morning', label: 'Manhã', icon: <Clock size={16} className="text-amber-500" /> },
        { id: 'afternoon', label: 'Tarde', icon: <Clock size={16} className="text-indigo-500" /> }
    ];

    const toggleDayCollapse = (dayId: number) => {
        setCollapsedDays(prev =>
            prev.includes(dayId)
                ? prev.filter(id => id !== dayId)
                : [...prev, dayId]
        );
    };

    const filteredDoctorsInModal = useMemo(() => {
        const result = !docSearchQuery
            ? doctors
            : doctors.filter(d => (d.name || '').toLowerCase().includes(docSearchQuery.toLowerCase()));

        // Reset highlight when filtering
        setHighlightedIndex(0);
        return result;
    }, [doctors, docSearchQuery]);

    const checkConflict = (newSchedule: Partial<DoctorBaseSchedule> & { rooms: string[] }) => {
        // Check conflicts for and against "Base Schedules" (Weekly)
        const filteredBase = baseSchedules.filter(s =>
            s.id !== newSchedule.id &&
            s.day_of_week === newSchedule.day_of_week &&
            s.period === newSchedule.period
        );

        for (const schedule of filteredBase) {
            // Simple intersection check for rooms
            const conflictRooms = schedule.rooms?.filter(r => newSchedule.rooms.includes(r)) || [];
            if (conflictRooms.length > 0) {
                const doc = doctors.find(d => d.id === schedule.doctor_id);
                return {
                    isConflict: true,
                    message: `Conflito de sala: ${doc?.name || 'Outro médico'} já está alocado na sala ${conflictRooms.join(', ')} neste período.`
                };
            }
        }

        return { isConflict: false };
    };

    const handleSaveSchedule = async (e: React.FormEvent, closeModal: boolean = true) => {
        e.preventDefault();

        if (!selectedDoctorId) {
            addToast('Por favor, selecione um profissional da lista.', 'error');
            return;
        }

        const slotEntries = Object.entries(scheduleSlots);
        if (slotEntries.length === 0) {
            addToast('Selecione pelo menos um dia da semana.', 'error');
            return;
        }

        setSaving(true);
        const doc = doctors.find(d => d.id === selectedDoctorId);
        const serviceType = doc?.accepts_sus ? 'SUS' : 'Livre';

        try {
            // Validate and Prepare all upserts
            const upserts = [];

            for (const [dayIdStr, config] of slotEntries) {
                const dayId = parseInt(dayIdStr);
                const cleanedRooms = config.rooms.filter(r => r.trim() !== '');

                if (cleanedRooms.length === 0) {
                    throw new Error(`Adicione pelo menos uma sala para ${daysOfWeek.find(d => d.id === dayId)?.label}.`);
                }

                if (!config.period) throw new Error('Período inválido.');

                const scheduleToSave = {
                    id: config.id, // If exists (Update), else undefined (Insert)
                    doctor_id: selectedDoctorId,
                    day_of_week: dayId,
                    period: config.period,
                    rooms: cleanedRooms,
                    start_time: config.start_time || undefined,
                    end_time: config.end_time || undefined,
                    service_type: serviceType,
                    observation: commonObservation || undefined
                };

                // Check conflict
                const conflict = checkConflict(scheduleToSave as any); // Cast for compatibility
                if (conflict.isConflict) {
                    throw new Error(conflict.message);
                }

                upserts.push(scheduleToSave);
            }

            // Execute Sequentially (or parallel)
            for (const schedule of upserts) {
                const { id, ...data } = schedule;
                if (id) {
                    const { error } = await supabase.from('doctor_base_schedule').update(data).eq('id', id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('doctor_base_schedule').insert([data]);
                    if (error) throw error;
                }
            }

            addToast('Escala salva com sucesso!', 'success');

            if (closeModal) {
                setIsModalOpen(false);
            } else {
                // Reset for next, keep doctor?
                // User asked for "Salvar e Outro", implies adding ANOTHER doctor or ANOTHER schedule?
                // Usually keeping doctor is good but clearing days.
                setScheduleSlots({});
            }
            fetchInitialData();
        } catch (err: any) {
            console.error(err);
            const msg = err.message || err.details || 'Erro desconhecido';
            addToast(`${msg}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSchedule = async (id: string) => {
        if (!confirm('Deseja realmente excluir este horário da escala base?')) return;
        try {
            const { error } = await supabase.from('doctor_base_schedule').delete().eq('id', id);
            if (error) throw error;
            addToast('Horário removido.', 'success');
            fetchInitialData();
        } catch (err) {
            console.error(err);
            addToast('Erro ao remover horário.', 'error');
        }
    };

    const getDoctorName = (id: string) => doctors.find(d => d.id === id)?.name || 'Médico não encontrado';
    const getDoctorSpecialty = (id: string) => {
        const doc = doctors.find(d => d.id === id);
        if (!doc) return '';
        const specialtyId = doc.specialty_id || doc.especialidade_id;
        if (!specialtyId) return '';
        const spec = specialties.find(s => s.id === specialtyId);
        return spec ? spec.name : '';
    };

    // Grouping Logic for "Spreadsheet" View
    const groupedBaseSchedules = useMemo(() => {
        const query = globalSearchQuery; // No need to toLowerCase() here, includesNormalized handles it
        const groups: Record<number, Record<string, DoctorBaseSchedule[]>> = {};

        daysOfWeek.forEach(day => {
            groups[day.id] = {};
            periods.forEach(p => {
                groups[day.id][p.id] = baseSchedules.filter(s => {
                    const matchesDayAndPeriod = s.day_of_week === day.id && s.period === p.id;
                    if (!matchesDayAndPeriod) return false;

                    if (!query) return true;

                    const doc = doctors.find(d => d.id === s.doctor_id);
                    const docName = (doc?.name || '');
                    const specName = (specialties.find(sp => sp.id === doc?.especialidade_id)?.name || '');
                    const rooms = (s.rooms || []).join(', ');
                    const observation = (s.observation || '');

                    return includesNormalized(docName, query) ||
                        includesNormalized(specName, query) ||
                        includesNormalized(rooms, query) ||
                        includesNormalized(observation, query);
                });
            });
        });
        return groups;
    }, [baseSchedules, globalSearchQuery, doctors, specialties]);

    return (
        <div className="max-w-screen-2xl mx-auto px-4 py-8 pb-32">
            {/* Header */}
            <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
                            <LayoutGrid size={28} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Escala Médica</h1>
                            <p className="text-slate-500 text-sm font-medium italic uppercase tracking-widest text-[10px]">Visão consolidada de salas e horários</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 max-w-full lg:max-w-2xl mx-0 lg:mx-6 mt-4 lg:mt-0 order-last lg:order-none w-full">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Busca por médico, especialidade ou sala..."
                            value={globalSearchQuery}
                            onChange={(e) => setGlobalSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-6 py-4 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm text-base"
                        />
                    </div>
                </div>

                <div className="flex gap-3 items-center">
                    {/* Custom Filter Dropdown */}
                    <div className="relative z-20">
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`flex items-center gap-3 pl-4 pr-6 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 text-sm shadow-sm transition-all
                                ${isFilterOpen ? 'border-indigo-500 ring-2 ring-indigo-100' : 'hover:border-indigo-300'}
                            `}
                        >
                            <Filter className="text-indigo-500" size={18} />
                            <span>
                                {selectedDayFilter === 'all'
                                    ? 'Todos os Dias'
                                    : daysOfWeek.find(d => d.id === selectedDayFilter)?.label}
                            </span>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown Menu */}
                        {isFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)} />
                                <div className="absolute top-[110%] left-0 min-w-[200px] bg-white rounded-2xl border border-slate-100 shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button
                                        onClick={() => {
                                            setSelectedDayFilter('all');
                                            setIsFilterOpen(false);
                                        }}
                                        className={`w-full px-5 py-3 text-left font-bold text-sm transition-all
                                            ${selectedDayFilter === 'all'
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-slate-700 hover:bg-slate-50'}
                                        `}
                                    >
                                        Todos os Dias
                                    </button>
                                    <div className="h-px bg-slate-100 mx-2" />
                                    {daysOfWeek.map(d => (
                                        <button
                                            key={d.id}
                                            onClick={() => {
                                                setSelectedDayFilter(d.id);
                                                setIsFilterOpen(false);
                                            }}
                                            className={`w-full px-5 py-3 text-left font-bold text-sm transition-all
                                                ${selectedDayFilter === d.id
                                                    ? 'bg-indigo-50 text-indigo-700'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}
                                            `}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Export Dropdown */}
                    <div className="relative z-20">
                        <button
                            onClick={() => setIsExportOpen(!isExportOpen)}
                            className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold transition-all
                                ${isExportOpen ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}
                            `}
                            title="Exportar"
                        >
                            <Download size={20} />
                            <span className="hidden leading-none md:inline">Exportar</span>
                            <ChevronDown size={14} className={`transition-transform ${isExportOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isExportOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsExportOpen(false)} />
                                <div className="absolute top-[110%] right-0 min-w-[180px] bg-white rounded-2xl border border-slate-100 shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button
                                        onClick={() => {
                                            handleExport('csv');
                                            setIsExportOpen(false);
                                        }}
                                        className="w-full px-5 py-3 text-left font-bold text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-3 transition-all"
                                    >
                                        <FileSpreadsheet size={16} />
                                        Excel (CSV)
                                    </button>
                                    <div className="h-px bg-slate-50 mx-2" />
                                    <button
                                        onClick={() => {
                                            handleExport('pdf');
                                            setIsExportOpen(false);
                                        }}
                                        className="w-full px-5 py-3 text-left font-bold text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-3 transition-all"
                                    >
                                        <StickyNote size={16} /> {/* Using StickyNote as a placeholder for PDF/Document icon if FileText isn't available, or reuse an icon */}
                                        Relatório PDF
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setSelectedDoctorId('');
                            setCommonObservation('');
                            setScheduleSlots({
                                1: { ...initialSlot } // Default to Monday
                            });
                            setDocSearchQuery('');
                            setHighlightedIndex(0);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-teal-900/10 text-xs shrink-0"
                    >
                        <Plus size={16} />
                        Configurar Agenda
                    </button>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit mb-8">
                <button
                    onClick={() => setActiveTab('weekly')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all
            ${activeTab === 'weekly' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}
          `}
                >
                    <List size={18} />
                    Escala Base (Planilha)
                </button>
                <button
                    onClick={() => setActiveTab('exceptions')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all
            ${activeTab === 'exceptions' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}
          `}
                >
                    <CalendarIcon size={18} />
                    Calendário de Incidências
                </button>
            </div>

            {activeTab === 'weekly' ? (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-5 duration-500">
                    {daysOfWeek.filter(d => selectedDayFilter === 'all' || d.id === selectedDayFilter).map((day) => (
                        <div key={day.id} className="relative">
                            {/* Day Header */}
                            <div
                                className="sticky top-0 z-10 bg-[#F3F4F6] py-4 flex items-center gap-4 border-b border-slate-100 cursor-pointer group/header"
                                onClick={() => toggleDayCollapse(day.id)}
                            >
                                <div className="w-2 h-8 bg-teal-500 rounded-full transition-all group-hover/header:h-10 group-hover/header:bg-teal-600"></div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
                                    {day.label}
                                    <div className={`p-1 rounded-lg bg-slate-200 text-slate-500 transition-transform duration-300 ${collapsedDays.includes(day.id) ? '-rotate-90' : 'rotate-0'}`}>
                                        <ChevronDown size={20} />
                                    </div>
                                </h2>
                                <div className="h-px flex-1 bg-slate-200"></div>
                            </div>

                            {/* Periods Grid */}
                            {!collapsedDays.includes(day.id) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                    {periods.map((period) => {
                                        const items = groupedBaseSchedules[day.id][period.id] || [];
                                        return (
                                            <div key={period.id} className="flex flex-col gap-4">
                                                <div className="flex items-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl w-fit shadow-sm">
                                                    {period.icon}
                                                    <span className="text-[12px] font-black text-slate-700 uppercase tracking-[0.2em]">{period.label}</span>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mx-2"></div>
                                                    <span className="text-teal-600 text-xs font-black uppercase tracking-widest leading-none">
                                                        {items.length === 1 ? '1 Profissional' : `${items.length} Profissionais`}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-4 min-h-[100px]">
                                                    {items.length === 0 ? (
                                                        <div className="col-span-full border-2 border-dashed border-slate-200 rounded-3xl h-32 flex flex-col items-center justify-center text-slate-400 gap-2 bg-white/30">
                                                            <Clock size={24} className="opacity-20" />
                                                            <span className="text-xs font-medium italic">Nenhum médico escalado para este turno</span>
                                                        </div>
                                                    ) : (
                                                        items.map(s => (
                                                            <div
                                                                key={s.id}
                                                                className={`group relative bg-white border-2 p-6 rounded-3xl shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all
                                ${s.service_type === 'SUS' ? 'border-emerald-100' : 'border-indigo-50'}
                              `}
                                                            >
                                                                {/* Header Card */}
                                                                <div className="flex justify-between items-start mb-6">
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.service_type === 'SUS' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                                                <User size={16} />
                                                                            </div>
                                                                            <h4 className="font-black text-slate-900 text-base leading-tight tracking-tight line-clamp-2 break-words max-w-[140px]">{getDoctorName(s.doctor_id)}</h4>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            {getDoctorSpecialty(s.doctor_id) && (
                                                                                <span className="text-[10px] bg-slate-100 text-slate-800 px-3 py-1 rounded-full font-black uppercase tracking-[0.05em] border border-slate-200">
                                                                                    {getDoctorSpecialty(s.doctor_id)}
                                                                                </span>
                                                                            )}
                                                                            {s.service_type === 'SUS' && (
                                                                                <span className="text-[9px] bg-emerald-500 text-white px-2 py-1 rounded-md font-black uppercase tracking-widest shadow-sm">
                                                                                    SUS
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => {
                                                                                setSelectedDoctorId(s.doctor_id);
                                                                                setCommonObservation(s.observation || '');
                                                                                setScheduleSlots({
                                                                                    [s.day_of_week]: {
                                                                                        period: s.period,
                                                                                        start_time: s.start_time || '',
                                                                                        end_time: s.end_time || '',
                                                                                        rooms: s.rooms || [''],
                                                                                        id: s.id
                                                                                    }
                                                                                });
                                                                                setDocSearchQuery(getDoctorName(s.doctor_id));
                                                                                setHighlightedIndex(0);
                                                                                setIsModalOpen(true);
                                                                            }}
                                                                            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-teal-50 text-slate-400 hover:text-teal-600 rounded-xl transition-all border border-slate-100"
                                                                        >
                                                                            <Pencil size={18} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteSchedule(s.id)}
                                                                            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all border border-slate-100"
                                                                        >
                                                                            <Trash2 size={18} />
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {/* Info Grid */}
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                                        <div className="flex items-center gap-2 flex-1">
                                                                            <DoorOpen size={16} className="text-teal-500" />
                                                                            <div>
                                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Local</p>
                                                                                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Sala {s.rooms?.join(', ') || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="w-px h-8 bg-slate-200" />
                                                                        <div className="flex items-center gap-2 flex-1 pl-4">
                                                                            <Clock size={16} className="text-indigo-500" />
                                                                            <div>
                                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Horário</p>
                                                                                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                                                                    {s.start_time?.substring(0, 5) || '--:--'} às {s.end_time?.substring(0, 5) || '--:--'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {s.observation && (
                                                                        <div className="flex items-start gap-2 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
                                                                            <StickyNote size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                                                            <p className="text-[11px] font-medium text-amber-700 italic leading-relaxed">
                                                                                {s.observation}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
                    <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex items-start gap-4">
                        <ShieldAlert className="text-amber-600 shrink-0 mt-1" size={24} />
                        <div>
                            <h3 className="text-amber-900 font-bold text-lg">Gerenciamento de Exceções</h3>
                            <p className="text-amber-800/80 text-sm mt-1 leading-relaxed">
                                Cadastre aqui dias específicos que fogem à regra da escala semanal.
                                Ex: Feriados (bloqueio de agenda), Férias, ou um dia extra de atendimento.
                            </p>
                        </div>
                    </div>

                    {/* Exceptions List */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-lg">Incidências Registradas</h3>
                            {/* <button className="text-indigo-600 text-sm font-bold hover:underline">+ Nova Exceção</button> */}
                            {/* For now, reusing the modal with a type switch would be ideal, but let's keep it simple first */}
                        </div>

                        {exceptions.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">
                                <CalendarDays size={48} className="mx-auto mb-4 opacity-50" />
                                <p className="font-medium">Nenhuma exceção registrada.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {exceptions.map(ex => (
                                    <div key={ex.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg
                                                ${ex.is_working ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}
                                            `}>
                                                {format(parseISO(ex.specific_date), 'dd')}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-900">{getDoctorName(ex.doctor_id)}</h4>
                                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider -mt-0.5">
                                                    {getDoctorSpecialty(ex.doctor_id)}
                                                </p>
                                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                                    <span>{format(parseISO(ex.specific_date), 'MMM, yyyy', { locale: ptBR })}</span>
                                                    <span>•</span>
                                                    <span className={ex.is_working ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>
                                                        {ex.is_working ? 'Atendimento Extra' : 'Agenda Bloqueada'}
                                                    </span>
                                                </div>
                                                {ex.reason && <p className="text-xs text-slate-400 mt-1 italic">"{ex.reason}"</p>}
                                            </div>
                                        </div>
                                        <button className="text-slate-300 hover:text-rose-600 transition-colors">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsModalOpen(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsModalOpen(false);
                    }}
                    tabIndex={-1}
                /* 
                   Note: For this div to actually catch onKeyDown immediately, it needs focus.
                   However, the useEffect method is more robust for global ESC listening.
                   Let's add a global listener instead in a useEffect.
                */
                >
                    <div className="bg-white w-full max-w-xl max-h-[85vh] flex flex-col rounded-[2.5rem] shadow-2xl scale-in-95 animate-in duration-300 border border-white/20">

                        {/* Header (Fixed) */}
                        <div className="p-8 pb-4 border-b border-slate-100 flex-shrink-0">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-900 text-teal-400 rounded-2xl flex items-center justify-center shadow-xl">
                                        <Stethoscope size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                            {selectedDoctorId ? 'Gerenciar Escala' : 'Novo Registro de Agenda'}
                                        </h3>
                                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Definição de Escala Base</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:rotate-90"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <div className="overflow-y-auto p-8 flex-1 custom-scrollbar">
                            <form id="scale-form" onSubmit={(e) => handleSaveSchedule(e, true)} className="space-y-8">
                                {/* Médico Selector */}
                                <div className="relative">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 ml-1">
                                        <User size={12} /> Médico Responsável
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Busque pelo nome do profissional..."
                                            value={docSearchQuery}
                                            onChange={e => {
                                                setDocSearchQuery(e.target.value);
                                                setShowDocDropdown(true);
                                                setSelectedDoctorId('');
                                            }}
                                            onFocus={() => setShowDocDropdown(true)}
                                            onKeyDown={e => {
                                                if (!showDocDropdown) return;
                                                // Key down logic
                                                if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setHighlightedIndex(prev => (prev + 1) % Math.max(1, filteredDoctorsInModal.length));
                                                } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setHighlightedIndex(prev => (prev - 1 + filteredDoctorsInModal.length) % Math.max(1, filteredDoctorsInModal.length));
                                                } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const selected = filteredDoctorsInModal[highlightedIndex];
                                                    if (selected) {
                                                        setSelectedDoctorId(selected.id);
                                                        setDocSearchQuery(selected.name);
                                                        setShowDocDropdown(false);
                                                    }
                                                } else if (e.key === 'Escape') {
                                                    setShowDocDropdown(false);
                                                }
                                            }}
                                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-teal-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                                            required
                                        />

                                        {showDocDropdown && (
                                            <div className="absolute z-[210] top-[110%] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                                {filteredDoctorsInModal.map((d, index) => (
                                                    <button
                                                        key={d.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedDoctorId(d.id);
                                                            setDocSearchQuery(d.name);
                                                            setShowDocDropdown(false);
                                                        }}
                                                        className={`w-full px-6 py-4 flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors text-left
                                                            ${highlightedIndex === index ? 'bg-teal-50 text-teal-700' : 'hover:bg-slate-50'}
                                                        `}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className={`font-bold ${highlightedIndex === index ? 'text-teal-700' : 'text-slate-700'}`}>{d.name}</span>
                                                            <span className={`text-[10px] font-black uppercase tracking-wider ${highlightedIndex === index ? 'text-teal-600/70' : 'text-slate-400'}`}>
                                                                {specialties.find(s => s.id === d.especialidade_id)?.name || 'Sem Especialidade'}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showDocDropdown && <div className="fixed inset-0 z-[205]" onClick={() => setShowDocDropdown(false)} />}
                                    </div>
                                </div>

                                {/* Days Selection (Buttons) */}
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1 block">Dias de Atendimento</label>
                                    <div className="flex flex-wrap gap-2">
                                        {daysOfWeek.map(day => {
                                            const isSelected = !!scheduleSlots[day.id];
                                            return (
                                                <button
                                                    key={day.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setScheduleSlots(prev => {
                                                            if (isSelected) {
                                                                const { [day.id]: _, ...rest } = prev;
                                                                return rest;
                                                            } else {
                                                                return { ...prev, [day.id]: { ...initialSlot } };
                                                            }
                                                        });
                                                    }}
                                                    className={`w-12 h-12 rounded-full font-black text-xs transition-all flex items-center justify-center
                                                        ${isSelected
                                                            ? 'bg-slate-800 text-white shadow-lg shadow-slate-800/30 scale-110'
                                                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}
                                                    `}
                                                    title={day.label}
                                                >
                                                    {day.label.substring(0, 3)}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Dynamic Config Blocks */}
                                <div className="space-y-6">
                                    {Object.entries(scheduleSlots).map(([dayIdStr, config]) => {
                                        const dayId = parseInt(dayIdStr);
                                        const dayLabel = daysOfWeek.find(d => d.id === dayId)?.label;

                                        return (
                                            <div key={dayId} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 animate-in slide-in-from-left-4 duration-300">
                                                <h4 className="font-extrabold text-slate-700 mb-4 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-teal-500" />
                                                    {dayLabel}
                                                </h4>

                                                <div className="space-y-4">
                                                    {/* Period Buttons */}
                                                    <div>
                                                        <div className="flex p-1 bg-white rounded-xl border border-slate-200 w-fit">
                                                            {periods.map(p => (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() => setScheduleSlots(prev => ({
                                                                        ...prev,
                                                                        [dayId]: { ...prev[dayId], period: p.id as any }
                                                                    }))}
                                                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all
                                                                        ${config.period === p.id
                                                                            ? 'bg-teal-500 text-white shadow-md'
                                                                            : 'text-slate-400 hover:text-slate-600'}
                                                                    `}
                                                                >
                                                                    {p.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Times */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 block">Entrada</label>
                                                            <input
                                                                type="time"
                                                                value={config.start_time}
                                                                onChange={e => setScheduleSlots(prev => ({
                                                                    ...prev,
                                                                    [dayId]: { ...prev[dayId], start_time: e.target.value }
                                                                }))}
                                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:border-teal-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 block">Saída</label>
                                                            <input
                                                                type="time"
                                                                value={config.end_time}
                                                                onChange={e => setScheduleSlots(prev => ({
                                                                    ...prev,
                                                                    [dayId]: { ...prev[dayId], end_time: e.target.value }
                                                                }))}
                                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:border-teal-500"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Rooms */}
                                                    <div>
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex justify-between">
                                                            Salas
                                                            <button
                                                                type="button"
                                                                onClick={() => setScheduleSlots(prev => ({
                                                                    ...prev,
                                                                    [dayId]: { ...prev[dayId], rooms: [...prev[dayId].rooms, ''] }
                                                                }))}
                                                                className="text-teal-600 hover:text-teal-700 text-[9px] flex items-center gap-1"
                                                            >
                                                                <Plus size={10} /> ADD
                                                            </button>
                                                        </label>
                                                        <div className="flex flex-wrap gap-2">
                                                            {config.rooms.map((room, idx) => (
                                                                <div key={idx} className="relative">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Sala"
                                                                        value={room}
                                                                        onChange={e => {
                                                                            const newRooms = [...config.rooms];
                                                                            newRooms[idx] = e.target.value;
                                                                            setScheduleSlots(prev => ({
                                                                                ...prev,
                                                                                [dayId]: { ...prev[dayId], rooms: newRooms }
                                                                            }));
                                                                        }}
                                                                        className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-center text-sm outline-none focus:border-teal-500"
                                                                    />
                                                                    {config.rooms.length > 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setScheduleSlots(prev => ({
                                                                                ...prev,
                                                                                [dayId]: { ...prev[dayId], rooms: prev[dayId].rooms.filter((_, i) => i !== idx) }
                                                                            }))}
                                                                            className="absolute -top-1 -right-1 bg-white rounded-full text-rose-500 shadow-sm border border-slate-100 p-0.5 hover:bg-rose-50"
                                                                        >
                                                                            <X size={10} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {Object.keys(scheduleSlots).length === 0 && (
                                        <div className="text-center py-8 text-slate-300 text-sm italic border-2 border-dashed border-slate-100 rounded-3xl">
                                            Selecione os dias acima para configurar
                                        </div>
                                    )}
                                </div>

                                {/* Common Observation - Full Width */}
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1 block">Observação Geral / Tipo de Agenda</label>
                                    <textarea
                                        value={commonObservation}
                                        onChange={e => setCommonObservation(e.target.value)}
                                        placeholder="Ex: Agenda DPOC, Procedimentos, Reservado..."
                                        className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-teal-500 transition-all min-h-[80px] resize-none"
                                    />
                                </div>
                            </form>
                        </div>

                        {/* Footer (Fixed) */}
                        <div className="p-8 pt-4 border-t border-slate-100 flex-shrink-0 bg-white z-10">
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-8 py-5 rounded-[1.5rem] font-bold text-slate-500 hover:bg-slate-50 transition-all border-2 border-slate-100"
                                >
                                    Descartar
                                </button>
                                <button
                                    type="submit"
                                    form="scale-form"
                                    disabled={saving}
                                    className="flex-[2] bg-teal-600 hover:bg-teal-700 text-white px-10 py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-widest transition-all shadow-2xl shadow-teal-900/20 flex items-center justify-center gap-3 active:scale-95"
                                >
                                    {saving ? (
                                        <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <Save size={20} />
                                            Salvar
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScaleManagement;
