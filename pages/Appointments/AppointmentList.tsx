import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { format, parseISO } from 'date-fns';
import { Plus, Calendar, Clock, User, Stethoscope, Trash2, Pencil, Filter, X, SquareCheck, Square, CircleAlert, Info, Search, Star, Activity, Check, ChevronDown, ChevronUp, XCircle, AlertCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import ModernMonthPicker from '../../components/ui/ModernMonthPicker';
import ModernSelect from '../../components/ui/ModernSelect';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Appointment } from '../../types';
import AppointmentModal from '../../components/Modals/AppointmentModal';
import { copyToClipboard } from '../../utils/clipboard';
import { openWhatsApp, processWhatsAppTemplate } from '../../utils/whatsapp';
import { Copy, MessageCircle } from 'lucide-react';

import { normalizeString, includesNormalized } from '../../utils/string';

const AppointmentList: React.FC = () => {
    const { addToast } = useToast();
    const { isAdmin, profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation() as any;
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [specialties, setSpecialties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'official' | 'sus'>('pending');
    const [sortOrder, setSortOrder] = useState<'oldest' | 'newest' | 'az' | 'za'>('newest');
    const [currentPage, setCurrentPage] = useState(1);
    const [globalCounts, setGlobalCounts] = useState({ pending: 0, official: 0, sus: 0 }); // Global counts
    const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
    const ITEMS_PER_PAGE = 15;

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'info' | 'warning';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'danger'
    });

    // Filters state (Lazy Init from URL to ensure immediate application)
    const [filters, setFilters] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return {
            month: '',
            doctor: params.get('doctor_id') || '',
            specialty: '',
            search: '',
            type: '',
            onlyUrgent: false
        };
    });

    const [specialtySearch, setSpecialtySearch] = useState('');
    const [doctorSearch, setDoctorSearch] = useState('');
    const [isSpecDropdownOpen, setIsSpecDropdownOpen] = useState(false);
    const [isDocDropdownOpen, setIsDocDropdownOpen] = useState(false);
    const [activeSpecIndex, setActiveSpecIndex] = useState(-1);
    const [activeDocIndex, setActiveDocIndex] = useState(-1);

    // Filtragem para Dropbox (Dropdowns)
    const filteredSpecialtiesList = useMemo(() => {
        return specialties.filter(s =>
            includesNormalized(s.name, specialtySearch)
        );
    }, [specialties, specialtySearch]);

    const filteredDoctorsList = useMemo(() => {
        return doctors.filter(d =>
            includesNormalized(d.name, doctorSearch)
        );
    }, [doctors, doctorSearch]);

    const [searchTerm, setSearchTerm] = useState('');
    const [isPending, startTransition] = React.useTransition();

    const specRef = useRef<HTMLDivElement>(null);
    const docRef = useRef<HTMLDivElement>(null);

    // Scroll active item into view
    useEffect(() => {
        if (isSpecDropdownOpen && activeSpecIndex !== -1) {
            const el = document.getElementById(`spec-option-${activeSpecIndex}`);
            el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeSpecIndex, isSpecDropdownOpen]);

    useEffect(() => {
        if (isDocDropdownOpen && activeDocIndex !== -1) {
            const el = document.getElementById(`doc-option-${activeDocIndex}`);
            el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeDocIndex, isDocDropdownOpen]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (specRef.current && !specRef.current.contains(event.target as Node)) {
                setIsSpecDropdownOpen(false);
                // Revert to selected or clear
                if (!filters.specialty) {
                    setSpecialtySearch('');
                } else {
                    const sel = specialties.find(s => s.id === filters.specialty);
                    if (sel) setSpecialtySearch(sel.name);
                }
            }
            if (docRef.current && !docRef.current.contains(event.target as Node)) {
                setIsDocDropdownOpen(false);
                // Revert to selected or clear
                if (!filters.doctor) {
                    setDoctorSearch('');
                } else {
                    const sel = doctors.find(d => d.id === filters.doctor);
                    if (sel) setDoctorSearch(sel.name);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [filters.specialty, filters.doctor, specialties, doctors]);



    // seen ids for notification badges
    const [seenIds, setSeenIds] = useState<{ pending: string[], official: string[] }>(() => {
        const saved = localStorage.getItem('clinicafacil_seen_ids');
        return saved ? JSON.parse(saved) : { pending: [], official: [] };
    });

    // Mark as seen effect
    useEffect(() => {
        if (appointments.length === 0) return;

        const currentTabIds = appointments
            .filter(a => {
                if (activeTab === 'official') return a.status === 'official';
                if (activeTab === 'sus') return a.status === 'waiting_sus';
                return a.status !== 'official' && a.status !== 'waiting_sus';
            })
            .map(a => a.id);

        if (currentTabIds.length > 0) {
            const key = activeTab === 'pending' ? 'pending' : 'official';
            const allAptIds = appointments.map(a => a.id);

            setSeenIds(prev => {
                // Check if we actually have new seen IDs
                const alreadySeen = currentTabIds.every(id => prev[key].includes(id));
                if (alreadySeen) return prev;

                const updated = {
                    pending: Array.from(new Set([...prev.pending, ...(activeTab === 'pending' ? currentTabIds : [])])),
                    official: Array.from(new Set([...prev.official, ...(activeTab === 'official' ? currentTabIds : [])]))
                };

                // Cleanup: remove IDs that no longer exist in the system
                updated.pending = updated.pending.filter(id => allAptIds.includes(id));
                updated.official = updated.official.filter(id => allAptIds.includes(id));

                localStorage.setItem('clinicafacil_seen_ids', JSON.stringify(updated));
                return updated;
            });
        }
    }, [activeTab, appointments]);

    // Reset pagination and fetch when tab or filters change
    useEffect(() => {
        setCurrentPage(1);
        const timeoutId = setTimeout(() => {
            fetchData();
        }, 400);
        return () => clearTimeout(timeoutId);
    }, [activeTab, filters.search, filters.month, filters.doctor, filters.specialty, filters.type, filters.onlyUrgent, sortOrder]); // Added sortOrder here

    // Debug Effect and Strict Sync
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const doctorId = params.get('doctor_id');

        // If URL has doctor_id but state is empty, force sync
        if (doctorId && filters.doctor !== doctorId) {
            setFilters(prev => ({ ...prev, doctor: doctorId }));
            // Temporary debug toast
            // addToast(`Filtro aplicado para ID: ${doctorId}`, 'info');
        }
    }, [location.search, filters.doctor]);

    // Handle filters from location state (Legacy/Actions)
    useEffect(() => {
        let hasChanges = false;

        if (location.state?.searchTerm) {
            const term = location.state.searchTerm;
            setSearchTerm(term);
            startTransition(() => {
                setFilters(prev => ({ ...prev, search: term }));
            });
            hasChanges = true;
        }

        if (location.state?.targetTab) {
            setActiveTab(location.state.targetTab);
            hasChanges = true;
        }

        // Clear location state ONLY if there was something to clear, to avoid infinite loops
        if (hasChanges) {
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
    }, [location.state, navigate, location.pathname, location.search]);

    // Sincronizar campos de busca quando os filtros mudam via navegação
    useEffect(() => {
        if (filters.doctor && filters.doctor !== 'unassigned' && doctors.length > 0) {
            const doc = doctors.find(d => d.id === filters.doctor);
            if (doc) setDoctorSearch(doc.name);
        } else if (filters.doctor === 'unassigned') {
            setDoctorSearch('Sem Médico Definido');
        } else if (!filters.doctor) {
            setDoctorSearch('');
        }

        if (filters.specialty && specialties.length > 0) {
            const spec = specialties.find(s => s.id === filters.specialty);
            if (spec) setSpecialtySearch(spec.name);
        } else if (!filters.specialty) {
            setSpecialtySearch('');
        }
    }, [filters.doctor, filters.specialty, doctors, specialties]);

    // 4. Fetch data stable
    const fetchData = React.useCallback(async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('appointments')
                .select(`
                    id, date, type, status, patient_id, doctor_id, specialty_id, notes, created_at, treatment_plan_id,
                    is_internal_referral, is_sus,
                    patients (id, name, phone, cpf, birth_date, condition, is_sus),
                    doctors (id, name, specialty_id, spec:specialties (name)),
                    specialty:specialties!specialty_id (name),
                    creator:profiles!created_by (full_name, email),
                    treatment_plans (id, is_sus)
                `);

            // Apply Server-side filters
            if (activeTab === 'official') {
                query = query.eq('status', 'official');
            } else if (activeTab === 'sus') {
                query = query.eq('status', 'waiting_sus');
            } else {
                // Modified: Exclude appointments that are part of a treatment plan (Session Management)
                // These are already managed in the Agenda and should not appear as 'Pending' requests here.
                query = query.neq('status', 'official').neq('status', 'waiting_sus').is('treatment_plan_id', null);
            }

            if (filters.month) {
                const startDate = `${filters.month}-01`;
                const endDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)).toISOString().split('T')[0];
                query = query.gte('date', startDate).lt('date', endDate);
            }

            if (filters.doctor) {
                if (filters.doctor === 'unassigned') {
                    query = query.is('doctor_id', null);
                } else {
                    query = query.eq('doctor_id', filters.doctor);
                }
            }
            if (filters.specialty) query = query.eq('specialty_id', filters.specialty);
            if (filters.type) query = query.eq('type', filters.type);
            if (filters.onlyUrgent) query = query.eq('status', 'urgent');

            if (filters.search) {
                const search = filters.search.trim();
                query = query.ilike('patients.name', `%${search}%`);
            }

            // Ordering - Always use assignment date for consistency as requested
            query = query.order('date', { ascending: sortOrder === 'oldest' });

            const [aptRes, docRes, specRes, pendingCountRes, officialCountRes, susCountRes] = await Promise.all([
                query.limit(1000), // Increased limit
                supabase.from('doctors').select('id, name').order('name'),
                supabase.from('specialties').select('id, name').order('name'),
                supabase.from('appointments').select('*', { count: 'exact', head: true }).neq('status', 'official').neq('status', 'waiting_sus').is('treatment_plan_id', null),
                supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'official'),
                supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'waiting_sus')
            ]);

            if (aptRes.error) throw aptRes.error;
            setAppointments((aptRes.data as any) || []);
            setGlobalCounts({
                pending: pendingCountRes.count || 0,
                official: officialCountRes.count || 0,
                sus: susCountRes.count || 0
            });
            if (docRes.data) setDoctors(docRes.data);
            if (specRes.data) setSpecialties(specRes.data);

            // Fetch system settings for WhatsApp templates
            const { data: settingsData } = await supabase.from('system_settings').select('key, value');
            if (settingsData) {
                const settingsMap = settingsData.reduce((acc: any, s: any) => ({ ...acc, [s.key]: s.value }), {});
                setSystemSettings(settingsMap);
            }
        } catch (error: any) {
            console.error('Error fetching data:', error);
            const msg = error.message || '';
            if (msg.includes('JWT') || msg.includes('jwt')) {
                addToast('Sessão expirada. Redirecionando...', 'error');
                await supabase.auth.signOut();
                window.location.reload();
            } else {
                addToast(`Erro ao carregar agendamentos: ${msg}`, 'error');
            }
        } finally {
            setLoading(false);
        }
    }, [addToast, activeTab, filters, sortOrder]); // Added dependencies to useCallback

    // 5. Filter Logic (Memoized)
    const filteredAppointments = useMemo(() => {
        // Most filtering is now server-side, but we keep client-side search for doctors/specialties 
        // if needed or as a fallback. For simplicity, we trust server-side results here.
        return appointments.filter(apt => {
            // 1. Client-side status filter (Top priority for immediate UI sync)
            if (activeTab === 'official') {
                if (apt.status !== 'official') return false;
            } else if (activeTab === 'sus') {
                if (apt.status !== 'waiting_sus') return false;
            } else {
                if (apt.status === 'official' || apt.status === 'waiting_sus') return false;
            }

            // 2. Search filter
            if (filters.search) {
                const search = filters.search;
                const patientName = apt.patients?.name || '';
                const doctorName = apt.doctors?.name || '';
                const specialtyName = apt.specialty?.name || apt.doctors?.spec?.name || '';

                if (!includesNormalized(patientName, search) &&
                    !includesNormalized(doctorName, search) &&
                    !includesNormalized(specialtyName, search)) return false;
            }

            return true;
        }).sort((a, b) => {
            // Priority 1: Internal Referral (Top precedence)
            if (a.is_internal_referral && !b.is_internal_referral) return -1;
            if (!a.is_internal_referral && b.is_internal_referral) return 1;

            // Priority 2: Urgency (Second precedence)
            if (activeTab !== 'official') {
                if (a.status === 'urgent' && b.status !== 'urgent') return -1;
                if (a.status !== 'urgent' && b.status === 'urgent') return 1;
            }

            // Priority 3: Consistency: always sort by appointment date
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();

            switch (sortOrder) {
                case 'newest': return dateB - dateA;
                case 'oldest': return dateA - dateB;
                case 'az': return (a.patients?.name || '').localeCompare(b.patients?.name || '');
                case 'za': return (b.patients?.name || '').localeCompare(a.patients?.name || '');
                default: return dateB - dateA;
            }
        });
    }, [appointments, filters.search, activeTab, sortOrder]);

    const paginatedAppointments = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAppointments.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredAppointments, currentPage]);

    const totalPages = Math.ceil(filteredAppointments.length / ITEMS_PER_PAGE);

    // 6. Callbacks
    const handleFilterChange = React.useCallback((key: keyof typeof filters, value: string) => {
        startTransition(() => {
            setFilters(prev => ({ ...prev, [key]: value }));
        });
    }, []);

    const clearFilters = React.useCallback(() => {
        setSearchTerm('');
        setSpecialtySearch('');
        setDoctorSearch('');
        startTransition(() => {
            setFilters({ month: '', doctor: '', specialty: '', search: '', type: '', onlyUrgent: false });
        });
    }, []);

    const toggleSelect = React.useCallback((id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    }, []);

    const toggleSelectAll = React.useCallback(() => {
        if (selectedIds.length === filteredAppointments.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredAppointments.map(a => a.id));
        }
    }, [selectedIds.length, filteredAppointments]);

    const handleEdit = React.useCallback((apt: Appointment) => {
        navigate('/agendamentos/novo', { state: { appointment: apt } });
    }, [navigate]);

    const handleMarkOfficial = React.useCallback(async (id: string, currentStatus: string) => {
        const apt = appointments.find(a => a.id === id);
        const isSus = apt?.is_sus || apt?.patients?.is_sus;
        const newStatus = currentStatus === 'official' ? (isSus ? 'waiting_sus' : 'scheduled') : 'official';
        try {
            const { error } = await supabase.from('appointments').update({
                status: newStatus
            }).eq('id', id);
            if (error) throw error;

            // Immediately remove from current tab's view to prevent "stuck" items
            setAppointments(prev => prev.filter(apt => apt.id !== id));

            // Update global counts locally for immediate feedback
            setGlobalCounts(prev => {
                const newCounts = { ...prev };
                if (newStatus === 'official') {
                    if (activeTab === 'sus') newCounts.sus = Math.max(0, prev.sus - 1);
                    else newCounts.pending = Math.max(0, prev.pending - 1);
                    newCounts.official += 1;
                } else {
                    newCounts.official = Math.max(0, prev.official - 1);
                    // Check if it should go back to SUS or Pending
                    const apt = appointments.find(a => a.id === id);
                    if (apt?.is_sus || apt?.patients?.is_sus) newCounts.sus += 1;
                    else newCounts.pending += 1;
                }
                return newCounts;
            });

            // Add notification when returning to pending
            if (newStatus === 'scheduled') {
                const apt = appointments.find(a => a.id === id);
                if (apt) {
                    await supabase.from('notifications').insert([{
                        content: `O paciente ${apt.patients.name} voltou para a lista de pendentes.`,
                        type: 'scheduled',
                        is_read: false
                    }]);
                }
            }

            addToast(newStatus === 'official' ? 'Agendamento confirmado!' : 'Movido de volta para pendentes.', 'success');
        } catch (err: any) {
            addToast('Erro ao atualizar status.', 'error');
        }
    }, [addToast]);

    const executeDelete = React.useCallback(async (id: string) => {
        try {
            const { error } = await supabase.from('appointments').delete().eq('id', id);
            if (error) throw error;
            setAppointments(prev => prev.filter(apt => apt.id !== id));
            setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
            addToast('Agendamento excluído!', 'success');
        } catch (err: any) {
            addToast('Erro ao excluir.', 'error');
        }
    }, [addToast]);

    const handleDelete = React.useCallback((id: string) => {
        if (!isAdmin) {
            addToast('Apenas administradores podem excluir registros.', 'error');
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: 'Excluir Agendamento',
            message: 'Tem certeza que deseja excluir este agendamento permanentemente?',
            type: 'danger',
            onConfirm: () => executeDelete(id)
        });
    }, [executeDelete, isAdmin, addToast]);

    const executeBulkDelete = React.useCallback(async () => {
        setLoading(true);
        try {
            const { error } = await supabase.from('appointments').delete().in('id', selectedIds);
            if (error) throw error;
            setAppointments(prev => prev.filter(apt => !selectedIds.includes(apt.id)));
            addToast(`${selectedIds.length} agendamentos excluídos!`, 'success');
            setSelectedIds([]);
        } catch (err) {
            addToast('Erro ao excluir em massa.', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedIds, addToast]);

    const handleBulkDelete = React.useCallback(() => {
        if (!isAdmin) return;
        if (selectedIds.length === 0) return;
        setConfirmModal({
            isOpen: true,
            title: 'Excluir Agendamentos',
            message: `Você tem certeza que deseja excluir ${selectedIds.length} agendamentos? Esta ação é irreversível.`,
            type: 'danger',
            onConfirm: executeBulkDelete
        });
    }, [selectedIds.length, executeBulkDelete, isAdmin]);

    // Data Export
    const exportToExcel = () => {
        const data = filteredAppointments.map(apt => ({
            Data: format(parseISO(apt.date), 'dd/MM/yyyy'),
            Paciente: apt.patients?.name || 'Desconhecido',
            Telefone: apt.patients?.phone || 'Não informado',
            Medico: apt.doctors?.name || 'Geral',
            Especialidade: apt.specialty?.name || apt.doctors?.spec?.name || 'Geral',
            Tipo: apt.type,
            Status: apt.status === 'official' ? 'Oficial' : (apt.status === 'urgent' ? 'Urgente' : 'Pendente'),
            Notas: apt.notes || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");
        XLSX.writeFile(wb, `ClinicaFacil_Agendamentos_${activeTab}.xlsx`);
        addToast('Arquivo Excel gerado com sucesso!', 'success');
    };

    const exportToPDF = () => {
        if (filteredAppointments.length === 0) {
            addToast('Não há dados para exportar.', 'warning');
            return;
        }

        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width || 210;

            // Unified Header: Logo (Left) + Title (Right, Green)
            const logoUrl = '/logo_uam.png';
            const logoWidth = 45;
            const logoHeight = 14;
            doc.addImage(logoUrl, 'PNG', 14, 10, logoWidth, logoHeight);

            doc.setFontSize(14);
            doc.setTextColor(15, 118, 110); // Emerald-700
            doc.setFont('helvetica', 'bold');
            doc.text('RELATÓRIO DE AGENDAMENTOS', pageWidth - 14, 20, { align: 'right' });

            const statusLabel = activeTab === 'pending' ? 'PENDENTES' : 'AGENDADOS';
            const infoText = `STATUS: ${statusLabel}  |  GERADO EM: ${new Date().toLocaleString('pt-BR')}`;
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(infoText, pageWidth - 14, 26, { align: 'right' });

            const tableColumn = ["Data", "Paciente", "Médico", "Especialidade", "Tipo", "Pagamento"];
            const tableRows = filteredAppointments.map(apt => [
                format(parseISO(apt.date), 'dd/MM/yyyy'),
                apt.patients?.name || 'Desconhecido',
                apt.doctors?.name || 'Geral',
                apt.specialty?.name || apt.doctors?.spec?.name || 'Geral',
                apt.type,
                apt.is_paid ? 'Sim' : 'Não'
            ]);

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 34,
                theme: 'grid',
                headStyles: {
                    fillColor: [30, 41, 49],
                    textColor: [255, 255, 255],
                    fontSize: 10,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
            });

            // Open in new tab for printing instead of downloading
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            addToast('PDF gerado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            addToast('Erro ao gerar o arquivo PDF.', 'error');
        }
    };

    // 7. Effects
    useEffect(() => {
        fetchData();

        const channel = supabase
            .channel('appointments-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, fetchData)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleFilterChange('search', searchTerm);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchTerm, handleFilterChange]);

    const activeFiltersCount = [filters.doctor, filters.specialty, filters.search, filters.type, filters.onlyUrgent].filter(Boolean).length;


    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [selectedAppointment, setSelectedAppointment] = useState<any>(undefined);
    const [initialType, setInitialType] = useState<any>(undefined);
    const [returnTo, setReturnTo] = useState<string | undefined>(undefined);

    // Handle Open Modal from Navigation State
    useEffect(() => {
        if (location.state?.action === 'new') {
            setModalMode('create');
            setReturnTo(location.state.returnTo);

            // Construct prefilled data
            const prefilledData: any = {};
            if (location.state.prefilledDoctor || location.state.selectedDoctorId) {
                prefilledData.doctor_id = location.state.prefilledDoctor || location.state.selectedDoctorId;
                if (location.state.prefilledDoctorName) {
                    prefilledData.doctors = { name: location.state.prefilledDoctorName }; // Mock join for display
                }
            }
            if (location.state.prefilledSpecialty) {
                // If needed, though doctor selection usually sets specialty
            }
            if (location.state.preSelectedDate) {
                prefilledData.date = location.state.preSelectedDate;
            }

            setSelectedAppointment(Object.keys(prefilledData).length > 0 ? prefilledData : undefined);

            // Handle Type
            if (location.state.targetTab) {
                const typeMap: Record<string, string> = {
                    'retorno': 'Retorno',
                    'primeira': 'Primeira Consulta',
                    'sessao': 'Sessão'
                };
                setInitialType(typeMap[location.state.targetTab] || undefined);
            } else {
                setInitialType(undefined);
            }

            setIsModalOpen(true);
            // Clear state
            navigate(location.pathname, { replace: true, state: {} });
        }
        if (location.state?.appointment) {
            setModalMode('edit');
            setSelectedAppointment(location.state.appointment);
            setInitialType(undefined);
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, location.pathname]);

    const handleOpenNew = () => {
        setModalMode('create');
        setSelectedAppointment(undefined);
        setInitialType(undefined);
        setIsModalOpen(true);
    };

    return (
        <div className="w-full pb-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex-1">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Banco de Dados de Agendamentos</h1>
                    <p className="text-slate-500 text-sm font-medium">Controle de solicitações e conversão para agendados</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'pending' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Pendentes
                        {globalCounts.pending > 0 && (
                            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {globalCounts.pending}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('sus')}
                        className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'sus' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Fila SUS
                        {globalCounts.sus > 0 && (
                            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {globalCounts.sus}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('official')}
                        className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'official' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Agendados
                        {globalCounts.official > 0 && (
                            <span className={`bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ${appointments.some(a => a.status === 'official' && !seenIds.official.includes(a.id)) ? 'animate-pulse' : ''}`}>
                                {globalCounts.official}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Export Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportToExcel}
                        className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2 shadow-sm"
                    >
                        Excel
                    </button>
                    <button
                        onClick={exportToPDF}
                        className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2 shadow-sm"
                    >
                        PDF
                    </button>

                    <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block" />

                    <button
                        onClick={() => setFilters(prev => ({ ...prev, onlyUrgent: !prev.onlyUrgent }))}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm border ${filters.onlyUrgent
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-rose-400 hover:text-rose-600'
                            }`}
                    >
                        <CircleAlert size={14} />
                        Urgências
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleOpenNew}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-all active:scale-95"
                    >
                        <Plus size={16} />
                        Novo
                    </button>
                    <div className="bg-slate-50 p-1 rounded-xl flex items-center border border-slate-100 hidden md:flex">
                        {[
                            { id: 'oldest', label: 'Data: Antiga' },
                            { id: 'newest', label: 'Data: Recente' },
                            { id: 'az', label: 'Pac: A-Z' },
                            { id: 'za', label: 'Pac: Z-A' }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setSortOrder(opt.id as any)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sortOrder === opt.id
                                    ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-100'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Exibindo {filteredAppointments.length} registros</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-widest leading-none">
                        <Filter size={14} className="text-slate-400" />
                        Refinar Busca
                        {(activeFiltersCount > 0 || filters.month !== '') && (
                            <span className="bg-teal-500 text-white px-1.5 py-0.5 rounded-md text-[10px] animate-in zoom-in">
                                {filters.month ? activeFiltersCount + 1 : activeFiltersCount}
                            </span>
                        )}
                        {isPending && (
                            <div className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                        )}
                    </div>
                    {(activeFiltersCount > 0 || filters.month !== '') && (
                        <button
                            onClick={clearFilters}
                            className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest flex items-center gap-1 transition-colors"
                        >
                            <X size={12} />
                            Limpar Filtros
                        </button>
                    )}
                </div>
                {/* Filter Bar */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* Row 1 */}
                        <div className="md:col-span-6">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                <input
                                    type="text"
                                    placeholder="Buscar por paciente, médico ou especialidade..."
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <ModernMonthPicker
                                value={filters.month}
                                onChange={(val) => handleFilterChange('month', val)}
                            />
                        </div>
                        <div className="md:col-span-3">
                            <ModernSelect
                                value={filters.type || 'all'}
                                options={[
                                    { value: 'all', label: 'Todos os Tipos' },
                                    { value: 'Primeira Consulta', label: 'Primeira Consulta' },
                                    { value: 'Retorno', label: 'Retorno' },
                                    { value: 'Sessão', label: 'Sessão' },
                                ]}
                                onChange={(val) => handleFilterChange('type', val === 'all' ? '' : val)}
                                placeholder="Tipo"
                            />
                        </div>

                        <div className="md:col-span-6" ref={specRef}>
                            <div className="relative">
                                <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar Especialidade..."
                                    className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                                    value={specialtySearch}
                                    onChange={(e) => {
                                        setSpecialtySearch(e.target.value);
                                        setIsSpecDropdownOpen(true);
                                        setActiveSpecIndex(0); // Reset to first item on search
                                    }}
                                    onFocus={() => setIsSpecDropdownOpen(true)}
                                    onKeyDown={(e) => {
                                        if (!isSpecDropdownOpen) return;
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setActiveSpecIndex(prev => (prev < filteredSpecialtiesList.length - 1 ? prev + 1 : prev));
                                        } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setActiveSpecIndex(prev => (prev > -1 ? prev - 1 : prev));
                                        } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (activeSpecIndex >= 0 && activeSpecIndex < filteredSpecialtiesList.length) {
                                                const selected = filteredSpecialtiesList[activeSpecIndex];
                                                handleFilterChange('specialty', selected.id);
                                                setSpecialtySearch(selected.name);
                                                setIsSpecDropdownOpen(false);
                                            } else if (activeSpecIndex === -1) {
                                                // "Todas" selected
                                                handleFilterChange('specialty', '');
                                                setSpecialtySearch('');
                                                setIsSpecDropdownOpen(false);
                                            }
                                        } else if (e.key === 'Escape') {
                                            e.preventDefault();
                                            setIsSpecDropdownOpen(false);
                                            // Revert
                                            if (!filters.specialty) {
                                                setSpecialtySearch('');
                                            } else {
                                                const sel = specialties.find(s => s.id === filters.specialty);
                                                if (sel) setSpecialtySearch(sel.name);
                                            }
                                        } else if (e.key === 'Tab') {
                                            setIsSpecDropdownOpen(false);
                                            // on Tab out, ensure we don't leave mess
                                            if (!filters.specialty) {
                                                setSpecialtySearch('');
                                            } else {
                                                const sel = specialties.find(s => s.id === filters.specialty);
                                                if (sel) setSpecialtySearch(sel.name);
                                            }
                                        }
                                    }}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    {(filters.specialty || specialtySearch) && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleFilterChange('specialty', '');
                                                setSpecialtySearch('');
                                                setIsSpecDropdownOpen(false);
                                            }}
                                            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                    {isSpecDropdownOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                </div>

                                {isSpecDropdownOpen && (
                                    <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-1">
                                            <button
                                                tabIndex={-1}
                                                onClick={() => {
                                                    handleFilterChange('specialty', '');
                                                    setSpecialtySearch('');
                                                    setIsSpecDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition-colors uppercase tracking-widest ${activeSpecIndex === -1 ? 'bg-slate-50 ring-1 ring-slate-200' : ''}`}
                                            >
                                                Todas Especialidades
                                            </button>
                                            {filteredSpecialtiesList.map((spec, index) => (
                                                <button
                                                    key={spec.id}
                                                    tabIndex={-1}
                                                    id={`spec-option-${index}`}
                                                    onClick={() => {
                                                        handleFilterChange('specialty', spec.id);
                                                        setSpecialtySearch(spec.name);
                                                        setIsSpecDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between ${filters.specialty === spec.id ? 'bg-indigo-50 text-indigo-700 font-bold' : (index === activeSpecIndex ? 'bg-slate-100 text-slate-900 font-medium ring-1 ring-slate-200' : 'text-slate-700 hover:bg-slate-50')}`}
                                                >
                                                    {spec.name}
                                                </button>
                                            ))}
                                            {filteredSpecialtiesList.length === 0 && (
                                                <div className="px-4 py-3 text-xs text-slate-400 italic">Nenhuma especialidade encontrada</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="md:col-span-6" ref={docRef}>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar Médico..."
                                    className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                                    value={doctorSearch}
                                    onChange={(e) => {
                                        setDoctorSearch(e.target.value);
                                        setIsDocDropdownOpen(true);
                                        setActiveDocIndex(0);
                                    }}
                                    onFocus={() => setIsDocDropdownOpen(true)}
                                    onKeyDown={(e) => {
                                        if (!isDocDropdownOpen) return;
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setActiveDocIndex(prev => (prev < filteredDoctorsList.length - 1 ? prev + 1 : prev));
                                        } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setActiveDocIndex(prev => (prev > -2 ? prev - 1 : prev));
                                        } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (activeDocIndex >= 0 && activeDocIndex < filteredDoctorsList.length) {
                                                const selected = filteredDoctorsList[activeDocIndex];
                                                handleFilterChange('doctor', selected.id);
                                                setDoctorSearch(selected.name);
                                                setIsDocDropdownOpen(false);
                                            } else if (activeDocIndex === -1) {
                                                handleFilterChange('doctor', '');
                                                setDoctorSearch('');
                                                setIsDocDropdownOpen(false);
                                            } else if (activeDocIndex === -2) {
                                                handleFilterChange('doctor', 'unassigned');
                                                setDoctorSearch('Sem Médico Definido');
                                                setIsDocDropdownOpen(false);
                                            }
                                        } else if (e.key === 'Escape') {
                                            e.preventDefault();
                                            setIsDocDropdownOpen(false);
                                            if (!filters.doctor) setDoctorSearch('');
                                            else {
                                                const sel = doctors.find(d => d.id === filters.doctor);
                                                if (sel) setDoctorSearch(sel.name);
                                            }
                                        } else if (e.key === 'Tab') {
                                            setIsDocDropdownOpen(false);
                                            if (!filters.doctor) setDoctorSearch('');
                                            else {
                                                const sel = doctors.find(d => d.id === filters.doctor);
                                                if (sel) setDoctorSearch(sel.name);
                                            }
                                        }
                                    }}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    {(filters.doctor || doctorSearch) && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleFilterChange('doctor', '');
                                                setDoctorSearch('');
                                                setIsDocDropdownOpen(false);
                                            }}
                                            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                    {isDocDropdownOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                </div>

                                {isDocDropdownOpen && (
                                    <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-1">
                                            <button
                                                tabIndex={-1}
                                                onClick={() => {
                                                    handleFilterChange('doctor', '');
                                                    setDoctorSearch('');
                                                    setIsDocDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition-colors uppercase tracking-widest ${activeDocIndex === -1 ? 'bg-slate-50 ring-1 ring-slate-200' : ''}`}
                                            >
                                                Todos os Médicos
                                            </button>
                                            <button
                                                tabIndex={-1}
                                                onClick={() => {
                                                    handleFilterChange('doctor', 'unassigned');
                                                    setDoctorSearch('Sem Médico Definido');
                                                    setIsDocDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors uppercase tracking-widest ${activeDocIndex === -2 ? 'bg-rose-50 ring-1 ring-rose-200 font-black' : ''}`}
                                            >
                                                Sem Médico Definido (Qualquer Um)
                                            </button>
                                            {filteredDoctorsList.map((doc, index) => (
                                                <button
                                                    key={doc.id}
                                                    tabIndex={-1}
                                                    id={`doc-option-${index}`}
                                                    onClick={() => {
                                                        handleFilterChange('doctor', doc.id);
                                                        setDoctorSearch(doc.name);
                                                        setIsDocDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between ${filters.doctor === doc.id ? 'bg-indigo-50 text-indigo-700 font-bold' : (index === activeDocIndex ? 'bg-slate-100 text-slate-900 font-medium ring-1 ring-slate-200' : 'text-slate-700 hover:bg-slate-50')}`}
                                                >
                                                    {doc.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Row 3: Advanced Date Filters */}
                    </div>
                </div>

                {/* List Header with Select All */}
                {!loading && filteredAppointments.length > 0 && (
                    <div className="flex items-center px-4 py-3 mb-2 bg-slate-50 rounded-xl border border-slate-100">
                        <button
                            onClick={toggleSelectAll}
                            className="flex items-center gap-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hover:text-slate-800 transition-colors"
                        >
                            {selectedIds.length === filteredAppointments.length ? <SquareCheck size={18} className="text-teal-600" /> : <Square size={18} />}
                            Selecionar Todos ({selectedIds.length} / {filteredAppointments.length})
                        </button>
                    </div>
                )}

                {/* List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="text-center py-20">
                            <div className="inline-block w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.3em]">Sincronizando Banco de Dados...</p>
                        </div>
                    ) : filteredAppointments.length === 0 ? (
                        <div className="bg-white rounded-3xl p-20 text-center border border-slate-200 shadow-sm">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-50 text-slate-200 mb-6">
                                <Calendar size={40} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2">Nada por aqui!</h3>
                            <button onClick={clearFilters} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold text-sm">Limpar Filtros</button>
                        </div>
                    ) : (
                        paginatedAppointments.map((apt) => (
                            <AppointmentItem
                                key={apt.id}
                                apt={apt}
                                isSelected={selectedIds.includes(apt.id)}
                                onToggle={toggleSelect}
                                onEdit={(a) => {
                                    setModalMode('edit');
                                    setSelectedAppointment(a);
                                    setIsModalOpen(true);
                                }}
                                onDelete={handleDelete}
                                onMarkOfficial={handleMarkOfficial}
                                addToast={addToast}
                                isAdmin={isAdmin}
                                systemSettings={systemSettings}
                                activeTab={activeTab}
                            />
                        ))
                    )}
                </div>

                {/* Pagination Controls */}
                {!loading && filteredAppointments.length > ITEMS_PER_PAGE && (
                    <div className="mt-8 flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Página {currentPage} de {totalPages}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 disabled:opacity-50">Anterior</button>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white disabled:opacity-50">Próximo</button>
                        </div>
                    </div>
                )}

                {/* Floating Bulk Action Bar */}
                {selectedIds.length > 0 && isAdmin && (
                    <div className="fixed bottom-10 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none">
                        <div className="pointer-events-auto bg-[#0f172a] text-white h-14 px-6 rounded-full shadow-2xl flex items-center gap-6 border border-white/10">
                            <span className="text-[10px] font-black uppercase tracking-widest">{selectedIds.length} Selecionados</span>
                            <div className="w-px h-6 bg-white/10" />
                            <button onClick={() => setSelectedIds([])} className="text-[10px] font-black uppercase text-slate-400 hover:text-white">Descartar</button>
                            <button onClick={handleBulkDelete} className="bg-rose-600 text-white h-10 px-6 rounded-full font-black text-[10px] uppercase hover:bg-rose-500 flex items-center gap-2">
                                <Trash2 size={14} /> Excluir
                            </button>
                        </div>
                    </div>
                )}

                <AppointmentModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setModalMode('create');
                        setSelectedAppointment(null);
                    }}
                    mode={modalMode}
                    appointmentId={selectedAppointment?.id}
                    initialType={initialType || selectedAppointment?.type}
                    initialData={selectedAppointment}
                    onSuccess={(highlightId?: string, highlightDate?: string) => {
                        setIsModalOpen(false);
                        fetchData();
                        if (returnTo && highlightId) {
                            navigate(returnTo, { state: { highlightId, highlightDate } });
                        }
                    }}
                />

                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    onConfirm={confirmModal.onConfirm}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    type={confirmModal.type}
                />
            </div>
        </div>
    );
};


const AppointmentItem = React.memo<{
    apt: Appointment;
    isSelected: boolean;
    onToggle: (id: string) => void;
    onEdit: (apt: Appointment) => void;
    onDelete: (id: string) => void;
    onMarkOfficial: (id: string, currentStatus: string) => void;
    addToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    isAdmin: boolean;
    systemSettings: Record<string, string>;
    activeTab: string;
}>(({ apt, isSelected, onToggle, onEdit, onDelete, onMarkOfficial, addToast, isAdmin, systemSettings, activeTab }) => {
    
    const handleWhatsApp = (e: React.MouseEvent) => {
        e.stopPropagation();
        const phone = apt.patients?.phone;
        if (!phone) return;

        // Only use template for 'pending' or 'sus' tabs (Waitlist/Queue)
        if (activeTab === 'pending' || activeTab === 'sus') {
            const template = systemSettings['whatsapp_template_vaga_disponivel'] || 
                "Olá, falo em nome do {clinica}\n\nPaciente {paciente} deixou o nome na lista de espera para {especialidade}. Tivemos uma desistência com o médico {medico}, no dia {data} às {hora} horas. Tem interesse na consulta?";
            
            const message = processWhatsAppTemplate(template, {
                paciente: apt.patients?.name || '',
                especialidade: apt.specialty?.name || apt.doctors?.spec?.name || '',
                medico: apt.doctors?.name || '',
                data: format(parseISO(apt.date), 'dd/MM/yyyy'),
                hora: format(parseISO(apt.date), 'HH:mm'),
                horas: format(parseISO(apt.date), 'HH:mm'),
                clinica: systemSettings['clinic_name'] || 'CIS - Centro Integrado de Saúde'
            });

            openWhatsApp(phone, message);
        } else {
            // Default blank chat for other tabs
            openWhatsApp(phone);
        }
    };
    return (
        <div
            onClick={() => onToggle(apt.id)}
            className={`group flex flex-col md:flex-row md:items-center justify-between p-4 md:p-5 rounded-2xl border transition-all cursor-pointer ${isSelected
                ? 'border-teal-500 bg-teal-50/20 shadow-lg ring-1 ring-teal-500/20 translate-x-1'
                : apt.status === 'absent_justified' ? 'border-amber-200 bg-amber-50/50 shadow-sm' :
                    apt.status === 'absent' ? 'border-rose-200 bg-rose-50/50 shadow-sm' :
                        'border-slate-100 bg-white shadow-sm hover:shadow-md hover:border-slate-200'
                } ${apt.status === 'urgent' ? 'border-l-4 border-l-rose-500' : ''}`}
        >
            <div className="flex items-start gap-4">
                <div className="mt-3 shrink-0" onClick={e => { e.stopPropagation(); onMarkOfficial(apt.id, apt.status); }} title={apt.status === 'official' ? 'Marcar como Pendente' : 'Marcar como Agendado no Oficial'}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${apt.status === 'official' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-300 border-2 border-slate-200 group-hover:border-teal-400 group-hover:bg-teal-50'}`}>
                        {apt.status === 'official' && <SquareCheck size={16} />}
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-2 group/name">
                            <h3 className="font-black text-slate-900 text-lg leading-tight tracking-tight">{apt.patients?.name || `Paciente sem nome (ID: ${apt.id.slice(0, 8)})`}</h3>
                            <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(apt.patients?.name || '', 'Nome', addToast); }}
                                className="opacity-0 group-hover/name:opacity-100 p-1 hover:bg-slate-100 rounded-md transition-all text-slate-400 hover:text-indigo-600"
                                title="Copiar Nome"
                            >
                                <Copy size={12} />
                            </button>
                        </div>
                        {apt.patients?.condition === 'priority' && (
                            <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border border-amber-200">
                                <Star size={9} fill="currentColor" />
                                Prioridade
                            </span>
                        )}
                        {apt.is_internal_referral && (
                            <span className="flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border border-rose-200 shadow-sm animate-pulse">
                                <Star size={9} fill="currentColor" />
                                Médicos Interno
                            </span>
                        )}
                        {apt.patients?.condition === 'dpoc' && (
                            <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border border-indigo-200">
                                <Activity size={9} />
                                DPOC
                            </span>
                        )}
                        {(apt.treatment_plans?.is_sus || apt.patients?.is_sus) && (
                            <span className="flex items-center gap-1 bg-teal-100 text-teal-700 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border border-teal-200 shadow-sm">
                                SUS
                            </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${apt.type === 'Avaliação' ? 'bg-amber-100 text-amber-700 border-amber-200' : apt.type === 'Primeira Consulta' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                            {apt.type}
                        </span>
                        {apt.status === 'urgent' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest animate-pulse shadow-lg shadow-rose-900/20">
                                <CircleAlert size={10} />
                                Urgente
                            </span>
                        )}
                        {apt.status === 'official' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest border border-indigo-500 shadow-sm">
                                <Check size={10} />
                                Confirmado
                            </span>
                        )}
                        {apt.status === 'absent' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest border border-rose-500 shadow-sm">
                                <XCircle size={10} />
                                Falta
                            </span>
                        )}
                        {apt.status === 'absent_justified' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest border border-amber-600 shadow-sm">
                                <AlertCircle size={10} />
                                Falta Justificada
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
                        {apt.patients?.cpf && (
                            <div className="flex items-center gap-2 group/cpf">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CPF:</span>
                                <span className="text-[11px] font-bold text-slate-600">{apt.patients.cpf}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(apt.patients?.cpf || '', 'CPF', addToast); }}
                                    className="opacity-0 group-hover/cpf:opacity-100 p-1 hover:bg-slate-100 rounded-md transition-all text-slate-400 hover:text-indigo-600"
                                >
                                    <Copy size={12} />
                                </button>
                            </div>
                        )}
                        {apt.patients?.phone && (
                            <div className="flex items-center gap-2 group/phone">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TEL:</span>
                                <span className="text-[11px] font-bold text-slate-600">{apt.patients.phone}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover/phone:opacity-100 transition-all">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); copyToClipboard(apt.patients?.phone || '', 'Telefone', addToast); }}
                                        className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600"
                                        title="Copiar Telefone"
                                    >
                                        <Copy size={12} />
                                    </button>
                                    <button
                                        onClick={handleWhatsApp}
                                        className="p-1 hover:bg-emerald-50 rounded-md text-emerald-500 hover:text-emerald-600"
                                        title="Abrir WhatsApp"
                                    >
                                        <MessageCircle size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-3 text-xs text-slate-600 font-bold">
                            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md text-slate-500">
                                <Stethoscope size={12} />
                                {apt.doctors?.name || 'Profissional Geral'}
                            </div>
                            <span className="text-teal-600 font-black uppercase text-[10px] tracking-widest">{apt.specialty?.name || apt.doctors?.spec?.name}</span>
                        </div>

                        <div className="flex items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            <span className="flex items-center gap-1.5">
                                <User size={12} className="text-slate-300" />
                                Cadastrado por: <span className="text-slate-800">{apt.creator?.full_name?.split(' ')[0] || apt.creator?.email?.split('@')[0] || 'Sistema'}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Clock size={12} className="text-slate-300" />
                                {format(parseISO(apt.created_at), 'dd/MM/yyyy')}
                            </span>
                        </div>
                    </div>

                    {apt.notes && (() => {
                        const hasSeparator = apt.notes.includes('\n\nObservação: ');
                        const parts = apt.notes.split('\n\nObservação: ');
                        
                        let systemNotes = hasSeparator ? parts[0] : '';
                        let userNotes = hasSeparator ? parts[1] : parts[0];

                        // Se não houver separador, verificamos se a nota parece ser apenas do sistema
                        if (!hasSeparator && (
                            apt.notes.startsWith('Consulta base realizada em:') || 
                            apt.notes.startsWith('[Encaminhamento Automático:') ||
                            apt.notes.includes('[SISTEMA]') || 
                            apt.notes.includes('Falta registrada manualmente')
                        )) {
                            systemNotes = apt.notes;
                            userNotes = '';
                        }

                        return (
                            <div className="mt-4 space-y-2">
                                {userNotes && (
                                    <div className="bg-amber-100 border-l-4 border-l-amber-500 p-3 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Info size={14} className="text-amber-600" />
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Observação</span>
                                        </div>
                                        <p className="text-slate-800 text-[13px] font-bold leading-relaxed whitespace-pre-wrap">
                                            {userNotes}
                                        </p>
                                    </div>
                                )}
                                {systemNotes && (() => {
                                    const isSystemAlert = systemNotes.includes('[SISTEMA]') || systemNotes.includes('Falta registrada manualmente');
                                    return (
                                        <div className={`p-3 rounded-xl flex items-start gap-3 leading-relaxed ${
                                            isSystemAlert 
                                            ? 'bg-rose-50/50 border border-rose-100 text-rose-600 font-bold text-[10px]' 
                                            : userNotes ? 'text-[10px] text-slate-400 font-medium' : 'text-[11px] text-slate-500 bg-slate-50 border border-slate-100 italic shadow-inner'
                                        }`}>
                                            {!userNotes && <Info size={isSystemAlert ? 12 : 14} className={isSystemAlert ? 'text-rose-500 shrink-0 mt-0.5' : 'text-teal-500 shrink-0 mt-0.5'} />}
                                            <span className="whitespace-pre-wrap">
                                                {systemNotes
                                                    .replace('[SISTEMA]', '🚩')
                                                    .replace('Consulta base realizada em:', '📅 Base em:')
                                                    .replace('Período de retorno:', '⏳ Retorno:')}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })()}
                </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-10 mt-6 md:mt-0 pt-4 md:pt-0 border-t border-slate-50 md:border-none pl-10 md:pl-0">
                <div className="md:text-right">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                        {apt.type === 'Primeira Consulta' ? 'Inclusão' : 'Previsão'}
                    </div>
                    <div className="text-lg font-black text-slate-900 flex items-center gap-2 md:justify-end">
                        <Calendar size={18} className="text-teal-500" />
                        {format(parseISO(apt.date), 'dd/MM/yyyy')}
                    </div>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onEdit(apt)}
                        className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all active:scale-95"
                        title="Editar"
                    >
                        <Pencil size={20} />
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => onDelete(apt.id)}
                            className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-95"
                            title="Apagar permanentemente"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

export default AppointmentList;
