import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Clock,
    MoreVertical,
    User,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Plus,
    CalendarDays,
    Search,
    Filter,
    X,
    DollarSign,
    FileText,
    Trash2,
    Printer,
    Activity,
    RefreshCw,
    History as HistoryIcon,
    Edit2,
    RotateCcw,
    CreditCard,
    Lock as LockIcon,
    Unlock as UnlockIcon,
    Calendar
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';
import { TreatmentPlan, TherapySession, TherapyPayment, Appointment, Medico } from '../../types';
import { format, parseISO, startOfWeek, addDays, subDays, isSameDay, getDay, startOfMonth, endOfMonth, endOfWeek, isSameMonth, addMonths, subMonths, compareAsc, startOfDay, endOfDay } from 'date-fns';
import { generateSessionControlPDF } from '../../services/pdf_service';
import { ptBR } from 'date-fns/locale';
import FinancialControlModal from '../../components/Modals/FinancialControlModal';
import AppointmentModal from '../../components/Modals/AppointmentModal';
import ModernDatePicker from '../../components/ui/ModernDatePicker';
import PatientUpcomingAppointments from '../../components/PatientUpcomingAppointments';

interface EnhancedPlan extends TreatmentPlan {
    sessions?: TherapySession[];
    payments?: TherapyPayment[];
}
import { generateMonthlyReport, generatePatientMonthlyReport, generateFinancialDetailedReport } from '../../utils/pdfGenerator';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { rebalancePayments } from '../../services/paymentService';
import { normalizeText, includesNormalized } from '../../utils/formatters';

// --- Constants ---
const ALLOWED_TREATMENT_SPECIALTIES = ['Psicologia', 'Fisioterapia', 'Acupuntura'];

// --- CLEANUP TOOL (Refreshed) ---
const cleanupDuplicates = async (appointments: Appointment[], addToast: any) => {
    try {
        const duplicates = new Map<string, Appointment[]>();

        appointments.forEach(apt => {
            if (!apt.treatment_plan_id) return;
            const key = `${apt.treatment_plan_id}-${apt.date}`; // Unique per plan/time
            if (!duplicates.has(key)) duplicates.set(key, []);
            duplicates.get(key)?.push(apt);
        });

        const toDelete: string[] = [];
        const updates: any[] = [];

        duplicates.forEach((group, key) => {
            if (group.length > 1) {
                // Keep the one with most info (e.g. attendance status, allocations)
                // Sort: Attended > Scheduled, Has Allocations > No Allocations, Newer Created > Older
                group.sort((a, b) => {
                    const scoreA = (a.attendance_status ? 2 : 0) + ((a.allocations?.length || 0) > 0 ? 1 : 0);
                    const scoreB = (b.attendance_status ? 2 : 0) + ((b.allocations?.length || 0) > 0 ? 1 : 0);
                    return scoreB - scoreA;
                });

                // Keep group[0], delete rest
                for (let i = 1; i < group.length; i++) {
                    toDelete.push(group[i].id);
                }
            }
        });

        if (toDelete.length > 0) {
            console.log('Deleting duplicates:', toDelete);
            const { error } = await supabase.from('appointments').delete().in('id', toDelete);
            if (error) throw error;
            addToast(`Removidos ${toDelete.length} agendamentos duplicados.`, 'success');
            return true; // Reload needed
        } else {
            addToast('Nenhuma duplicata encontrada.', 'info');
            return false;
        }
    } catch (err) {
        console.error(err);
        addToast('Erro ao limpar duplicatas.', 'error');
        return false;
    }
};

// --- ORPHAN FIX TOOL ---
const fixOrphans = async (appointments: Appointment[], plans: EnhancedPlan[], addToast: any) => {
    try {
        let fixedCount = 0;
        // Check appointments that have a plan ID but that plan is NOT in the active plans list?
        // Or check if there is an active plan for that patient that matches the schedule but has different ID?

        // Strategy: For each appointment, check if its plan is valid/active.
        // If not, try to find an active plan for the SAME patient and SAME specialty.
        // If found, update the appointment to link to the new plan.

        for (const apt of appointments) {
            if (!apt.patient_id) continue;

            // Find valid plan for this appointment
            const currentPlan = plans.find(p => p.id === apt.treatment_plan_id);

            if (!currentPlan) {
                // Orphan! Let's find a foster parent.
                const fosterPlan = plans.find(p =>
                    p.patient_id === apt.patient_id &&
                    p.specialty_id === apt.specialty_id &&
                    p.status === 'active'
                );

                if (fosterPlan) {
                    console.log(`Fixing orphan apt ${apt.id} (old plan ${apt.treatment_plan_id}) -> new plan ${fosterPlan.id}`);
                    await supabase.from('appointments').update({ treatment_plan_id: fosterPlan.id }).eq('id', apt.id);
                    fixedCount++;
                }
            }
        }

        if (fixedCount > 0) {
            addToast(`Vinculados ${fixedCount} agendamentos órfãos a planos ativos.`, 'success');
            return true;
        }
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
}


// --- CLEANUP EXCEEDED SESSIONS ---
const cleanupExceededSessions = async (plans: EnhancedPlan[], appointmentsHistory: Appointment[], addToast: any, singlePlanId?: string) => {
    try {
        const toDelete: string[] = [];
        let plansAffected = 0;
        let deletedCount = 0; // For auto-cancelled plans

        const plansToProcess = singlePlanId ? plans.filter(p => p.id === singlePlanId) : plans;

        for (const plan of plansToProcess) {
            // Get all physical appointments for THIS plan from history (all dates), ignoring Avaliações
            const physicalApts = appointmentsHistory
                .filter(a => a.treatment_plan_id === plan.id && a.attendance_status !== 'cancelled');

            const regularApts = physicalApts
                .filter(a => a.type !== 'Avaliação')
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Auto-cancel orphaned plans (those with 0 physical appointments of any kind)
            // This usually happens if 'Limpar Fantasmas' previously deleted the only Avaliação a plan had.
            if (physicalApts.length === 0 && plan.status === 'active') {
                await supabase.from('treatment_plans').update({ status: 'cancelled' }).eq('id', plan.id);
                deletedCount++;
                continue; // Skip the rest of the logic for this plan
            }

            if (regularApts.length > (plan.total_sessions || 0)) {
                // Identify the extras (the ones scheduled AFTER the allowed total limit)
                const extras = regularApts.slice(plan.total_sessions);
                extras.forEach(a => toDelete.push(a.id));
                plansAffected++;
            }
        }

        let message = 'Limpeza completa: ';
        if (toDelete.length > 0 || deletedCount > 0) {
            if (toDelete.length > 0) {
                console.log('Cleaning exceeded appointments:', toDelete);
                const { error } = await supabase.from('appointments').delete().in('id', toDelete);
                if (error) throw error;
                message += `Removidos ${toDelete.length} agendamentos excedentes. `;
            }
            if (deletedCount > 0) {
                message += `Cancelados ${deletedCount} planos órfãos (sem sessões).`;
            }
            addToast(message.trim(), 'success');
            return true;
        } else {
            addToast('Nenhum agendamento excedente ou plano órfão encontrado.', 'info');
            return false;
        }
    } catch (e: any) {
        console.error(e);
        addToast(`Erro na limpeza global: ${e.message}`, 'error');
        return false;
    }
};


// Fixes "Ghost" duplicates where same patient has multiple apts at same time but different IDs/Plans
const aggressiveCleanup = async (appointments: Appointment[], addToast: any) => {
    try {
        const duplicates = new Map<string, Appointment[]>();
        const toDelete: string[] = [];

        // Group by Patient + Date/Time (ignoring seconds)
        appointments.forEach(apt => {
            if (!apt.patient_id || !apt.date || apt.attendance_status === 'cancelled') return;
            // Key: patient_id + yyyy-mm-ddThh:mm
            const dateKey = apt.date.slice(0, 16); // up to minutes
            const key = `${apt.patient_id}-${dateKey}`;

            if (!duplicates.has(key)) duplicates.set(key, []);
            duplicates.get(key)?.push(apt);
        });

        let found = 0;

        duplicates.forEach((group, key) => {
            if (group.length > 1) {
                // Sort to keep best: Attended > Id is newer?
                // Heuristic: Keep the one with most info OR the one attached to the active plan (hard to know active plan here without calling DB, but we can guess by ID recency)

                group.sort((a, b) => {
                    const scoreA = (a.attendance_status === 'attended' ? 10 : 0) + (a.allocations?.length || 0);
                    const scoreB = (b.attendance_status === 'attended' ? 10 : 0) + (b.allocations?.length || 0);
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    // Tie-break: Keep newer ID (assuming serial/uuid logic, or created_at if avail)
                    return (b.id > a.id) ? 1 : -1;
                });

                // Delete all except first
                for (let i = 1; i < group.length; i++) {
                    toDelete.push(group[i].id);
                }
                found++;
            }
        });

        if (toDelete.length > 0) {
            console.log('Aggressive Cleanup deleting:', toDelete);
            const { error } = await supabase.from('appointments').delete().in('id', toDelete);
            if (error) throw error;
            addToast(`Limpeza agressiva: Removidos ${toDelete.length} conflitos de ${found} horários.`, 'success');
            return true;
        } else {
            addToast('Nenhum conflito direto encontrado.', 'info');
            return false;
        }
    } catch (e) {
        console.error(e);
        addToast('Erro na limpeza.', 'error');
        return false;
    }
};
// -------------------

// --- DUPLICATE PLAN FIXER ---
const mergeDuplicatePlans = async (plans: EnhancedPlan[], addToast: any) => {
    try {
        let fixedCount = 0;
        const updates = [];

        // 1. Group active plans by Patient + Specialty
        const groupedMap = new Map<string, EnhancedPlan[]>();

        plans.filter(p => p.status === 'active').forEach(p => {
            const key = `${p.patient_id}-${p.specialty_id}`;
            if (!groupedMap.has(key)) groupedMap.set(key, []);
            groupedMap.get(key)?.push(p);
        });

        // 2. process groups with > 1 active plan
        for (const [key, group] of groupedMap.entries()) {
            if (group.length > 1) {
                // Sort by creation date (descending) -> Newest first
                group.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

                const masterPlan = group[0];
                const duplicatePlans = group.slice(1);

                console.log(`Found duplicate plans for ${masterPlan.patient?.name}: Master ${masterPlan.id}, Merging ${duplicatePlans.map(d => d.id)}`);

                for (const dupe of duplicatePlans) {
                    // Reassign appointments
                    const { error: aptError } = await supabase
                        .from('appointments')
                        .update({ treatment_plan_id: masterPlan.id })
                        .eq('treatment_plan_id', dupe.id);

                    if (aptError) console.error('Error moving appointments:', aptError);

                    // Reassign sessions
                    const { error: sessError } = await supabase
                        .from('therapy_sessions')
                        .update({ plan_id: masterPlan.id })
                        .eq('plan_id', dupe.id);

                    if (sessError) console.error('Error moving sessions:', sessError);

                    // Reassign payments
                    const { error: payError } = await supabase
                        .from('therapy_payments')
                        .update({ treatment_plan_id: masterPlan.id })
                        .eq('treatment_plan_id', dupe.id);

                    if (payError) console.error('Error moving payments:', payError);

                    // Mark dupe as cancelled/superseded
                    const { error: closeError } = await supabase
                        .from('treatment_plans')
                        .update({ status: 'cancelled', notes: `Archived/Merged into ${masterPlan.id} on ${new Date().toLocaleDateString()}` })
                        .eq('id', dupe.id);

                    if (closeError) console.error('Error closing duplicate plan:', closeError);

                    fixedCount++;
                }
            }
        }

        if (fixedCount > 0) {
            addToast(`Fundidos ${fixedCount} planos duplicados.`, 'success');
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error merging plans:', e);
        addToast('Erro ao fundir planos duplicados.', 'error');
        return false;
    }
};




// --- Constants ---
// --- Constants ---

const dayNamesShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const SessionManagement: React.FC = () => {
    const { addToast } = useToast();
    const { isAdmin, signOut, profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);

    // --- State: Highlight ---
    const [highlightedId, setHighlightedId] = useState<string | null>(null);

    useEffect(() => {
        if (location.state?.highlightId) {
            setHighlightedId(location.state.highlightId);
            const timer = setTimeout(() => setHighlightedId(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [location.state]);

    // --- State: View & Date ---
    const [view, setView] = useState<'calendar' | 'list' | 'weekly'>('weekly');

    // Initialize date from location state if available (for smart navigation)
    const [currentDate, setCurrentDate] = useState(() => {
        // Prioritize date passed via navigation (e.g. after creating an appointment)
        const navDate = location.state?.highlightDate;
        if (navDate) {
            try {
                const parsed = parseISO(navDate);
                if (!isNaN(parsed.getTime())) {
                    return parsed;
                }
            } catch (e) {
                console.error('Error parsing navigation date:', e);
            }
        }
        return new Date();
    });

    // Ensure state updates if location changes while mounted (e.g. navigation back)
    useEffect(() => {
        const navDate = location.state?.highlightDate;
        if (navDate) {
            try {
                const newDate = parseISO(navDate);
                // Avoid redundant updates if it's the same day (ignoring time)
                if (!isNaN(newDate.getTime()) && !isSameDay(newDate, currentDate)) {
                    setCurrentDate(newDate);
                }
            } catch (e) {
                console.error('Invalid highlight date in effect:', e);
            }
        }
    }, [location.state?.highlightDate]); // Depend on the specific property
    // --- State: General ---
    const [plans, setPlans] = useState<EnhancedPlan[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [appointmentsHistory, setAppointmentsHistory] = useState<Appointment[]>([]);
    const [allDoctors, setAllDoctors] = useState<Medico[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchDoctors = async () => {
        try {
            const { data, error } = await supabase
                .from('doctors')
                .select('*, spec:specialties(name)')
                .order('name');
            if (error) throw error;
            setAllDoctors(data as any || []);
        } catch (e) {
            console.error('Error fetching doctors:', e);
        }
    };

    useEffect(() => {
        fetchDoctors();
    }, []);

    const uniqueDoctors = useMemo(() => {
        return allDoctors.filter(doc => {
            const name = doc.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            return name.includes('FILIPE ANTONIO') ||
                name.includes('PATRICIA DE OLIVEIRA') ||
                name.includes('GABRIEL AUGUSTO') ||
                name.includes('GLAUCIA REGINA');
        });
    }, [allDoctors]);

    // --- State: Filters ---
    const [searchTerm, setSearchTerm] = useState('');
    // Specialty filter removed from UI but restriction remains in fetchers
    const filterType = 'all'; 
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>(() => {
        const saved = localStorage.getItem('agenda_doctor_filter');
        const navState = location.state?.selectedDoctorId;
        return navState || saved || 'all';
    });

    // Save to localStorage whenever it changes
    useEffect(() => {
        if (selectedDoctorId) {
            localStorage.setItem('agenda_doctor_filter', selectedDoctorId);
        }
    }, [selectedDoctorId]);

    // Handle navigation state updates
    useEffect(() => {
        if (location.state?.selectedDoctorId !== undefined) {
            const newState = location.state.selectedDoctorId;
            if (newState !== selectedDoctorId) {
                setSelectedDoctorId(newState);
            }
        }
    }, [location.state]);

    // --- State: Modals & Selections ---
    const [selectedSlot, setSelectedSlot] = useState<{ plan: EnhancedPlan; date: Date } | null>(null);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');
    const [hasConflict, setHasConflict] = useState(false);
    const [financialModalOpen, setFinancialModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [sessionPrice, setSessionPrice] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credito' | 'debito' | 'dinheiro' | 'cash' | 'card' | 'other'>('pix');
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; planId: string | null; title?: string; message?: string, action?: 'delete' | 'discharge' | 'reactivate_plan' | 'bulk_exceeded' | 'delete_appointment' | 'cancel_plan_sessions' | 'bulk_cancel', aptId?: string, aptDate?: Date }>({
        isOpen: false,
        planId: null,
        action: 'delete'
    });




    // Update paymentAmount and paymentMethod when selection changes
    useEffect(() => {
        // Reset sub-views when switching patients/slots
        setIsRescheduling(false);
        setRescheduleDate('');

        if (selectedSlot) {
            const apt = appointments.find(a => a.treatment_plan_id === selectedSlot.plan.id && isSameDay(parseISO(a.date), selectedSlot.date));
            const allocated = apt?.allocations?.reduce((sum: number, a: any) => sum + (a.amount || 0), 0) || 0;
            setPaymentAmount(allocated > 0 ? allocated.toString() : '');

            if (apt?.allocations && apt.allocations.length > 0) {
                const method = apt.allocations[0].payment?.payment_method;
                if (method === 'credito') setPaymentMethod('credito');
                else if (method === 'debito') setPaymentMethod('debito');
                else if (method === 'pix') setPaymentMethod('pix');
                else if (method === 'card') setPaymentMethod('credito');
            }

            const isEvaluation = apt?.type === 'Avaliação';
            const planPrice = isEvaluation ? 0 : selectedSlot.plan.price_per_session;
            const defaultPrice = (planPrice !== undefined && planPrice !== null)
                ? planPrice.toString()
                : (profile?.social_price?.toString() || '');
            setSessionPrice(defaultPrice);
        } else {
            setPaymentAmount('');
            setPaymentMethod('pix');
            setSessionPrice('');
        }
    }, [selectedSlot, appointments, profile]);

    // --- State: Edit/History ---
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editModeData, setEditModeData] = useState<any>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [patientHistoryData, setPatientHistoryData] = useState<Appointment[]>([]);
    const [patientHistoryLoading, setPatientHistoryLoading] = useState(false);

    // --- State: Bulk Actions & Blocking ---
    const [selectedApts, setSelectedApts] = useState<string[]>([]);
    const [isBulkRescheduleModalOpen, setIsBulkRescheduleModalOpen] = useState(false);
    const [bulkRescheduleDate, setBulkRescheduleDate] = useState('');
    const [blockedDates, setBlockedDates] = useState<{ id: string, date: string, reason: string, doctor_id?: string | null }[]>([]);
    const [isBlockingModalOpen, setIsBlockingModalOpen] = useState(false);
    const [dateToBlock, setDateToBlock] = useState<Date | null>(null);
    const [blockReason, setBlockReason] = useState('');

    // --- State: List View Collapsed Days ---
    const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    const toggleDayCollapse = (dayKey: string) => {
        setCollapsedDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }));
    };

    const closeModal = useCallback(() => {
        setSelectedSlot(null);
        setPaymentAmount('');
        setIsEditModalOpen(false);
        setEditModeData(null);
        setIsRescheduling(false);
    }, []);

    const closeAllModals = useCallback(() => {
        setConfirmModal({ isOpen: false, planId: null });
        setFinancialModalOpen(false);
        setIsBlockingModalOpen(false);
        setIsHistoryModalOpen(false);
        setIsBulkRescheduleModalOpen(false);
        setBulkRescheduleDate('');
        closeModal();
    }, [closeModal]);

    // --- LIFO ESC Handler ---
    // Closes the top-most modal first
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Priority 1: Confirm Modal (managed by ConfirmModal itself)
                if (confirmModal.isOpen) return;

                // Priority 2: Full-screen Modals
                if (financialModalOpen) { setFinancialModalOpen(false); return; }
                if (isBlockingModalOpen) { setIsBlockingModalOpen(false); return; }
                if (isHistoryModalOpen) { setIsHistoryModalOpen(false); return; }
                if (isBulkRescheduleModalOpen) { setIsBulkRescheduleModalOpen(false); return; }

                // Priority 3: Edit Appointment Modal (managed by AppointmentModal itself)
                if (isEditModalOpen) return;

                // Priority 4: Session Details Panel
                if (selectedSlot) {
                    if (isRescheduling) setIsRescheduling(false);
                    else setSelectedSlot(null);
                    return;
                }
            }
        };

        const isAnyModalOpen = confirmModal.isOpen || financialModalOpen || isBlockingModalOpen || 
                             isHistoryModalOpen || isEditModalOpen || selectedSlot || isBulkRescheduleModalOpen;

        if (isAnyModalOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmModal.isOpen, financialModalOpen, isBlockingModalOpen, isHistoryModalOpen, 
        isEditModalOpen, selectedSlot, isBulkRescheduleModalOpen, isRescheduling]);

    // --- Constants ---
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    // --- Fetchers ---
    const fetchHistory = async (patientId: string) => {
        try {
            setPatientHistoryLoading(true);
            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    *,
                    doctor:doctors(name),
                    specialty:specialties(name)
                `)
                .eq('patient_id', patientId)
                .order('date', { ascending: false });

            if (error) throw error;
            setPatientHistoryData(data || []);
        } catch (error: any) {
            console.error('Error fetching history:', error);
            addToast('Erro ao carregar histórico.', 'error');
        } finally {
            setPatientHistoryLoading(false);
        }
    };

    // --- Fetchers ---
    const fetchPlans = async () => {
        try {
            setLoading(true);
            const { data: plansData, error: plansError } = await supabase
                .from('treatment_plans')
                .select(`
                    *,
                    patient:patients(name, cpf, phone, birth_date, is_sus, is_blocked, unexcused_absences),
                    doctor:doctors(name),
                    specialty:specialties(name),
                    sessions:therapy_sessions(*),
                    payments:therapy_payments(*)
                `)
                .in('status', ['active', 'completed', 'cancelled'])
                .order('created_at', { ascending: false });

            if (plansError) throw plansError;
            
            // Filter only allowed specialties
            const filteredData = (plansData || []).filter((p: any) => 
                ALLOWED_TREATMENT_SPECIALTIES.includes(p.specialty?.name)
            );

            setPlans(filteredData as any || []);

            // After fetching plans, fetch full history for these plans to calculate session counts
            if (plansData && plansData.length > 0) {
                fetchAppointmentsHistory(plansData.map(p => p.id));
            }
        } catch (error: any) {
            console.error('Error fetching plans:', error);
            if (error.message?.includes('JWT expired')) {
                addToast('Sessão expirada. Redirecionando para login...', 'error');
                signOut();
                return;
            }
            addToast(`Erro ao carregar planos: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchAppointmentsHistory = async (planIds: string[]) => {
        try {
            // Fetch ALL scheduled/completed appointments for the active plans to calculate indices
            // Supabase limits responses to 1000 rows max. We must paginate to get the full history!
            let allFetched: any[] = [];
            let hasMore = true;
            let from = 0;
            const step = 999;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('appointments')
                    .select(`
                        id, date, status, type, attendance_status, treatment_plan_id,
                        allocations:payment_allocations(
                            amount,
                            payment:therapy_payments(payment_method)
                        )
                    `)
                    .in('treatment_plan_id', planIds)
                    .order('date', { ascending: true })
                    .range(from, from + step);

                if (error) throw error;

                if (data) {
                    allFetched = [...allFetched, ...data];
                    if (data.length < step + 1) {
                        hasMore = false;
                    } else {
                        from += step + 1;
                    }
                } else {
                    hasMore = false;
                }
            }

            setAppointmentsHistory(allFetched || []);
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const fetchAppointments = async () => {
        try {
            setIsLoadingAppointments(true);

            // Calculate the range to fetch based on the visible week OR visible month
            let fetchStart, fetchEnd;

            if (view === 'weekly' || view === 'list') {
                const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
                const weekEnd = addDays(weekStart, 6);

                // Fetch only strictly what is needed (+/- 1 day for safety)
                fetchStart = addDays(weekStart, -1);
                fetchEnd = addDays(weekEnd, 1);
            } else {
                const monthStart = startOfMonth(currentDate);
                const monthEnd = endOfMonth(monthStart);

                // Fetch strictly the month (+/- 1 day for safety)
                fetchStart = addDays(monthStart, -1);
                fetchEnd = addDays(monthEnd, 1);
            }

            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    *,
                    patient:patients(name, is_sus, cpf, phone, birth_date, is_blocked, unexcused_absences),
                    doctor:doctors!doctor_id(name),
                    specialty:specialties!specialty_id(name),
                    treatment_plans(id, sessions_per_week, price_per_session, is_sus, status),
                    allocations:payment_allocations(amount, payment:therapy_payments(payment_method))
                `)
                .gte('date', fetchStart.toISOString())
                .lte('date', fetchEnd.toISOString())
                .neq('status', 'waiting_sus')
                .neq('status', 'cancelled');

            if (error) throw error;
            
            // Filter only allowed specialties
            const filteredApts = (data || []).filter((a: any) => 
                ALLOWED_TREATMENT_SPECIALTIES.includes(a.specialty?.name)
            );

            setAppointments(filteredApts as any || []);


        } catch (error: any) {
            console.error('Error fetching appointments:', error);
            if (error.message?.includes('JWT expired')) {
                signOut();
                return;
            }
            const errorDetails = error.message || error.details || JSON.stringify(error);
            addToast(`Falha na Agenda: ${errorDetails}`, 'error');
        } finally {
            setIsLoadingAppointments(false);
        }
    };

    // --- Effects ---
    useEffect(() => {
        fetchPlans();
    }, []);

    useEffect(() => {
        if (view === 'calendar' || view === 'weekly') {
            fetchAppointments();
        }
    }, [view, currentDate]);

    // listeners removed in favor of global handleGlobalEsc added above

      const filteredPlans = useMemo(() => {
        return plans.filter(plan => {
            const matchesSearch = !searchTerm ||
                includesNormalized(plan.patient?.name || '', searchTerm) ||
                (plan.patient?.cpf || '').includes(searchTerm);

            // Global search: ignore doctor/type filters if searching by name
            const matchesType = filterType === 'all' ||
                (plan.specialty?.name.toLowerCase() || '').includes(filterType);

            const matchesDoctor = selectedDoctorId === 'all' ||
                plan.doctor_id === selectedDoctorId;

            return matchesSearch && matchesType && matchesDoctor;
        });
    }, [plans, searchTerm, selectedDoctorId]);

    const filteredAppointments = useMemo(() => {
        return appointments.filter(apt => {
            const matchesSearch = !searchTerm ||
                includesNormalized(apt.patient?.name || '', searchTerm);

            const matchesType = filterType === 'all' ||
                (apt.specialty?.name.toLowerCase() || '').includes(filterType);

            const matchesDoctor = selectedDoctorId === 'all' ||
                apt.doctor_id === selectedDoctorId;

            return matchesSearch && matchesType && matchesDoctor;
        });
    }, [appointments, searchTerm, selectedDoctorId]);


    // Handle default doctor if none selected - REMOVED aggressive auto-selection to prevent flickering
    // We already initialize selectedDoctorId with 'all' or localStorage value

    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Começa na segunda
        return Array.from({ length: 5 }, (_, i) => addDays(start, i)); // 5 dias (Seg-Sex)
    }, [currentDate]);

    // --- Handlers: Bulk Selection ---
    const toggleSelectApt = (id: string) => {
        setSelectedApts(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectDay = (day: Date, isPhysical: boolean = true) => {
        const dayApts = appointments.filter(a => isSameDay(parseISO(a.date), day) && a.attendance_status !== 'cancelled');
        const dayIds = dayApts.map(a => a.id);
        const allSelected = dayIds.every(id => selectedApts.includes(id));

        if (allSelected) {
            setSelectedApts(prev => prev.filter(id => !dayIds.includes(id)));
        } else {
            setSelectedApts(prev => [...new Set([...prev, ...dayIds])]);
        }
    };

    const fetchBlockedDates = async () => {
        try {
            const { data, error } = await supabase.from('blocked_dates').select('*');
            if (!error) setBlockedDates(data || []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchBlockedDates();

        // Global Escape key listener to clear selection
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedApts([]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleBlockDate = async () => {
        if (!dateToBlock) return;
        try {
            const { error } = await supabase.from('blocked_dates').insert([{
                date: format(dateToBlock, 'yyyy-MM-dd'),
                reason: blockReason,
                doctor_id: selectedDoctorId === 'all' ? null : selectedDoctorId
            }]);
            if (error) throw error;
            addToast('Data bloqueada com sucesso.', 'success');
            setIsBlockingModalOpen(false);
            setBlockReason('');
            fetchBlockedDates();
        } catch (err: any) {
            console.error(err);
            addToast('Erro ao bloquear data. Verifique se a tabela existe.', 'error');
        }
    };

    const handleUnblockDate = async (id: string) => {
        try {
            const { error } = await supabase.from('blocked_dates').delete().eq('id', id);
            if (error) throw error;
            addToast('Bloqueio removido.', 'success');
            fetchBlockedDates();
        } catch (err) { console.error(err); }
    };
    const handleBulkAttendance = async (status: 'attended' | 'missed' | 'justified' | 'cancelled' | null) => {
        if (selectedApts.length === 0 || actionLoading) return;
        try {
            setActionLoading(true);
            const { error } = await supabase
                .from('appointments')
                .update({
                    attendance_status: status,
                    status: status === 'attended' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'scheduled'
                })
                .in('id', selectedApts);

            if (error) throw error;
            addToast(`${selectedApts.length} atendimentos atualizados.`, 'success');
            setSelectedApts([]);
            fetchAppointments();
        } catch (err: any) {
            console.error(err);
            addToast('Erro ao atualizar em massa.', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleBulkCancelPlanSessions = async () => {
        if (selectedApts.length === 0 || actionLoading) return;
        try {
            setActionLoading(true);

            // Fetch the details of selected appointments
            const { data: selectedDetails, error: fetchError } = await supabase
                .from('appointments')
                .select('id, treatment_plan_id, date')
                .in('id', selectedApts);

            if (fetchError) throw fetchError;

            // Group by treatment plan to find the earliest date
            const planMinDates: Record<string, string> = {};
            selectedDetails?.forEach(apt => {
                if (apt.treatment_plan_id) {
                    if (!planMinDates[apt.treatment_plan_id] || apt.date < planMinDates[apt.treatment_plan_id]) {
                        planMinDates[apt.treatment_plan_id] = apt.date;
                    }
                }
            });

            // For each plan, cancel future scheduled sessions and mark plan as completed
            for (const [planId, fromDate] of Object.entries(planMinDates)) {
                await supabase
                    .from('treatment_plans')
                    .update({ status: 'cancelled' })
                    .eq('id', planId);

                await supabase
                    .from('appointments')
                    .update({
                        status: 'cancelled',
                        attendance_status: 'cancelled'
                    })
                    .eq('treatment_plan_id', planId)
                    .gte('date', startOfDay(parseISO(fromDate)).toISOString())
                    .eq('status', 'scheduled');
            }

            addToast('Sessões canceladas e planos encerrados!', 'success');
            setSelectedApts([]);
            fetchPlans();
            fetchAppointments();
        } catch (error: any) {
            console.error('Error in bulk cancel:', error);
            addToast(`Erro ao cancelar: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    };

    const getStatusForDay = (plan: EnhancedPlan, date: Date) => {
        const dayName = dayNames[getDay(date)];
        if (!plan.schedule_days?.includes(dayName)) return null;

        const session = plan.sessions?.find(s => isSameDay(parseISO(s.session_date), date));
        return session ? session.status : 'scheduled';
    };

    const getSessionNumber = (planId: string, currentDate: Date) => {
        // Filter history for this plan
        const planHistory = appointmentsHistory.filter(a => a.treatment_plan_id === planId);

        // Group by day to prevent duplicates from artificially inflating the session count in the UI badge (e.g. 11/10)
        // We count each day with at least one valid (non-cancelled, non-evaluation) session as one session.
        const sessionsByDay = new Map<string, string>(); // Day -> Status
        
        planHistory.forEach(a => {
            const isCancelled = a.attendance_status === 'cancelled' || a.status === 'cancelled';
            const isEvaluation = a.type === 'Avaliação';
            if (!isCancelled && !isEvaluation) {
                const dayStr = format(parseISO(a.date), 'yyyy-MM-dd');
                // We prefer 'attended' sessions in our map if multiple exist, but any valid session counts.
                if (!sessionsByDay.has(dayStr) || a.attendance_status === 'attended') {
                    sessionsByDay.set(dayStr, a.attendance_status || 'scheduled');
                }
            }
        });

        // Convert back to array and sort by date
        const validSessions = Array.from(sessionsByDay.keys()).sort();

        // Convert currentDate to day string for finding the index
        const currentDayStr = format(currentDate, 'yyyy-MM-dd');
        const index = validSessions.indexOf(currentDayStr);

        if (index === -1) {
            // If the session is not in history (projection), estimate its position
            const countBefore = validSessions.filter(date => date < currentDayStr).length;
            return countBefore + 1;
        }

        return index + 1;
    };

    const handleRecordAttendance = async (planId: string, date: Date, status: 'attended' | 'missed' | 'justified' | 'cancelled' | null) => {
        if (actionLoading) return;
        try {
            setActionLoading(true);
            const isoDate = format(date, 'yyyy-MM-dd');
            const plan = plans.find(p => p.id === planId);
            if (!plan) throw new Error('Plano não encontrado.');

            // 1. Check for existing appointment ON THIS DAY
            // We look for any appointment for this plan on the same day to prevent duplicates
            // caused by minor time differences or redundant clicks.
            const startOfReq = startOfDay(date);
            const endOfReq = endOfDay(date);

            const { data: existingApts } = await supabase
                .from('appointments')
                .select('id, status, attendance_status')
                .eq('treatment_plan_id', planId)
                .gte('date', startOfReq.toISOString())
                .lte('date', endOfReq.toISOString())
                .limit(1);

            const existingApt = existingApts?.[0];

            let error;
            if (existingApt) {
                if (status === 'cancelled') {
                    // Start of Change: Delete if cancelled
                    setAppointments(prev => prev.filter(a => a.id !== existingApt.id)); // Optimistic UI
                    const { error: deleteError } = await supabase
                        .from('appointments')
                        .delete()
                        .eq('id', existingApt.id);
                    error = deleteError;
                    // End of Change
                } else {
                    setAppointments(prev => prev.map(a =>
                        a.id === existingApt.id
                            ? { ...a, attendance_status: status, status: status === 'attended' ? 'completed' : 'scheduled' }
                            : a
                    )); // Optimistic UI
                    const { error: updateError } = await supabase
                        .from('appointments')
                        .update({
                            attendance_status: status,
                            status: status === 'attended' ? 'completed' : 'scheduled'
                        })
                        .eq('id', existingApt.id);
                    error = updateError;
                }
            } else {
                // If checking attendance for the first time, create the appointment
                // If status is cancelled, we do NOTHING (don't create a cancelled appointment)
                if (status === 'cancelled') {
                    // Just return, effectively "reoving" the projection from view by not creating it
                    addToast('Agendamento removido da visualização.', 'info');
                    fetchPlans(); // Just in case
                    return;
                }

                // Create specific time based on plan schedule
                const [hours, minutes] = (plan.schedule_time || '08:00').split(':');
                const appointmentDate = new Date(date);
                appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                // FINAL SAFETY CHECK: Re-check if it exists now, just before inserting
                const { data: doubleCheck } = await supabase
                    .from('appointments')
                    .select('id')
                    .eq('treatment_plan_id', planId)
                    .eq('date', appointmentDate.toISOString())
                    .single();

                if (doubleCheck) {
                    console.log("Blocking duplicate insertion detected just-in-time.");
                    setAppointments(prev => prev.map(a =>
                        a.id === doubleCheck.id
                            ? { ...a, attendance_status: status, status: status === 'attended' ? 'completed' : 'scheduled' }
                            : a
                    )); // Optimistic UI
                    // Update instead of insert
                    const { error: updateError } = await supabase
                        .from('appointments')
                        .update({
                            attendance_status: status,
                            status: status === 'attended' ? 'completed' : 'scheduled'
                        })
                        .eq('id', doubleCheck.id);
                    error = updateError;
                } else {
                    const { data: newApt, error: insertError } = await supabase
                        .from('appointments')
                        .insert([{
                            patient_id: plan.patient_id,
                            doctor_id: plan.doctor_id,
                            specialty_id: plan.specialty_id,
                            type: 'Sessão',
                            date: appointmentDate.toISOString(),
                            status: status === 'attended' ? 'completed' : 'scheduled',
                            attendance_status: status,
                            treatment_plan_id: planId,
                            created_by: (await supabase.auth.getUser()).data.user?.id
                        }])
                        .select(`
                            *,
                            patient:patients(name, is_sus, cpf, phone, birth_date, is_blocked, unexcused_absences),
                            doctor:doctors!doctor_id(name),
                            specialty:specialties!specialty_id(name),
                            treatment_plans(id, sessions_per_week, price_per_session, is_sus, status),
                            allocations:payment_allocations(amount, payment:therapy_payments(payment_method))
                        `)
                        .single();

                    if (newApt) {
                        setAppointments(prev => [...prev, newApt as any]); // Optimistic UI
                    }
                    error = insertError;
                }
            }

            if (error) throw error;

            // 2. Also update legacy therapy_sessions for backward compatibility if needed
            // (Optional, but let's keep it for now to avoid breaking other parts of UI that might rely on it)
            const existingSession = plan.sessions?.find(s => s.session_date === isoDate);
            if (existingSession) {
                await supabase.from('therapy_sessions').update({ status }).eq('id', existingSession.id);
            } else {
                await supabase.from('therapy_sessions').insert([{ plan_id: planId, session_date: isoDate, status }]);
            }

            // 3. Rebalance payments!
            await rebalancePayments(planId, plan.price_per_session || 0);

            // 4. Automated Discharge (Alta) Logic
            if (status === 'attended') {
                const { count: attendedCount } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('treatment_plan_id', planId)
                    .eq('attendance_status', 'attended')
                    .neq('type', 'Avaliação');

                const currentAttended = (attendedCount || 0);

                const specialtyName = plan.specialty?.name?.toLowerCase() || '';
                const isAutoDischargeSpecialty = specialtyName.includes('fisioterap') || specialtyName.includes('acupuntur');

                if (isAutoDischargeSpecialty && plan.total_sessions && currentAttended >= plan.total_sessions) {
                    await supabase.from('treatment_plans').update({ status: 'completed' }).eq('id', planId);
                    addToast(`${plan.patient?.name.split(' ')[0]} finalizou as sessões!`, 'success');
                } else {
                    addToast('Presença registrada e créditos atualizados!', 'success');
                }
            } else {
                addToast('Status atualizado!', 'success');
            }
            fetchPlans();
            fetchAppointments();

            // Sync current modal state
            const { data: refreshedPlan } = await supabase
                .from('treatment_plans')
                .select(`
                    *,
                    patient:patients(name, cpf, phone, birth_date, is_blocked, unexcused_absences),
                    doctor:doctors(name),
                    specialty:specialties(name),
                    sessions:therapy_sessions(*),
                    payments:therapy_payments(*)
                `)
                .eq('id', planId)
                .single();

            if (refreshedPlan && selectedSlot) {
                setSelectedSlot({ ...selectedSlot, plan: refreshedPlan as any });
            }
        } catch (error: any) {
            console.error('Error recording attendance:', error);
            if (error.message?.includes('JWT expired')) {
                addToast('Sessão expirada. Por favor, faça login novamente.', 'warning');
                signOut();
                return;
            }
            addToast(`Erro ao registrar: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteAppointment = async (planId: string, date: Date) => {
        try {
            setActionLoading(true);
            const apt = appointments.find(a => a.treatment_plan_id === planId && isSameDay(parseISO(a.date), date));
            if (apt) {
                const { error } = await supabase.from('appointments').delete().eq('id', apt.id);
                if (error) throw error;
                addToast('Registro removido da agenda.', 'success');
                fetchAppointments();
                closeModal();
            } else {
                // Se é uma projeção (fantasma), a gente cria um registro cancelado para ele parar de aparecer
                const plan = plans.find(p => p.id === planId);
                if (!plan) throw new Error('Plano não encontrado.');

                const [hours, minutes] = (plan.schedule_time || '08:00').split(':');
                const appointmentDate = new Date(date);
                appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                const { error: insertError } = await supabase
                    .from('appointments')
                    .insert([{
                        patient_id: plan.patient_id,
                        doctor_id: plan.doctor_id,
                        specialty_id: plan.specialty_id,
                        type: 'Sessão',
                        date: appointmentDate.toISOString(),
                        status: 'cancelled',
                        attendance_status: 'cancelled',
                        treatment_plan_id: planId,
                        created_by: (await supabase.auth.getUser()).data.user?.id
                    }]);

                if (insertError) throw insertError;
                addToast('Agendamento futuro cancelado.', 'success');
                fetchAppointments();
                closeModal();
            }
        } catch (error: any) {
            console.error('Error deleting appointment:', error);
            if (error.message?.includes('JWT expired')) {
                addToast('Sessão expirada. Por favor, faça login novamente.', 'warning');
                signOut();
                return;
            }
            addToast(`Erro ao excluir: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelFutureSessions = async (planId: string, fromDate: Date) => {
        try {
            setActionLoading(true);
            const plan = plans.find(p => p.id === planId);
            if (!plan) throw new Error('Plano não encontrado.');

            // Em vez de varrer fisicamente os agendamentos já criados, setamos o status do plano para 'cancelled'
            // Isso previne que novas projeções fantasma sejam criadas a partir de hoje.
            const { error: planError } = await supabase
                .from('treatment_plans')
                .update({ status: 'cancelled' }) // Assumindo 'cancelled' para encerrar a agenda por cancelamento
                .eq('id', planId);

            if (planError) throw planError;

            // Se houver agendamentos fisicos futuros que já foram criados/pagos mas não atendidos, precisamos cancelar eles
            // Na nossa lógica atual, agendamentos futuros não-atendidos têm status 'scheduled'
            const { error: aptError } = await supabase
                .from('appointments')
                .update({
                    status: 'cancelled',
                    attendance_status: 'cancelled'
                })
                .eq('treatment_plan_id', planId)
                .gte('date', startOfDay(fromDate).toISOString())
                .eq('status', 'scheduled');

            if (aptError) throw aptError;

            addToast('Sessões futuras canceladas e plano encerrado.', 'success');
            fetchPlans();
            fetchAppointments();
            closeModal();
        } catch (error: any) {
            console.error('Error cancelling future sessions:', error);
            addToast(`Erro ao cancelar sessões: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleType = async (planId: string, date: Date) => {
        try {
            setActionLoading(true);
            const apt = appointments.find(a => a.treatment_plan_id === planId && isSameDay(parseISO(a.date), date));

            if (!apt) {
                // If appointment doesn't exist, create it as 'Avaliação'
                const plan = plans.find(p => p.id === planId);
                if (!plan) throw new Error('Plano não encontrado.');

                // Create a specific time for the appointment based on the plan's schedule_time
                const [hours, minutes] = (plan.schedule_time || '08:00').split(':');
                const appointmentDate = new Date(date);
                appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                const { error: insertError } = await supabase
                    .from('appointments')
                    .insert([{
                        patient_id: plan.patient_id,
                        doctor_id: plan.doctor_id,
                        specialty_id: plan.specialty_id,
                        type: 'Avaliação',
                        date: appointmentDate.toISOString(),
                        status: 'scheduled',
                        treatment_plan_id: planId,
                        created_by: (await supabase.auth.getUser()).data.user?.id
                    }]);

                if (insertError) throw insertError;
                addToast('Marcado como Avaliação!', 'success');
            } else {
                // Toggle existing appointment type
                const newType = apt.type === 'Sessão' ? 'Avaliação' : 'Sessão';
                const { error } = await supabase
                    .from('appointments')
                    .update({ type: newType })
                    .eq('id', apt.id);

                if (error) throw error;
                addToast(`Alterado para ${newType}!`, 'success');
            }

            // Sync with local state and TRIGGER REBALANCE to clean up allocations if it became an evaluation
            const plan = plans.find(p => p.id === planId);
            if (plan) {
                await rebalancePayments(planId, plan.price_per_session);
            }

            fetchAppointments();
        } catch (error: any) {
            console.error('Error toggling type:', error);
            if (error.message?.includes('JWT expired')) {
                addToast('Sessão expirada. Por favor, faça login novamente.', 'warning');
                signOut();
                return;
            }
            addToast(`Erro ao alterar tipo: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReschedule = async (plan: EnhancedPlan, originalDate: Date, newDate: Date) => {
        try {
            setActionLoading(true);

            // 1. CONFLICT CHECK
            const { data: conflict } = await supabase
                .from('appointments')
                .select('id, date')
                .eq('patient_id', plan.patient_id)
                .gte('date', startOfDay(newDate).toISOString())
                .lte('date', endOfDay(newDate).toISOString())
                .neq('status', 'cancelled')
                .maybeSingle();

            if (conflict) {
                const conflictTime = format(parseISO(conflict.date), 'HH:mm');
                if (!window.confirm(`Atenção: O paciente ${plan.patient?.name} já possui um agendamento nesta data às ${conflictTime}. Deseja reagendar mesmo assim?`)) {
                    return;
                }
            }

            // 2. Check for existing appointment on the ORIGINAL date
            // Fix: Local search prevents timezone mismatches from returning false negatives, eliminating erroneous SCENARIO B triggers
            const existingApt = appointments.find(a =>
                a.treatment_plan_id === plan.id &&
                isSameDay(parseISO(a.date), originalDate) &&
                a.attendance_status !== 'cancelled'
            );

            let error;

            if (existingApt) {
                // SCENARIO A: Real Appointment -> Move + Suppress old slot
                // To suppress the projection that would appear in the "hole" left by the move:
                await supabase.from('appointments').insert([{
                    patient_id: plan.patient_id,
                    doctor_id: plan.doctor_id,
                    specialty_id: plan.specialty_id,
                    type: 'Sessão',
                    date: originalDate.toISOString(),
                    status: 'completed',
                    attendance_status: 'cancelled',
                    treatment_plan_id: plan.id,
                    created_by: (await supabase.auth.getUser()).data.user?.id,
                    notes: 'Marcador para suprimir projeção após reagendamento fìsico.'
                }]);

                const { error: updateError } = await supabase
                    .from('appointments')
                    .update({ date: newDate.toISOString() })
                    .eq('id', existingApt.id);
                error = updateError;
            } else {
                // SCENARIO B: Virtual Appointment (Projection) -> Cancel Old (to hide projection) + Create New
                // B1. Cancel "Ghost" on Original Date
                const { error: cancelError } = await supabase
                    .from('appointments')
                    .insert([{
                        patient_id: plan.patient_id,
                        doctor_id: plan.doctor_id,
                        specialty_id: plan.specialty_id,
                        type: 'Sessão',
                        date: originalDate.toISOString(),
                        status: 'completed',
                        attendance_status: 'cancelled',
                        treatment_plan_id: plan.id,
                        created_by: (await supabase.auth.getUser()).data.user?.id,
                        notes: 'Agendamento virtual cancelado para reagendamento.'
                    }]);

                if (cancelError) throw cancelError;

                // B2. Create New on New Date
                const { error: createError } = await supabase
                    .from('appointments')
                    .insert([{
                        patient_id: plan.patient_id,
                        doctor_id: plan.doctor_id,
                        specialty_id: plan.specialty_id,
                        type: 'Sessão',
                        date: newDate.toISOString(),
                        status: 'scheduled',
                        attendance_status: null,
                        treatment_plan_id: plan.id,
                        created_by: (await supabase.auth.getUser()).data.user?.id
                    }]);
                error = createError;
            }

            if (error) throw error;

            addToast('Sessão reagendada com sucesso!', 'success');
            fetchPlans();
            fetchAppointments();
            setSelectedSlot(null); // Close modal
        } catch (error: any) {
            console.error('Error rescheduling:', error);
            addToast(`Erro ao reagendar: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRecordPayment = async (planId: string) => {
        if (!paymentAmount || isNaN(Number(paymentAmount))) {
            addToast('Informe um valor válido.', 'error');
            return;
        }

        try {
            setActionLoading(true);
            const amount = Number(paymentAmount);
            const plan = plans.find(p => p.id === planId);
            if (!plan) throw new Error('Plano não encontrado.');

            // 1.5 Check if plan price needs update (either zero-fix or user manual edit)
            let currentPrice = plan.price_per_session || 0;
            const newSessionPrice = Number(sessionPrice);

            if (newSessionPrice > 0 && newSessionPrice !== currentPrice) {
                console.log(`Updating plan price from ${currentPrice} to ${newSessionPrice}`);
                currentPrice = newSessionPrice;

                await supabase
                    .from('treatment_plans')
                    .update({ price_per_session: currentPrice })
                    .eq('id', planId);

                addToast(`Preço do plano atualizado para R$ ${currentPrice}`, 'info');
            } else if (currentPrice <= 0 && amount > 0) {
                // ... (existing zero-fix logic fallback)
                currentPrice = amount;
                await supabase.from('treatment_plans').update({ price_per_session: amount }).eq('id', planId);
            }

            // 1. Registrar o pagamento principal
            const { error: paymentError } = await supabase
                .from('therapy_payments')
                .insert([{
                    plan_id: planId,
                    amount: amount,
                    payment_method: paymentMethod,
                    payment_date: format(new Date(), 'yyyy-MM-dd'),
                    notes: `Pagamento de R$ ${amount} via ${paymentMethod}`
                }]);

            if (paymentError) throw paymentError;

            // 2. Rebalancear tudo para este plano (using potentially updated price)
            const result = await rebalancePayments(planId, currentPrice);

            addToast('Pagamento registrado e créditos distribuídos!', 'success');

            setPaymentAmount('');

            // Fetch updated data from DB
            fetchPlans();
            if (view === 'calendar' || view === 'weekly') {
                fetchAppointments();
            }

            // Sync the current modal state with the new DB data
            const { data: refreshedPlan } = await supabase
                .from('treatment_plans')
                .select(`
                    *,
                    patient:patients(name, cpf, phone, birth_date, is_blocked, unexcused_absences),
                    doctor:doctors(name),
                    specialty:specialties(name),
                    sessions:therapy_sessions(*),
                    payments:therapy_payments(*)
                `)
                .eq('id', planId)
                .single();

            if (refreshedPlan && selectedSlot) {
                setSelectedSlot({ ...selectedSlot, plan: refreshedPlan as any });
            }
        } catch (error: any) {
            console.error('Error recording payment:', error);
            if (error.message?.includes('JWT expired')) {
                addToast('Sessão expirada. Por favor, faça login novamente.', 'warning');
                signOut();
                return;
            }
            addToast(`Erro ao registrar pagamento: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId: string, planId: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta entrada de saldo? Os abates voltarão a ficar pendentes.')) return;

        try {
            setActionLoading(true);
            const plan = plans.find(p => p.id === planId);
            if (!plan) throw new Error('Plano não encontrado.');

            // 1. Delete the payment
            const { error: deleteError } = await supabase
                .from('therapy_payments')
                .delete()
                .eq('id', paymentId);

            if (deleteError) throw deleteError;

            // 2. Rebalance (this will clean up allocations that belonged to this payment and recalculate the rest)
            const currentPrice = plan.price_per_session || 0;
            await rebalancePayments(planId, currentPrice);

            addToast('Pagamento excluído com sucesso. Créditos reajustados.', 'success');

            // 3. Update UI state
            fetchPlans();
            if (view === 'calendar' || view === 'weekly') {
                fetchAppointments();
            }

            const { data: refreshedPlan } = await supabase
                .from('treatment_plans')
                .select(`
                    *,
                    patient:patients(name, cpf, phone, birth_date, is_blocked, unexcused_absences),
                    doctor:doctors(name),
                    specialty:specialties(name),
                    sessions:therapy_sessions(*),
                    payments:therapy_payments(*)
                `)
                .eq('id', planId)
                .single();

            if (refreshedPlan && selectedSlot) {
                setSelectedSlot({ ...selectedSlot, plan: refreshedPlan as any });
            }

        } catch (error: any) {
            console.error('Error deleting payment:', error);
            addToast(`Erro ao excluir pagamento: ${error.message}`, 'error');
        } finally {
            setActionLoading(false);
        }
    };



    const executeDeletePlan = async () => {
        if (!confirmModal.planId) return;
        try {
            const { error } = await supabase.from('treatment_plans').delete().eq('id', confirmModal.planId);
            if (error) throw error;
            setPlans(prev => prev.filter(p => p.id !== confirmModal.planId));
            addToast('Plano de tratamento excluído com sucesso.', 'success');
        } catch (error: any) {
            addToast(`Erro ao excluir: ${error.message}`, 'error');
        } finally {
            setConfirmModal({ isOpen: false, planId: null, action: 'delete' });
        }
    };

    const executeDischargePlan = async () => {
        if (!confirmModal.planId) return;
        try {
            const plan = plans.find(p => p.id === confirmModal.planId);
            const isInactive = plan?.status === 'completed' || plan?.status === 'cancelled';
            const newStatus = isInactive ? 'active' : 'completed';

            await supabase.from('treatment_plans').update({ status: newStatus }).eq('id', confirmModal.planId);
            // --- NOVO: REATIVAÇÃO DE SESSÕES FUTURAS (FÍSICA) ---
            if (newStatus === 'active') {
                const plan = plans.find(p => p.id === confirmModal.planId);
                if (plan && plan.schedule_days?.length && plan.schedule_time) {
                    const pivotDate = plan.start_date ? startOfDay(parseISO(plan.start_date)) : startOfDay(new Date());

                    // Fetch history to know what is preserved
                    const { data: allExisting } = await supabase
                        .from('appointments')
                        .select('date, status, attendance_status')
                        .eq('treatment_plan_id', confirmModal.planId)
                        .neq('type', 'Avaliação');

                    let preservedCount = 0;
                    const preservedDates = new Set();

                    (allExisting || []).forEach(apt => {
                        const aptDate = startOfDay(parseISO(apt.date));

                        const isLimiterOrScheduled = apt.status === 'scheduled' || apt.status === 'cancelled';
                        const isPhysicalCancel = apt.attendance_status === 'cancelled';

                        if (!isLimiterOrScheduled && !isPhysicalCancel) {
                            preservedCount++;
                            preservedDates.add(aptDate.toISOString().split('T')[0]);
                        }
                    });

                    const remainingSessions = (plan.total_sessions || 0) - preservedCount;
                    const appointmentsToCreate: any[] = [];

                    if (remainingSessions > 0) {
                        const { data: { user } } = await supabase.auth.getUser();
                        let currentDate = new Date(pivotDate);
                        const getDayIndex = (ptName: string) => ({ 'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6 })[ptName] as number;
                        const targetDays = plan.schedule_days.map(getDayIndex);
                        let iterations = 0;

                        while (appointmentsToCreate.length < remainingSessions && iterations < 730) {
                            if (targetDays.includes(currentDate.getDay())) {
                                const dateStr = currentDate.toISOString().split('T')[0];
                                if (!preservedDates.has(dateStr)) {
                                    const [hours, minutes] = plan.schedule_time.split(':');
                                    const appointmentDate = new Date(currentDate);
                                    appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                                    appointmentsToCreate.push({
                                        patient_id: plan.patient_id,
                                        doctor_id: plan.doctor_id || null,
                                        specialty_id: plan.specialty_id,
                                        type: 'Sessão',
                                        date: appointmentDate.toISOString(),
                                        status: 'scheduled',
                                        treatment_plan_id: confirmModal.planId,
                                        created_by: user?.id
                                    });
                                }
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                            iterations++;
                        }
                    }

                    // We aggressively delete ALL scheduled and ghost cancelled appointments for this plan 
                    await supabase.from('appointments')
                        .delete()
                        .eq('treatment_plan_id', confirmModal.planId)
                        .in('status', ['scheduled', 'cancelled']);

                    if (appointmentsToCreate.length > 0) {
                        await supabase.from('appointments').insert(appointmentsToCreate);
                    }
                }
            }

            // Optimistic update so the UI reacts instantly and the panel stays open
            setPlans(prev => prev.map(p => p.id === confirmModal.planId ? { ...p, status: newStatus } : p));
            setAppointments(prev => prev.map(a => a.treatment_plan_id === confirmModal.planId && a.treatment_plans ?
                { ...a, treatment_plans: { ...a.treatment_plans, status: newStatus } } : a
            ));

            if (selectedSlot && selectedSlot.plan.id === confirmModal.planId) {
                setSelectedSlot({ ...selectedSlot, plan: { ...selectedSlot.plan, status: newStatus } as any });
            }

            const planName = plans.find(p => p.id === confirmModal.planId)?.patient?.name?.split(' ')[0] || 'Paciente';
            addToast(`${planName} teve o status atualizado para ativo/alta.`, 'success');

            // Re-fetch in background to ensure sync
            fetchPlans();
            fetchAppointments();
        } catch (error: any) {
            addToast(`Erro ao alterar alta: ${error.message}`, 'error');
        } finally {
            setConfirmModal({ isOpen: false, planId: null, action: 'discharge' });
        }
    };

    const executeBulkExceeded = async () => {
        const success = await cleanupExceededSessions(plans, appointmentsHistory, addToast, confirmModal.planId || undefined);
        if (success) {
            fetchPlans();
            fetchAppointments();
        }
        setConfirmModal({ isOpen: false, planId: null, action: 'delete' });
    };

    // --- Renderers ---
    const renderCalendar = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { locale: ptBR });
        const endDate = endOfWeek(monthEnd, { locale: ptBR });

        const rows = [];
        let days = [];
        let day = startDate;

        const headerDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((d, i) => (
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest text-center py-2" key={i}>
                {d}
            </div>
        ));

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                const cloneDay = day;
                const dayOfWeek = getDay(cloneDay);

                // Skip Sunday (0) and Saturday (6)
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const dayAppointments = filteredAppointments.filter(apt => isSameDay(parseISO(apt.date), cloneDay));
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isToday = isSameDay(day, new Date());

                    days.push(
                        <div
                            className={`min-h-[120px] border border-slate-100 p-2 transition-all hover:bg-slate-50 relative group ${!isCurrentMonth ? 'bg-slate-50/50' : 'bg-white'}`}
                            key={day.toString()}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <button
                                    onClick={() => navigate('/agendamentos', { state: { action: 'new', targetTab: 'sessao', preSelectedDate: format(day, 'yyyy-MM-dd'), returnTo: '/agendamentos/sessoes', selectedDoctorId: selectedDoctorId } })}
                                    className="p-1 px-1.5 bg-indigo-50 text-indigo-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:text-white border border-indigo-100 flex items-center gap-1"
                                    title="Novo agendamento"
                                >
                                    <Plus size={12} strokeWidth={3} />
                                    <span className="text-[9px] font-black uppercase">Novo</span>
                                </button>
                                <div className={`text-right text-xs font-bold ${!isCurrentMonth ? 'text-slate-300' : isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    <span className={isToday ? 'bg-indigo-100 px-2 py-1 rounded-full' : ''}>{format(day, 'd')}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                {dayAppointments.map((apt) => {
                                    const plan = plans.find(p => p.id === apt.treatment_plan_id);
                                    const isOfficial = apt.status === 'official';

                                    return (
                                        <button
                                            key={apt.id}
                                            onClick={() => {
                                                if (plan) setSelectedSlot({ plan, date: parseISO(apt.date) });
                                            }}
                                            className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-2 group/apt ${apt.attendance_status === 'attended' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                apt.attendance_status === 'missed' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                                    apt.attendance_status === 'justified' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                        isOfficial ? 'bg-indigo-50/50 text-slate-700 border-indigo-100' :
                                                            'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                                }`}
                                        >
                                            <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${apt.attendance_status === 'attended' ? 'bg-emerald-500' :
                                                apt.attendance_status === 'missed' ? 'bg-rose-500' :
                                                    apt.attendance_status === 'justified' ? 'bg-amber-500' :
                                                        isOfficial ? 'bg-indigo-500' : 'bg-indigo-400'
                                                }`} />

                                            <div className="flex items-center gap-1 flex-1 min-w-0">
                                                <span className="truncate">
                                                    {apt.patient?.name?.split(' ')[0]}
                                                </span>
                                                {(plan?.is_sus || apt.treatment_plans?.is_sus || apt.patient?.is_sus || apt.is_sus) && <span className="shrink-0 text-[8px] bg-blue-600 text-white px-1 rounded font-black italic">SUS</span>}
                                                {apt.type === 'Avaliação' ? (
                                                    <span className="shrink-0 text-[7px] bg-amber-100 text-amber-700 px-1 rounded font-black uppercase border border-amber-200">Aval</span>
                                                ) : plan && plan.total_sessions !== 1 && (
                                                    <span className="shrink-0 text-[8px] text-slate-500 font-black opacity-70">
                                                        {getSessionNumber(plan.id, parseISO(apt.date))}/{plan.total_sessions || '-'}
                                                    </span>
                                                )}
                                            </div>

                                            <span className="text-slate-400 font-medium shrink-0">{format(parseISO(apt.date), 'HH:mm')}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                }
                day = addDays(day, 1);
            }
            rows.push(<div className="grid grid-cols-5" key={day.toString()}>{days}</div>);
            days = [];
        }

        return (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/50 animate-in fade-in">
                <div className="grid grid-cols-5 bg-slate-50 border-b border-slate-200">{headerDays}</div>
                <div>{rows}</div>
            </div>
        );
    };

    const renderWeeklyAgenda = () => {
        return (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl mb-32">
                <div className="grid grid-cols-5 border-b border-slate-100 sticky top-[104px] z-30 bg-white shadow-sm rounded-t-[2.5rem]">
                    {weekDays.map(day => (
                        <div key={day.toString()} className={`p-4 text-center border-r border-slate-100 last:border-0 relative group ${isSameDay(day, new Date()) ? 'bg-indigo-50/20' : ''}`}>
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    checked={appointments.filter(a => isSameDay(parseISO(a.date), day) && a.attendance_status !== 'cancelled').length > 0 &&
                                        appointments.filter(a => isSameDay(parseISO(a.date), day) && a.attendance_status !== 'cancelled').every(a => selectedApts.includes(a.id))}
                                    onChange={() => toggleSelectDay(day)}
                                />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{format(day, 'eee', { locale: ptBR })}</p>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <p className={`text-lg font-black ${isSameDay(day, new Date()) ? 'text-indigo-600' : 'text-slate-900'}`}>{format(day, 'dd')}</p>
                                {blockedDates.some(b => b.date === format(day, 'yyyy-MM-dd') && (b.doctor_id === null || (selectedDoctorId !== 'all' && b.doctor_id === selectedDoctorId))) && (
                                    <LockIcon size={12} className="text-rose-500 fill-rose-50" />
                                )}
                            </div>

                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                    onClick={() => {
                                        const block = blockedDates.find(b => 
                                            b.date === format(day, 'yyyy-MM-dd') && 
                                            (b.doctor_id === null || (selectedDoctorId !== 'all' && b.doctor_id === selectedDoctorId))
                                        );
                                        if (block) {
                                            if (window.confirm('Deseja remover o bloqueio desta data?')) {
                                                handleUnblockDate(block.id);
                                            }
                                        } else {
                                            setDateToBlock(day);
                                            setIsBlockingModalOpen(true);
                                        }
                                    }}
                                    className={`p-1.5 rounded-xl border-2 transition-all shadow-lg flex items-center gap-1 active:scale-90 bg-white ${blockedDates.some(b => b.date === format(day, 'yyyy-MM-dd')) ? 'border-rose-100 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600' : 'border-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-900'}`}
                                title={blockedDates.some(b => b.date === format(day, 'yyyy-MM-dd') && (b.doctor_id === null || (selectedDoctorId !== 'all' && b.doctor_id === selectedDoctorId))) ? "Remover bloqueio" : "Bloquear esta data"}
                                >
                                    {blockedDates.some(b => b.date === format(day, 'yyyy-MM-dd') && (b.doctor_id === null || (selectedDoctorId !== 'all' && b.doctor_id === selectedDoctorId))) ? <UnlockIcon size={14} /> : <LockIcon size={14} />}
                                </button>
                                <button
                                    onClick={() => navigate('/agendamentos', { state: { action: 'new', targetTab: 'sessao', preSelectedDate: format(day, 'yyyy-MM-dd'), returnTo: '/agendamentos/sessoes', selectedDoctorId: selectedDoctorId } })}
                                    className="p-1.5 bg-white rounded-xl border-2 border-slate-100 text-indigo-600 shadow-lg shadow-indigo-100/50 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 flex items-center gap-1 active:scale-90"
                                    title="Novo agendamento"
                                >
                                    <Plus size={14} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-5 min-h-[400px]">
                    {(() => {
                        // --- GHOST BUSTER PROJECTION LOGIC ---
                        // 1. Iniciar contador de projeções já exibidas para cada plano nesta semana vista
                        const sessionCounters = new Map<string, number>();
                        const visualCredits = new Map<string, number>();
                        plans.forEach(p => visualCredits.set(p.id, calculateBalance(p)));

                        return weekDays.map(day => {
                            const dayName = dayNames[getDay(day)];
                            const dayApts = filteredAppointments.filter(a => isSameDay(parseISO(a.date), day));
                            const allDayApts = dayApts;
                            const visibleDayApts = dayApts.filter(a => a.attendance_status !== 'cancelled');

                            const dayPlans: any[] = [];

                            filteredPlans.filter(p => p.status === 'active').forEach(p => {
                                // B1. Verificar se é dia de agenda do plano
                                if (!p.schedule_days?.includes(dayName)) return;

                                // B2. Verificar se já existe agendamento físico deste plano NESTE dia
                                // BUGFIX: Se existir um agendamento cancelado (tombstone), ele deve SUPRIMIR a projeção matemática para evitar clones após reagendamentos.
                                if (allDayApts.some(a => a.treatment_plan_id === p.id)) return;

                                // B3. Filtros de data (Start Date e Bloqueio de Passado)
                                if (p.start_date && compareAsc(parseISO(p.start_date), day) > 0) return;
                                if (compareAsc(startOfDay(new Date()), startOfDay(day)) > 0) return;

                                // B3.5 Bloqueio de Projeções para Planos de 1 Sessão (Avulsos antigos/Lixo de BD)
                                // O usuário reportou que pacientes aparecem com badge 1/1. Como não existem 
                                // planos contínuos de 1 sessão (apenas avaliações e sessões únicas fixas), 
                                // não devemos projetar fantasmas infinitos para eles.
                                if (p.total_sessions === 1) return;

                                // B4. Logica de Capacidade (Ghost Buster)
                                const allPhysicalForPlan = appointmentsHistory.filter(a =>
                                    a.treatment_plan_id === p.id &&
                                    a.attendance_status !== 'cancelled' &&
                                    a.type !== 'Avaliação'
                                );

                                const physicalBefore = allPhysicalForPlan.filter(a => new Date(a.date) < day).length;
                                const showedSoFar = sessionCounters.get(p.id) || 0;

                                // Só projeta se a soma de físicos (em qqr data) + projeções já mostradas for menor que o limite
                                const totalAccounted = allPhysicalForPlan.length + showedSoFar;

                                if (!p.total_sessions || totalAccounted < p.total_sessions) {
                                    // Calcular número da sessão para exibição
                                    const sessionNum = physicalBefore + showedSoFar + 1;

                                    dayPlans.push({
                                        ...p,
                                        _sessionNum: sessionNum
                                    });

                                    sessionCounters.set(p.id, showedSoFar + 1);
                                }
                            });

                            const combinedItems: { type: 'physical' | 'projection'; data: any }[] = [
                                ...visibleDayApts.map(apt => ({ type: 'physical' as const, data: apt })),
                                ...dayPlans.map(plan => ({ type: 'projection' as const, data: plan }))
                            ].sort((a, b) => {
                                const timeA = a.type === 'physical' ? format(parseISO(a.data.date), 'HH:mm') : (a.data.schedule_time || '00:00');
                                const timeB = b.type === 'physical' ? format(parseISO(b.data.date), 'HH:mm') : (b.data.schedule_time || '00:00');
                                return timeA.localeCompare(timeB);
                            });

                            const blockedInfo = blockedDates.find(b => 
                                b.date === format(day, 'yyyy-MM-dd') && 
                                (b.doctor_id === null || (selectedDoctorId !== 'all' && b.doctor_id === selectedDoctorId))
                            );

                            return (
                                <div key={day.toString()} className={`border-r border-slate-100 last:border-0 p-2 space-y-2 relative ${isSameDay(day, new Date()) ? 'bg-indigo-50/20' : ''}`}>
                                    {blockedInfo && (
                                        <div className="relative mb-3 bg-rose-50/80 border border-rose-200 rounded-xl flex flex-col items-center justify-center p-3 text-center shadow-sm">
                                            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-1.5 shadow-sm border border-rose-200">
                                                <LockIcon size={16} />
                                            </div>
                                            <p className="text-[10px] font-black text-rose-700 uppercase tracking-[0.2em] mb-0.5">
                                                {blockedInfo.doctor_id ? `${allDoctors.find(d => d.id === blockedInfo.doctor_id)?.name.split(' ')[0]} Bloqueado` : 'Data Bloqueada'}
                                            </p>
                                            <p className="text-[9px] font-bold text-rose-500/80 uppercase">{blockedInfo.reason || 'Sem motivo informado'}</p>
                                            <button
                                                onClick={() => handleUnblockDate(blockedInfo.id)}
                                                className="mt-2.5 px-3 py-1 bg-white border border-rose-100 rounded-lg text-[8px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                            >
                                                Desbloquear
                                            </button>
                                        </div>
                                    )}

                                    {combinedItems.length === 0 ? (
                                        <div className="h-full flex items-center justify-center opacity-20 py-20">
                                            <CalendarIcon size={24} className="text-slate-300" />
                                        </div>
                                    ) : (
                                        combinedItems.map(item => {
                                            if (item.type === 'physical') {
                                                const apt = item.data;
                                                const plan = plans.find(p => p.id === apt.treatment_plan_id);
                                                const status = apt.attendance_status || 'scheduled';
                                                // Check for official status to style differently if needed, though usually standard colors apply
                                                const isOfficial = apt.status === 'official';

                                                // Real allocation from DB
                                                const dbAllocated = apt.allocations?.reduce((sum: number, a: any) => sum + (a.amount || 0), 0) || 0;

                                                // If it's not 'attended', it's consuming from the 'visual balance' (money not yet used in a past session)
                                                if (status !== 'attended' && plan) {
                                                    const pool = visualCredits.get(plan.id) || 0;
                                                    visualCredits.set(plan.id, Math.max(0, pool - dbAllocated));
                                                }

                                                const isEvaluation = apt.type === 'Avaliação';

                                                return (
                                                    <button
                                                        key={apt.id}
                                                        onClick={() => {
                                                            if (selectedApts.length > 0) {
                                                                toggleSelectApt(apt.id);
                                                            } else if (plan) {
                                                                setSelectedSlot({ plan, date: parseISO(apt.date) });
                                                            }
                                                        }}
                                                        className={`w-full text-left p-3 rounded-2xl border transition-all hover:scale-[1.02] active:scale-95 group relative ${status === 'attended' ? 'bg-emerald-50 border-emerald-100' :
                                                            status === 'missed' ? 'bg-rose-50 border-rose-100' :
                                                                status === 'justified' ? 'bg-amber-50 border-amber-200 shadow-amber-100/50' :
                                                                    isOfficial ? 'bg-indigo-50/30 border-indigo-100' : // Subtle highlight for official
                                                                        'bg-white border-slate-100 shadow-sm hover:border-indigo-200'
                                                            } ${highlightedId === apt.id ? 'ring-2 ring-indigo-500 ring-offset-2 animate-pulse shadow-lg shadow-indigo-200' : ''}`}
                                                    >
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-3 h-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer z-10"
                                                                    checked={selectedApts.includes(apt.id)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={() => toggleSelectApt(apt.id)}
                                                                />
                                                                <div className={`w-2 h-2 rounded-full shadow-sm ${status === 'attended' ? 'bg-emerald-500' :
                                                                    status === 'missed' ? 'bg-rose-500' :
                                                                        status === 'justified' ? 'bg-amber-500' :
                                                                            isOfficial ? 'bg-indigo-500' : 'bg-indigo-300'
                                                                    }`} />
                                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{format(parseISO(apt.date), 'HH:mm')}</p>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                {isEvaluation && (
                                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-tighter shadow-sm border border-amber-200">Avaliação</span>
                                                                )}
                                                                {(plan?.status === 'completed' || apt.treatment_plans?.status === 'completed') && (
                                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-slate-700 text-white uppercase tracking-tighter shadow-sm">ALTA</span>
                                                                )}
                                                                {(plan?.status === 'cancelled' || apt.treatment_plans?.status === 'cancelled') && (
                                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-rose-700 text-white uppercase tracking-tighter shadow-sm">CANCELADO</span>
                                                                )}
                                                                {(apt.is_sus || plan?.is_sus || apt.patient?.is_sus || apt.treatment_plans?.is_sus) && (
                                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-blue-600 text-white uppercase tracking-tighter shadow-sm">SUS</span>
                                                                )}
                                                            </div>
                                                            {!isEvaluation && (
                                                                <div className="flex items-center gap-1">
                                                                    {plan?.is_paying && status !== 'missed' && status !== 'justified' && (
                                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm border flex items-center gap-1 ${dbAllocated > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'} `} title={dbAllocated > 0 ? 'Sessão Coberta pelo Saldo' : 'Sessão Pendente Mensalidade'}>
                                                                            {dbAllocated > 0 ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                                            <span>{dbAllocated > 0 ? 'PAGA' : 'PEND.'}</span>
                                                                        </span>
                                                                    )}
                                                                    {plan && plan.total_sessions !== 1 && (
                                                                        <span className="shrink-0 text-[9px] text-slate-500 font-black opacity-60 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 whitespace-nowrap min-w-max text-center">
                                                                            {getSessionNumber(plan.id, parseISO(apt.date))}/{plan.total_sessions || '-'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1.5 w-full mb-0.5">
                                                            <p className="text-xs font-black text-slate-900 truncate capitalize leading-tight flex-1">
                                                                {apt.patient?.name?.toLowerCase() || plan?.patient?.name?.toLowerCase()}
                                                            </p>
                                                        </div>

                                                        <p className="text-[9px] font-bold text-slate-400 truncate tracking-wide">{apt.specialty?.name || plan?.specialty?.name}</p>
                                                    </button>
                                                );
                                            } else {
                                                const plan = item.data;
                                                const status = getStatusForDay(plan as any, day);

                                                // Virtual allocation for projection
                                                const pool = visualCredits.get(plan.id) || 0;
                                                const price = plan.price_per_session || 0;
                                                const virtualAlloc = Math.min(pool, price);
                                                visualCredits.set(plan.id, Math.max(0, pool - virtualAlloc));

                                                return (
                                                    <button
                                                        key={plan.id}
                                                        onClick={() => setSelectedSlot({ plan: plan as any, date: day })}
                                                        className={`w-full text-left p-3 rounded-2xl border transition-all hover:scale-[1.02] active:scale-95 group relative ${status === 'attended' ? 'bg-emerald-50 border-emerald-100' :
                                                            status === 'missed' ? 'bg-rose-50 border-rose-100' :
                                                                status === 'justified' ? 'bg-amber-50 border-amber-200' :
                                                                    'bg-white border-slate-100 shadow-sm hover:border-indigo-200'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-indigo-300 shadow-sm transition-colors" />
                                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{plan.schedule_time?.slice(0, 5) || '--:--'}</p>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {plan.is_paying && (
                                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${virtualAlloc > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`} title={virtualAlloc > 0 ? 'Sessão Coberta pelo Saldo' : 'Sessão Pendente Mensalidade'}>
                                                                        {virtualAlloc > 0 ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                                        <span>{virtualAlloc > 0 ? 'PAGA' : 'PEND.'}</span>
                                                                    </span>
                                                                )}
                                                                {plan && plan.total_sessions !== 1 && (
                                                                    <span className="shrink-0 text-[9px] text-slate-500 font-black opacity-60 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 whitespace-nowrap min-w-max text-center">
                                                                        {getSessionNumber(plan.id, day)}/{plan.total_sessions || '-'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1.5 w-full mb-0.5">
                                                            <p className="text-xs font-black text-slate-900 truncate capitalize leading-tight flex-1 group-hover:text-indigo-600 transition-colors">
                                                                {plan.patient?.name.toLowerCase()}
                                                            </p>
                                                            {plan.status === 'alta' && (
                                                                <span className="shrink-0 text-[8px] bg-slate-700 text-white px-1.5 py-0.5 rounded font-black italic shadow-sm uppercase">ALTA</span>
                                                            )}
                                                            {(plan.is_sus || plan.patient?.is_sus) && (
                                                                <span className="shrink-0 text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-black italic shadow-sm">SUS</span>
                                                            )}
                                                        </div>

                                                        <p className="text-[9px] font-bold text-slate-300 truncate tracking-wide" title={`Dias: ${plan.schedule_days?.join(', ')}`}>{plan.specialty?.name} {plan.schedule_days?.join(', ')}</p>
                                                    </button>
                                                );
                                            }
                                        })
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div >
            </div >
        );
    };

    const calculateBalance = (plan: EnhancedPlan) => {
        const totalPaid = plan.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        // Use attendance_status for reliability. Skip evaluations as they are free.
        const attendedSessions = plan.sessions?.filter((s: any) => s.attendance_status === 'attended' && s.type !== 'Avaliação') || [];
        const costOfAttended = attendedSessions.length * (plan.price_per_session || 0);
        return parseFloat((totalPaid - costOfAttended).toFixed(2));
    };

    const handleGenerateFinancialReport = async (plan: EnhancedPlan) => {
        try {
            addToast('Gerando extrato...', 'info');
            const { data: fullPayments, error } = await supabase
                .from('therapy_payments')
                .select(`
                    *,
                    allocations:payment_allocations(
                        amount,
                        appointment:appointments(date)
                    )
                `)
                .eq('treatment_plan_id', plan.id)
                .order('payment_date', { ascending: false });

            if (error) throw error;

            generateFinancialDetailedReport({
                patientName: plan.patient?.name || 'Paciente',
                patientCpf: plan.patient?.cpf || '',
                payments: fullPayments || [],
                currentDate: currentDate
            });
        } catch (err) {
            console.error('Error generating report:', err);
            addToast('Erro ao gerar extrato.', 'error');
        }
    };

    const renderListView = () => {
        // Calculate range based on view - Default to weekly for 'list' as requested
        const isWeeklyMode = view === 'list' || view === 'weekly';
        const rangeStart = isWeeklyMode ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfMonth(currentDate);
        const rangeEnd = isWeeklyMode ? endOfWeek(rangeStart, { weekStartsOn: 1 }) : endOfMonth(rangeStart);

        const datesInRange: Date[] = [];
        let currentIter = rangeStart;
        while (currentIter <= rangeEnd) {
            datesInRange.push(new Date(currentIter));
            currentIter = addDays(currentIter, 1);
        }

        // Include 'completed' plans so that the counters in the headers match the actual agenda (showing all attended patients)
        const activePlans = filteredPlans.filter(p => p.status === 'active' || p.status === 'completed');

        if (activePlans.length === 0) {
            return (
                <div className="p-20 text-center bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                        <User size={40} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Nenhum paciente encontrado</h3>
                    <p className="text-slate-500 font-medium">Não há planos de tratamento ativos que correspondam aos filtros.</p>
                </div>
            );
        }

        return (
            <div className="space-y-6 pb-20">
                {datesInRange.map(date => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const dayOfWeekName = format(date, 'EEEE', { locale: ptBR });
                    const isWeekend = getDay(date) === 0 || getDay(date) === 6;

                    // Search for appointments on this date
                    const dayApts = appointmentsHistory.filter(a => a.date.startsWith(dateStr));
                    const visibleDayApts = dayApts.filter(a => a.attendance_status !== 'cancelled');

                    const dayProjections = activePlans.filter(p => {
                        if (!p.schedule_days?.includes(dayOfWeekName)) return false;
                        // B2. Suppress mathematical projection if an explicit appointment exists (even if cancelled/tombstone)
                        if (dayApts.some(a => a.treatment_plan_id === p.id)) return false;

                        // B3. Filtros de data (Start Date e Bloqueio de Passado)
                        if (p.start_date && compareAsc(parseISO(p.start_date), date) > 0) return false;
                        if (compareAsc(startOfDay(new Date()), startOfDay(date)) > 0) return false;
                        return true;
                    });

                    // Filter day appointments by active plans (respects doctor/search filters)
                    const filteredDayApts = visibleDayApts.filter(a => activePlans.some(p => p.id === a.treatment_plan_id));
                    
                    // Count unique patients per status to avoid overcounting duplicates
                    const attendedCount = new Set(filteredDayApts.filter(a => a.attendance_status === 'attended').map(a => a.treatment_plan_id)).size;
                    const missedCount = new Set(filteredDayApts.filter(a => a.attendance_status === 'missed').map(a => a.treatment_plan_id)).size;
                    const justifiedCount = new Set(filteredDayApts.filter(a => a.attendance_status === 'justified').map(a => a.treatment_plan_id)).size;

                    // Combine unique plan IDs
                    const planIdsOnThisDay = Array.from(new Set([
                        ...visibleDayApts.filter(a => activePlans.some(p => p.id === a.treatment_plan_id)).map(a => a.treatment_plan_id),
                        ...dayProjections.map(p => p.id)
                    ]));

                    if (planIdsOnThisDay.length === 0 || isWeekend) return null;

                    const dayKey = dateStr;
                    const isCollapsed = collapsedDays[dayKey];

                    return (
                        <div key={dayKey} className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden animate-in fade-in">
                            <button
                                onClick={() => toggleDayCollapse(dayKey)}
                                className={`w-full flex items-center justify-between p-6 transition-colors border-b border-slate-100 ${isSameDay(date, new Date()) ? 'bg-indigo-50/50' : 'bg-slate-50/30'} hover:bg-slate-50`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSameDay(date, new Date()) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-indigo-100 text-indigo-600'}`}>
                                        <CalendarDays size={20} />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                                            {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            {isSameDay(date, new Date()) && (
                                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Atendimentos de Hoje</span>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-slate-400 capitalize">
                                                    {planIdsOnThisDay.length} {planIdsOnThisDay.length === 1 ? 'agendado' : 'agendados'}
                                                </span>
                                                {(attendedCount > 0 || missedCount > 0 || justifiedCount > 0) && (
                                                    <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
                                                        {attendedCount > 0 && (
                                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100/50">
                                                                {attendedCount} {attendedCount === 1 ? 'presença' : 'presenças'}
                                                            </span>
                                                        )}
                                                        {missedCount > 0 && (
                                                            <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100/50">
                                                                {missedCount} {missedCount === 1 ? 'falta' : 'faltas'}
                                                            </span>
                                                        )}
                                                        {justifiedCount > 0 && (
                                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded-lg border border-amber-100/50">
                                                                {justifiedCount} {justifiedCount === 1 ? 'justificada' : 'justificadas'}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate('/agendamentos', {
                                                state: {
                                                    action: 'new',
                                                    targetTab: 'sessao',
                                                    preSelectedDate: format(date, 'yyyy-MM-dd'),
                                                    returnTo: '/agendamentos/sessoes',
                                                    selectedDoctorId: selectedDoctorId
                                                }
                                            });
                                        }}
                                        className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100 shadow-sm flex items-center gap-1.5 group/add"
                                        title="Agendar novo paciente para este dia"
                                    >
                                        <Plus size={16} strokeWidth={3} className="transition-transform group-hover/add:rotate-90" />
                                        <span className="text-[10px] font-black uppercase tracking-widest pr-1">Agendar</span>
                                    </button>
                                    <div className={`transform transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                                        <ChevronLeft size={24} className="text-slate-400 rotate-[-90deg]" />
                                    </div>
                                </div>
                            </button>

                            {!isCollapsed && (
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
                                    {planIdsOnThisDay
                                        .map(id => activePlans.find(p => p.id === id))
                                        .filter((p): p is EnhancedPlan => !!p)
                                        .sort((a, b) => (a.schedule_time || '').localeCompare(b.schedule_time || ''))
                                        .map(plan => {
                                            const balance = calculateBalance(plan);
                                            const planHistory = appointmentsHistory.filter(a => a.treatment_plan_id === plan.id);
                                            const attended = planHistory.filter(a => a.attendance_status === 'attended' && a.type !== 'Avaliação').length;
                                            const totals = plan.total_sessions || 0;
                                            const remaining = totals - attended;
                                            const missedCount = planHistory.filter(a => a.attendance_status === 'missed').length;
                                            const justifiedCount = planHistory.filter(a => a.attendance_status === 'justified').length;

                                            const targetApt = dayApts.find(a => a.treatment_plan_id === plan.id);
                                            const status = targetApt?.attendance_status || null;

                                            const statusClasses =
                                                status === 'attended' ? 'bg-emerald-50 border-emerald-200 shadow-emerald-100/50' :
                                                    status === 'missed' ? 'bg-rose-50 border-rose-200 shadow-rose-100/50' :
                                                        status === 'justified' ? 'bg-amber-50 border-amber-200 shadow-amber-100/50' :
                                                            'bg-white border-slate-100 shadow-sm';

                                            const isMenuOpen = openMenuId === `${dayKey}-${plan.id}`;

                                            return (
                                                <div key={plan.id} className={`rounded-2xl p-4 border transition-all relative ${statusClasses} ${!status ? 'hover:border-indigo-200 hover:shadow-md' : 'shadow-md shadow-opacity-10'}`}>
                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-black text-slate-900 uppercase text-xs leading-tight mb-0.5 flex items-center gap-1.5" title={plan.patient?.name}>
                                                                <span className="truncate">{plan.patient?.name}</span>
                                                                {plan.status === 'alta' && (
                                                                    <span className="flex-shrink-0 bg-slate-700 text-white text-[7px] px-1 rounded shadow-sm border border-slate-800">ALTA</span>
                                                                )}
                                                                {(plan.patient?.is_sus || plan.is_sus) && (
                                                                    <span className="flex-shrink-0 bg-blue-600 text-white text-[7px] px-1 rounded shadow-sm border border-blue-700">SUS</span>
                                                                )}
                                                            </h4>
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">
                                                                {plan.specialty?.name} • {plan.doctor?.name?.split(' ')[0] || 'Geral'}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg shadow-sm border ${balance > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : balance < 0 ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`} title="Saldo na Carteira">
                                                                <CreditCard size={12} className={balance > 0 ? 'text-emerald-500' : balance < 0 ? 'text-rose-500' : 'text-slate-400'} />
                                                                <div className="flex flex-col items-end leading-none">
                                                                    <span className="text-[7px] font-black uppercase tracking-widest opacity-70">Saldo</span>
                                                                    <span className="text-[10px] font-black tracking-tight">R$ {balance.toFixed(2).replace('.', ',')}</span>
                                                                </div>
                                                            </div>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{plan.schedule_time?.slice(0, 5) || '--:--'}</p>
                                                        </div>
                                                    </div>

                                                    <div className="bg-slate-50/50 rounded-xl p-2.5 mb-3 flex items-center justify-between border border-slate-100/50">
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Presenças</span>
                                                            <span className="text-xs font-black text-slate-700">{attended} / {totals}</span>
                                                        </div>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Faltas</span>
                                                            <span className={`text-xs font-black ${missedCount > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{missedCount}</span>
                                                        </div>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Justif.</span>
                                                            <span className={`text-xs font-black ${justifiedCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{justifiedCount}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Restam</span>
                                                            <span className="text-xs font-black text-indigo-600">{remaining}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleGenerateFinancialReport(plan)}
                                                            className="flex-1 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
                                                            title="Extrato Financeiro"
                                                        >
                                                            <DollarSign size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleRecordAttendance(plan.id, date, status === 'attended' ? null : 'attended');
                                                            }}
                                                            className={`flex-1 h-9 rounded-xl flex items-center justify-center transition-all border ${status === 'attended' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white'}`}
                                                            title="Marcar Presença"
                                                        >
                                                            <CheckCircle2 size={16} />
                                                        </button>
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setOpenMenuId(isMenuOpen ? null : `${dayKey}-${plan.id}`)}
                                                                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${isMenuOpen ? 'bg-slate-800 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'}`}
                                                            >
                                                                <MoreVertical size={16} />
                                                            </button>
                                                            {isMenuOpen && (
                                                                <>
                                                                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)}></div>
                                                                    <div className="absolute bottom-full right-0 mb-2 w-36 bg-white rounded-xl shadow-2xl border border-slate-100 py-1 z-20 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                                                        <button
                                                                            onClick={() => { handleRecordAttendance(plan.id, date, status === 'missed' ? null : 'missed'); setOpenMenuId(null); }}
                                                                            className={`w-full text-left px-3 py-2 text-[10px] font-bold flex items-center gap-2 ${status === 'missed' ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                                                                        >
                                                                            <XCircle size={14} /> Faltou
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { handleRecordAttendance(plan.id, date, status === 'justified' ? null : 'justified'); setOpenMenuId(null); }}
                                                                            className={`w-full text-left px-3 py-2 text-[10px] font-bold flex items-center gap-2 ${status === 'justified' ? 'bg-amber-600 text-white' : 'text-amber-600 hover:bg-amber-50'}`}
                                                                        >
                                                                            <AlertCircle size={14} /> Justificado
                                                                        </button>
                                                                        {planHistory.filter(a => a.attendance_status !== 'cancelled' && a.type !== 'Avaliação').length > (plan.total_sessions || 0) && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setConfirmModal({
                                                                                        isOpen: true,
                                                                                        planId: plan.id,
                                                                                        action: 'bulk_exceeded',
                                                                                        title: 'Limpar Extras',
                                                                                        message: `Deseja remover as sessões que excedem o limite de ${plan.patient?.name.split(' ')[0]}?`
                                                                                    });
                                                                                    setOpenMenuId(null);
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                                                            >
                                                                                <X size={14} /> Corrigir Sessões (Limpar Extras)
                                                                            </button>
                                                                        )}
                                                                        <div className="h-px bg-slate-50 my-1"></div>
                                                                        <button
                                                                            onClick={() => { setConfirmModal({ isOpen: true, planId: plan.id, action: 'delete', title: 'Excluir Plano', message: 'Tem certeza que deseja excluir este plano?' }); setOpenMenuId(null); }}
                                                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-slate-400 hover:bg-slate-50 flex items-center gap-2"
                                                                        >
                                                                            <Trash2 size={14} /> Excluir Plano
                                                                        </button>
                                                                        <button
                                                                            onClick={async () => {
                                                                                setConfirmModal({ isOpen: true, planId: plan.id, action: 'discharge', title: 'Dar Alta', message: `Deseja realmente dar ALTA para ${plan.patient?.name.split(' ')[0]}?` });
                                                                                setOpenMenuId(null);
                                                                            }}
                                                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"
                                                                        >
                                                                            <Activity size={14} /> Dar Alta
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };


    return (
        <div className="max-w-7xl mx-auto pb-32 px-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Gestão de Sessões <span className="text-[10px] text-slate-300 font-normal">v3.0.1</span></h1>
                        <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Therapy Core</div>
                    </div>
                    <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-[0.2em]">Controle de Planos e Atendimentos</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setView('weekly')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'weekly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                            <div className="flex items-center gap-2"><CalendarIcon size={14} /><span className="hidden sm:inline">Agenda</span></div>
                        </button>
                        <button onClick={() => setView('calendar')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                            <div className="flex items-center gap-2"><CalendarIcon size={14} /><span className="hidden sm:inline">Calendário</span></div>
                        </button>
                        <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                            <div className="flex items-center gap-2"><Activity size={14} /><span className="hidden sm:inline">Lista</span></div>
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Reparar moved to settings */}
                        <button onClick={() => generateMonthlyReport(appointments, currentDate)} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-2">
                            <Printer size={14} /><span className="hidden sm:inline">Relatório Geral</span>
                        </button>
                        <button onClick={() => setFinancialModalOpen(true)} className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2">
                            <CreditCard size={14} /><span className="hidden sm:inline">Financeiro</span>
                        </button>
                        {isAdmin && (
                            <button
                                onClick={async () => {
                                    setConfirmModal({
                                        isOpen: true,
                                        planId: null,
                                        action: 'bulk_exceeded',
                                        title: 'Limpar Fantasmas (Ação Global)',
                                        message: 'ATENÇÃO: Deseja remover TODOS os agendamentos que excedem o limite de TODOS os pacientes ativos na clínica? Esta ação não pode ser desfeita.'
                                    });
                                }}
                                className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2"
                                title="Limpar agendamentos 'fantasmas' (que excedem o limite do plano)"
                            >
                                <Trash2 size={14} />
                                <span className="hidden sm:inline">Limpar Fantasmas</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Sub-Header / Filters - Sticky */}
            <div className="sticky top-4 z-40 flex flex-col md:flex-row gap-4 mb-8 bg-slate-50/80 backdrop-blur-md p-4 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/20">
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setCurrentDate(view === 'weekly' || view === 'list' ? subDays(currentDate, 7) : subMonths(currentDate, 1))}
                        className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg transition-colors"
                        title={view === 'weekly' || view === 'list' ? 'Semana Anterior' : 'Mês Anterior'}
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <button
                        onClick={() => setCurrentDate(new Date())}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-200 hover:bg-indigo-500 hover:scale-105 active:scale-95 disabled:opacity-50"
                        disabled={isLoadingAppointments}
                    >
                        {isLoadingAppointments ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {isLoadingAppointments ? 'Carregando...' : 'Hoje'}
                    </button>

                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight min-w-[140px] text-center">
                        {view === 'weekly' || view === 'list'
                            ? `Semana de ${format(weekDays[0], 'dd/MM', { locale: ptBR })}`
                            : format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                    </h2>

                    <button
                        onClick={() => setCurrentDate(view === 'weekly' || view === 'list' ? addDays(currentDate, 7) : addMonths(currentDate, 1))}
                        className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg transition-colors"
                        title={view === 'weekly' || view === 'list' ? 'Próxima Semana' : 'Próximo Mês'}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className="flex gap-2 min-w-[240px]">
                    <SearchableSelect
                        value={selectedDoctorId}
                        onChange={(val) => {
                            setSelectedDoctorId(val);
                            localStorage.setItem('agenda_doctor_filter', val);
                        }}
                        placeholder="Médico (Todos)"
                        options={[
                            { value: 'all', label: 'Todos os Médicos' },
                            ...uniqueDoctors.map(doc => ({ value: doc.id, label: doc.name }))
                        ]}
                    />
                </div>



                <div className="relative flex-1">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar paciente ou CPF..."
                        className="w-full pl-14 pr-6 py-4 bg-white border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 outline-none font-bold text-slate-700"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Content Rendering */}
            {view === 'weekly' ? renderWeeklyAgenda() : view === 'calendar' ? renderCalendar() : renderListView()}

            {selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={(e) => e.target === e.currentTarget && closeAllModals()}>
                    <div ref={modalRef} className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                    <User size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-black text-slate-900 capitalize leading-tight">{selectedSlot.plan.patient?.name.toLowerCase()}</h3>
                                        <button
                                            onClick={async () => {
                                                const patientId = selectedSlot.plan.patient_id;
                                                const currentSus = selectedSlot.plan.patient?.is_sus || selectedSlot.plan.is_sus;
                                                const newStatus = !currentSus;

                                                try {
                                                    // Global Sync: Update Patient
                                                    const { error: pError } = await supabase.from('patients').update({ is_sus: newStatus }).eq('id', patientId);
                                                    if (pError) throw pError;

                                                    // Sync Plan
                                                    await supabase.from('treatment_plans').update({ is_sus: newStatus }).eq('id', selectedSlot.plan.id);

                                                    // Sync all Appointments for this patient
                                                    await supabase.from('appointments').update({ is_sus: newStatus }).eq('patient_id', patientId);

                                                    addToast(`Status SUS de ${selectedSlot.plan.patient?.name.split(' ')[0]} atualizado!`, 'success');
                                                    fetchPlans();
                                                    fetchAppointments();

                                                    // Update local state for immediate feedback in modal
                                                    setSelectedSlot(prev => prev ? { ...prev, plan: { ...prev.plan, is_sus: newStatus, patient: prev.plan.patient ? { ...prev.plan.patient, is_sus: newStatus } : undefined } } : null);
                                                } catch (e) {
                                                    console.error(e);
                                                    addToast('Erro ao sincronizar status SUS.', 'error');
                                                }
                                            }}
                                            className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-all border ${(selectedSlot.plan.patient?.is_sus || selectedSlot.plan.is_sus) ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 hover:opacity-100'}`}
                                            title="Alternar Status SUS do Paciente"
                                        >
                                            SUS
                                        </button>
                                        {selectedSlot.plan.patient?.is_blocked ? (
                                            <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest animate-pulse flex items-center gap-1">
                                                <AlertCircle size={10} /> BLOQUEADO
                                            </span>
                                        ) : (selectedSlot.plan.patient?.unexcused_absences || 0) >= 2 ? (
                                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border border-amber-200">
                                                <AlertCircle size={10} /> LIMITE DE FALTAS
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(selectedSlot.date, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
                                </div>
                            </div>

                            {/* Auto-Repair Sync Inconsistency Logic */}
                            {(() => {
                                const planSus = selectedSlot.plan.is_sus;
                                const patientSus = selectedSlot.plan.patient?.is_sus;
                                const patientId = selectedSlot.plan.patient_id;

                                if (planSus && !patientSus && patientId) {
                                    // Silent repair: If plan is SUS but patient is not, sync it.
                                    supabase.from('patients').update({ is_sus: true }).eq('id', patientId).then(({ error }) => {
                                        if (!error) {
                                            console.log('Auto-repaired SUS status for patient', patientId);
                                            // We don't toast to avoid annoyance, but next refresh will show it.
                                        }
                                    });
                                }
                                return null;
                            })()}
                            <button onClick={closeModal} className="p-2 text-slate-300 hover:text-rose-500"><X size={20} /></button>
                        </div>
                        {selectedSlot.plan.patient?.is_blocked && (
                            <div className="mx-6 mb-4 p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-3 animate-in slide-in-from-top-2">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                    <AlertCircle size={18} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-black text-rose-900 text-[10px] uppercase tracking-wider">Paciente Bloqueado</h4>
                                    <p className="text-rose-700 text-[9px] font-medium leading-tight mt-0.5">
                                        Atingiu o limite de faltas e está bloqueado para novos agendamentos e atendimentos.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Content Area */}
                        {isRescheduling ? (
                            <div className="p-6 relative animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                                        Reagendamento Rápido
                                    </h3>
                                    <button 
                                        onClick={() => { fetchHistory(selectedSlot.plan.patient_id); setIsHistoryModalOpen(true); }}
                                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-all"
                                    >
                                        <HistoryIcon size={12} /> Ver Histórico
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nova Data</label>
                                            <ModernDatePicker
                                                value={rescheduleDate}
                                                onChange={(date) => setRescheduleDate(date)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Novo Horário</label>
                                            <input
                                                type="time"
                                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg outline-none font-bold text-sm text-slate-700 focus:border-indigo-500 transition-colors"
                                                value={rescheduleTime}
                                                onChange={(e) => setRescheduleTime(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Patient Upcoming Appointments & Conflict Check */}
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        <PatientUpcomingAppointments 
                                            patientId={selectedSlot.plan.patient_id} 
                                            currentSelection={rescheduleDate ? new Date(rescheduleDate + 'T' + (rescheduleTime || '00:00')) : null}
                                            onConflict={setHasConflict}
                                            allowedSpecialties={ALLOWED_TREATMENT_SPECIALTIES}
                                        />
                                        
                                        {hasConflict && (
                                            <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 animate-pulse">
                                                <AlertCircle size={16} className="text-rose-500" />
                                                <p className="text-[10px] font-black text-rose-700 uppercase tracking-tight">
                                                    Atenção: O paciente já possui agendamento nesta data!
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 pt-2">
                                        <button
                                            onClick={() => {
                                                setIsRescheduling(false);
                                                setRescheduleDate('');
                                            }}
                                            className="flex-1 py-3 rounded-xl font-bold text-xs text-slate-500 hover:bg-slate-100 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (!rescheduleDate) return addToast('Selecione uma data.', 'error');
                                                if (!rescheduleTime) return addToast('Selecione um horário.', 'error');
                                                const [hours, minutes] = rescheduleTime.split(':');
                                                const [y, m, d] = rescheduleDate.split('-');
                                                const newDateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(hours), parseInt(minutes));
                                                
                                                if (hasConflict) {
                                                    if (!window.confirm('Este paciente já possui agendamento neste dia. Deseja confirmar mesmo assim?')) return;
                                                }
                                                
                                                handleReschedule(selectedSlot.plan, selectedSlot.date, newDateObj);
                                            }}
                                            className="flex-1 py-3 rounded-xl font-black text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle2 size={16} />
                                            Confirmar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="p-6 space-y-6">
                                    {/* Attendance Section */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5"><Clock size={14} />Presença</h4>

                                            {/* Action Menu (Reagendar, Editar, Excluir) */}
                                            <div className="flex gap-1">
                                                <button title="Reagendar" onClick={() => {
                                                    setRescheduleTime(selectedSlot.plan.schedule_time?.slice(0, 5) || '08:00');
                                                    setIsRescheduling(true);
                                                }} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"><CalendarIcon size={16} /></button>
                                                <button title="Editar Ficha" onClick={() => {
                                                    const apt = appointments.find(a => a.treatment_plan_id === selectedSlot.plan.id && isSameDay(parseISO(a.date), selectedSlot.date));
                                                    if (apt) { setEditModeData({ ...apt, treatment_plans: selectedSlot.plan }); setIsEditModalOpen(true); }
                                                    else { setEditModeData({ type: 'Sessão', patient_id: selectedSlot.plan.patient_id, doctor_id: selectedSlot.plan.doctor_id, specialty_id: selectedSlot.plan.specialty_id, date: selectedSlot.date.toISOString(), treatment_plan_id: selectedSlot.plan.id, treatment_plans: selectedSlot.plan }); setIsEditModalOpen(true); }
                                                    setSelectedSlot(null);
                                                }} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                                                <button title="Excluir Registro" onClick={() => setConfirmModal({ isOpen: true, planId: selectedSlot.plan.id, action: 'delete_appointment', aptDate: selectedSlot.date, title: 'Excluir Agendamento', message: 'Deseja realmente excluir este registro?' })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            {(() => {
                                                const apt = appointments.find(a => a.treatment_plan_id === selectedSlot.plan.id && isSameDay(parseISO(a.date), selectedSlot.date));
                                                const currentStatus = (apt as any)?.attendance_status || apt?.status;

                                                return (
                                                    <>
                                                        <button
                                                            disabled={actionLoading}
                                                            onClick={() => handleRecordAttendance(selectedSlot.plan.id, selectedSlot.date, currentStatus === 'attended' ? null : 'attended')}
                                                            className={`py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${currentStatus === 'attended' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200 hover:bg-emerald-50/50'} ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                            <CheckCircle2 size={20} />
                                                            <span className="text-[10px] font-black uppercase">Sim</span>
                                                        </button>
                                                        <button
                                                            disabled={actionLoading}
                                                            onClick={() => handleRecordAttendance(selectedSlot.plan.id, selectedSlot.date, currentStatus === 'missed' ? null : 'missed')}
                                                            className={`py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${currentStatus === 'missed' ? 'bg-rose-50 border-rose-200 text-rose-600 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-rose-200 hover:bg-rose-50/50'} ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                            <XCircle size={20} />
                                                            <span className="text-[10px] font-black uppercase">Faltou</span>
                                                        </button>
                                                        <button
                                                            disabled={actionLoading}
                                                            onClick={() => handleRecordAttendance(selectedSlot.plan.id, selectedSlot.date, currentStatus === 'justified' ? null : 'justified')}
                                                            className={`py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${currentStatus === 'justified' ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-amber-200 hover:bg-amber-50/50'} ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                            <AlertCircle size={20} />
                                                            <span className="text-[10px] font-black uppercase">Justif.</span>
                                                        </button>
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        {/* Manual Discharge (Alta) Button */}
                                        <div className="flex flex-col gap-2">
                                            {(selectedSlot.plan.status === 'completed' || selectedSlot.plan.status === 'cancelled') ? (
                                                <button
                                                    disabled={actionLoading}
                                                    onClick={async () => {
                                                        setConfirmModal({ isOpen: true, planId: selectedSlot.plan.id, action: 'reactivate_plan', aptDate: selectedSlot.date, title: 'Reativar Plano', message: 'Deseja reverter a alta/cancelamento e reativar as sessões do paciente (status "ativo")?' });
                                                    }}
                                                    className={`w-full py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm flex items-center justify-center gap-2 ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                    <RotateCcw size={14} /> Reverter Alta/Cancelamento
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        disabled={actionLoading}
                                                        onClick={async () => {
                                                            setConfirmModal({ isOpen: true, planId: selectedSlot.plan.id, action: 'discharge', title: 'Dar Alta', message: `Deseja realmente dar ALTA para ${selectedSlot.plan.patient?.name.split(' ')[0]}?` });
                                                        }}
                                                        className={`w-full py-3 rounded-xl bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg flex items-center justify-center gap-2 ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                        <Activity size={16} /> Dar Alta (Encerrar Plano)
                                                    </button>
                                                    <button
                                                        disabled={actionLoading}
                                                        onClick={async () => {
                                                            setConfirmModal({ isOpen: true, planId: selectedSlot.plan.id, action: 'cancel_plan_sessions', aptDate: selectedSlot.date, title: 'Cancelar Sessões', message: `Tem certeza que deseja cancelar todas as sessões futuras não realizadas deste plano?` });
                                                        }}
                                                        className={`w-full py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all shadow-sm flex items-center justify-center gap-2 ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                        <XCircle size={14} /> Cancelar Restantes
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="w-full h-px bg-slate-100"></div>

                                    {/* Payment Section - Wallet Overhaul */}
                                    <div className="flex flex-col gap-3">
                                        {(() => {
                                            const apt = appointments.find(a => a.treatment_plan_id === selectedSlot.plan.id && isSameDay(parseISO(a.date), selectedSlot.date));
                                            const isEvaluation = apt?.type === 'Avaliação';
                                            const allocated = apt?.allocations?.reduce((sum: number, a: any) => sum + (a.amount || 0), 0) || 0;

                                            // The "Wallet Balance" is the sum of all payments minus the cost of all ATTENDED non-evaluation sessions.
                                            // We already have `calculateBalance` defined!
                                            const walletBalance = calculateBalance(selectedSlot.plan);
                                            const currentSessionPrice = Number(sessionPrice) || 0;
                                            const isFullyPaid = allocated >= currentSessionPrice && currentSessionPrice > 0;
                                            const isPartiallyPaid = allocated > 0 && allocated < currentSessionPrice;

                                            // Is it using credits from the wallet right now?
                                            // If it's not attended yet, the allocated amount IS the credit reserved for it.

                                            return (
                                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                                                <CreditCard size={14} />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Carteira do Paciente</h4>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Saldo e Créditos</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Saldo Atual</p>
                                                            <p className={`text-lg font-black leading-none ${walletBalance > 0 ? 'text-emerald-600' : walletBalance < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                                                R$ {walletBalance.toFixed(2).replace('.', ',')}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-4 items-center">
                                                        <div className="flex-1 space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Custo desta Sessão</label>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                                                                <input
                                                                    type="number"
                                                                    className="w-full pl-7 pr-2 py-2 bg-white border border-slate-200 rounded-lg outline-none font-bold text-sm text-slate-700 focus:border-indigo-500 transition-colors"
                                                                    placeholder="0,00"
                                                                    value={sessionPrice}
                                                                    onChange={e => setSessionPrice(e.target.value)}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Status da Sessão</label>
                                                            {isEvaluation ? (
                                                                <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg flex items-center justify-center gap-1 border border-emerald-100 shadow-sm">
                                                                    <CheckCircle2 size={14} />
                                                                    <span className="text-[9px] font-black uppercase tracking-tight">Avaliação (Isenta)</span>
                                                                </div>
                                                            ) : isFullyPaid ? (
                                                                <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg flex items-center justify-center gap-1 border border-emerald-100 shadow-sm">
                                                                    <CheckCircle2 size={14} />
                                                                    <span className="text-[9px] font-black uppercase tracking-tight">Paga (Tem Crédito)</span>
                                                                </div>
                                                            ) : isPartiallyPaid ? (
                                                                <div className="bg-amber-50 text-amber-600 p-2 rounded-lg flex flex-col items-center justify-center gap-0.5 border border-amber-100 shadow-sm">
                                                                    <span className="text-[9px] font-black uppercase tracking-tight">Parcial (R${allocated})</span>
                                                                    <span className="text-[8px] font-bold uppercase opacity-80">Falta R${(currentSessionPrice - allocated).toFixed(2)}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="bg-slate-100 text-slate-500 p-2 rounded-lg flex flex-col items-center justify-center gap-0.5 border border-slate-200">
                                                                    <span className="text-[9px] font-black uppercase tracking-tight">Pendente</span>
                                                                    <span className="text-[8px] font-bold uppercase opacity-80">Sem Crédito</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="pt-2 border-t border-slate-200/60 mt-1">
                                                        <details className="group">
                                                            <summary className="flex items-center justify-center gap-1.5 cursor-pointer list-none text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 mx-auto w-max group-open:mb-4 transition-all">
                                                                <Plus size={14} className="group-open:rotate-45 transition-transform" />
                                                                Adicionar Fundos na Carteira
                                                            </summary>

                                                            <div className="flex items-end gap-3 p-3 bg-white rounded-xl border border-indigo-100 shadow-sm animate-in slide-in-from-top-2">
                                                                <div className="flex-1 space-y-1.5">
                                                                    <label className="text-[9px] font-black text-indigo-900/40 uppercase tracking-widest block">Receber Valor</label>
                                                                    <div className="relative">
                                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-300 font-bold text-xs">R$</span>
                                                                        <input
                                                                            type="number"
                                                                            className="w-full pl-7 pr-2 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-lg outline-none font-black text-sm text-indigo-900 placeholder:text-indigo-300"
                                                                            placeholder="Ex: 150,00"
                                                                            value={paymentAmount}
                                                                            onChange={e => setPaymentAmount(e.target.value)}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="flex-1 space-y-1.5 flex flex-col">
                                                                    <label className="text-[9px] font-black text-indigo-900/40 uppercase tracking-widest block opacity-0 select-none">Forma</label>
                                                                    <div className="flex bg-slate-100 p-1 rounded-lg h-[42px]">
                                                                        {['pix', 'credito', 'debito'].map(m => (
                                                                            <button key={m} onClick={() => setPaymentMethod(m as any)} className={`flex-1 rounded text-[9px] font-black uppercase transition-all ${paymentMethod === m ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                                                                                {m === 'credito' ? 'Créd.' : m === 'debito' ? 'Déb.' : 'Pix'}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    onClick={() => handleRecordPayment(selectedSlot.plan.id)}
                                                                    disabled={!paymentAmount || Number(paymentAmount) <= 0 || actionLoading}
                                                                    className="h-[42px] px-4 rounded-lg bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                                >
                                                                    Depositar
                                                                </button>
                                                            </div>
                                                        </details>
                                                    </div>

                                                    {/* Payment History */}
                                                    {selectedSlot.plan.payments && selectedSlot.plan.payments.length > 0 && (
                                                        <div className="pt-2 border-t border-slate-200/60">
                                                            <details className="group">
                                                                <summary className="flex items-center justify-center gap-1.5 cursor-pointer list-none text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 mx-auto w-max group-open:mb-3 transition-all">
                                                                    <div className="w-4 flex items-center justify-center">
                                                                        <ChevronLeft size={12} className="group-open:-rotate-90 transition-transform" />
                                                                    </div>
                                                                    Histórico de Entradas
                                                                </summary>
                                                                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 animate-in slide-in-from-top-2">
                                                                    {[...selectedSlot.plan.payments].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).map((p: any) => (
                                                                        <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 shadow-sm group/item">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[10px] font-black text-slate-700">R$ {Number(p.amount).toFixed(2).replace('.', ',')}</span>
                                                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                                                    {p.payment_date ? format(parseISO(p.payment_date), 'dd/MM/yyyy') : 'Data não informada'} •
                                                                                    <span className="text-indigo-500">{p.payment_method}</span>
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handleDeletePayment(p.id, selectedSlot.plan.id)}
                                                                                disabled={actionLoading}
                                                                                title="Excluir Entrada"
                                                                                className="w-6 h-6 rounded-md bg-rose-50 text-rose-400 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover/item:opacity-100 disabled:opacity-50"
                                                                            >
                                                                                <Trash2 size={12} strokeWidth={3} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                                    <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 font-black text-[10px] uppercase hover:bg-slate-50 flex items-center gap-2" onClick={() => generateSessionControlPDF({ patientName: selectedSlot.plan.patient?.name || '', patientCpf: selectedSlot.plan.patient?.cpf, specialty: selectedSlot.plan.specialty?.name || '', doctorName: selectedSlot.plan.doctor?.name || 'Geral', month: startOfMonth(selectedSlot.date), scheduleDays: selectedSlot.plan.schedule_days || [] })}>
                                        <FileText size={14} />Gerar Controle
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )
            }

            <FinancialControlModal isOpen={financialModalOpen} onClose={() => setFinancialModalOpen(false)} onBackdropClick={closeAllModals} />
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false, planId: null, action: 'delete' })}
                onConfirm={
                    (confirmModal.action === 'discharge' || confirmModal.action === 'reactivate_plan') ? executeDischargePlan :
                        confirmModal.action === 'bulk_exceeded' ? executeBulkExceeded :
                            // Using type checks since aptDate might be null depending on action but definitely populated here
                            confirmModal.action === 'delete_appointment' && confirmModal.planId && confirmModal.aptDate ? () => handleDeleteAppointment(confirmModal.planId!, confirmModal.aptDate!) :
                                confirmModal.action === 'cancel_plan_sessions' && confirmModal.planId && confirmModal.aptDate ? () => handleCancelFutureSessions(confirmModal.planId!, confirmModal.aptDate!) :
                                    confirmModal.action === 'bulk_cancel' ? handleBulkCancelPlanSessions :
                                        executeDeletePlan
                }
                title={confirmModal.title || "Confirmar Ação"}
                message={confirmModal.message || "Tem certeza?!"}
                type={confirmModal.action === 'discharge' ? 'info' : confirmModal.action === 'reactivate_plan' ? 'info' : confirmModal.action === 'bulk_exceeded' ? 'warning' : 'danger'}
                confirmText={confirmModal.action === 'discharge' ? 'Dar Alta' : confirmModal.action === 'reactivate_plan' ? 'Reativar' : 'Confirmar'}
                onBackdropClick={closeAllModals}
            />
            {
                isEditModalOpen && (
                    <AppointmentModal
                        isOpen={isEditModalOpen}
                        onClose={closeModal}
                        mode={editModeData?.id ? 'edit' : 'create'}
                        initialType={editModeData?.type || "Sessão"}
                        initialData={editModeData}
                        onSuccess={() => {
                            fetchAppointments();
                            fetchPlans();
                            closeModal();
                        }}
                        onBackdropClick={closeAllModals}
                    />
                )
            }

            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={closeAllModals}>
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                    <HistoryIcon size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Histórico de Agendamentos</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registros completos do paciente</p>
                                </div>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 text-slate-300 hover:text-rose-500"><X size={20} /></button>
                        </div>

                        <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar">
                            {patientHistoryLoading ? (
                                <div className="py-20 text-center">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-indigo-600" />
                                </div>
                            ) : patientHistoryData.length === 0 ? (
                                <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhum registro encontrado</div>
                            ) : (
                                <div className="space-y-3">
                                    {patientHistoryData.map((apt) => (
                                        <div key={apt.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-center justify-center w-12 h-12 bg-white rounded-xl border border-slate-100 shadow-sm">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">{format(parseISO(apt.date), 'MMM', { locale: ptBR })}</span>
                                                    <span className="text-lg font-black text-slate-800 leading-none">{format(parseISO(apt.date), 'dd')}</span>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-slate-700 text-sm">{format(parseISO(apt.date), 'HH:mm')}</span>
                                                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${apt.attendance_status === 'attended' ? 'bg-emerald-100 text-emerald-700' :
                                                            apt.attendance_status === 'missed' ? 'bg-rose-100 text-rose-700' :
                                                                apt.attendance_status === 'justified' ? 'bg-amber-100 text-amber-700' :
                                                                    apt.attendance_status === 'cancelled' ? 'bg-slate-200 text-slate-500' :
                                                                        'bg-indigo-50 text-indigo-600'
                                                            }`}>
                                                            {apt.attendance_status === 'attended' ? 'Compareceu' :
                                                                apt.attendance_status === 'missed' ? 'Faltou' :
                                                                    apt.attendance_status === 'justified' ? 'Justificou' :
                                                                        apt.attendance_status === 'cancelled' ? 'Cancelou' : 'Agendado'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                                                        {(apt as any).doctor?.name} • {(apt as any).specialty?.name}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{apt.type}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setIsHistoryModalOpen(false)} className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all">Fechar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Actions Bar */}
            {selectedApts.length > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selecionados</span>
                        <span className="text-xl font-black">{selectedApts.length}</span>
                    </div>
                    <div className="h-10 w-px bg-slate-800" />
                    <div className="flex items-center gap-2">
                        {(() => {
                            const selectedAptDetails = selectedApts.map(id => appointments.find(a => a.id === id)).filter(Boolean);
                            const allAttended = selectedAptDetails.length > 0 && selectedAptDetails.every(a => a?.attendance_status === 'attended');
                            const allMissed = selectedAptDetails.length > 0 && selectedAptDetails.every(a => a?.attendance_status === 'missed');
                            const allJustified = selectedAptDetails.length > 0 && selectedAptDetails.every(a => a?.attendance_status === 'justified');

                            return (
                                <>
                                    <button onClick={() => handleBulkAttendance(allAttended ? null : 'attended')} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${allAttended ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 scale-105' : 'bg-emerald-600/50 hover:bg-emerald-500'}`}>Presença</button>
                                    <button onClick={() => handleBulkAttendance(allMissed ? null : 'missed')} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${allMissed ? 'bg-rose-500 shadow-lg shadow-rose-500/50 scale-105' : 'bg-rose-600/50 hover:bg-rose-500'}`}>Falta</button>
                                    <button onClick={() => handleBulkAttendance(allJustified ? null : 'justified')} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${allJustified ? 'bg-amber-500 shadow-lg shadow-amber-500/50 scale-105' : 'bg-amber-600/50 hover:bg-amber-500'}`}>Justificar</button>
                                    <div className="h-6 w-px bg-slate-700 mx-1" />
                                    <button onClick={() => setConfirmModal({ isOpen: true, planId: null, action: 'bulk_cancel', title: 'Cancelar Sessões em Massa', message: 'Deseja realmente cancelar todos os ' + selectedApts.length + ' agendamentos selecionados de uma vez?' })} className="px-4 py-2 bg-slate-800/80 hover:bg-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all text-slate-300 hover:text-white">Cancelar</button>
                                </>
                            );
                        })()}
                        <div className="h-6 w-px bg-slate-700 mx-1" />
                        <button
                            onClick={() => setIsBulkRescheduleModalOpen(true)}
                            className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                            <CalendarIcon size={12} /> Reagendar
                        </button>
                    </div>
                    <div className="h-10 w-px bg-slate-800" />
                    <button onClick={() => setSelectedApts([])} className="p-2 text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* Bulk Reschedule Action Logic Injection */}
            {isBulkRescheduleModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={closeAllModals}>
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-900 uppercase">Reagendar em Massa</h3>
                            <button onClick={closeAllModals} className="p-2 text-slate-300 hover:text-rose-500"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nova Data para os {selectedApts.length} agendamentos</label>
                                <ModernDatePicker
                                    value={bulkRescheduleDate}
                                    onChange={(val) => setBulkRescheduleDate(val)}
                                />
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">
                                * Atenção: O horário original de cada plano será mantido na nova data selecionada.
                            </p>
                        </div>
                        <div className="p-6 bg-slate-50 flex justify-end gap-3">
                            <button onClick={closeAllModals} className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all">Cancelar</button>
                            <button
                                disabled={!bulkRescheduleDate || actionLoading}
                                onClick={() => {
                                    if (!bulkRescheduleDate) return;
                                    setActionLoading(true);
                                    const parsed = parseISO(bulkRescheduleDate);
                                    handleBulkRescheduleAction(selectedApts, parsed, appointments, plans, addToast).then(success => {
                                        setActionLoading(false);
                                        if (success) {
                                            setSelectedApts([]);
                                            closeAllModals();
                                            fetchAppointments();
                                        }
                                    });
                                }}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                            >
                                {actionLoading ? 'Processando...' : 'Reagendar Todos'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {false && handleBulkRescheduleAction}

            {
                isBlockingModalOpen && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={closeAllModals}>
                        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-lg font-black text-slate-900 uppercase">Bloquear Data</h3>
                                <button onClick={() => setIsBlockingModalOpen(false)} className="p-2 text-slate-300 hover:text-rose-500"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Data</label>
                                    <p className="font-bold text-slate-700">{dateToBlock ? format(dateToBlock, "dd 'de' MMMM", { locale: ptBR }) : ''}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Motivo (Feriado, Indisponibilidade, etc.)</label>
                                    <input
                                        type="text"
                                        value={blockReason}
                                        onChange={e => setBlockReason(e.target.value)}
                                        placeholder="Ex: Feriado Municipal"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                    />
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 flex justify-end gap-3">
                                <button onClick={() => setIsBlockingModalOpen(false)} className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all">Cancelar</button>
                                <button onClick={handleBlockDate} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">Confirmar</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

// --- BULK RESCHEDULE TOOL ---
const handleBulkRescheduleAction = async (aptIds: string[], newDate: Date, appointments: Appointment[], plans: EnhancedPlan[], addToast: any) => {
    try {
        let count = 0;
        const targetApts = appointments.filter(a => aptIds.includes(a.id));
        const patientIds = Array.from(new Set(targetApts.map(a => a.patient_id)));

        // 1. BULK CONFLICT CHECK
        const { data: conflicts } = await supabase
            .from('appointments')
            .select('patient_id, date, patients(name)')
            .in('patient_id', patientIds)
            .gte('date', startOfDay(newDate).toISOString())
            .lte('date', endOfDay(newDate).toISOString())
            .neq('status', 'cancelled');

        if (conflicts && conflicts.length > 0) {
            const names = Array.from(new Set(conflicts.map((c: any) => c.patients?.name))).join(', ');
            if (!window.confirm(`Atenção: Os seguintes pacientes já possuem agendamentos nesta data: ${names}. Deseja reagendar todos mesmo assim?`)) {
                return false;
            }
        }

        for (const apt of targetApts) {
            const plan = plans.find(p => p.id === apt.treatment_plan_id);
            if (!plan) continue;

            // 2. Create placeholder on ORIGINAL date to suppress projection
            await supabase.from('appointments').insert([{
                patient_id: plan.patient_id,
                doctor_id: plan.doctor_id,
                specialty_id: plan.specialty_id,
                type: 'Sessão',
                date: apt.date, // original date
                status: 'completed',
                attendance_status: 'cancelled',
                treatment_plan_id: plan.id,
                created_by: (await supabase.auth.getUser()).data.user?.id,
                notes: 'Marcador para suprimir projeção após reagendamento em massa.'
            }]);

            const [hours, minutes] = (plan.schedule_time || '08:00').split(':');
            const targetDate = new Date(newDate);
            targetDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            const { error } = await supabase
                .from('appointments')
                .update({ date: targetDate.toISOString() })
                .eq('id', apt.id);

            if (error) throw error;
            count++;
        }

        addToast(`${count} agendamentos reagendados com sucesso!`, 'success');
        return true;
    } catch (e: any) {
        console.error(e);
        addToast(`Erro no reagendamento em massa: ${e.message}`, 'error');
        return false;
    }
};

export default SessionManagement;
