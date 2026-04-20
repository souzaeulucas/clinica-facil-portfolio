// Final fix for SUS and Professional sync
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import ModernSelect from '../ui/ModernSelect';
import { formatPatientName } from '../../utils/formatters';
import { normalizeString } from '../../utils/string';
import { parseISO, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Sub-components
import PatientDetails from './TherapyForm/PatientDetails';
import SessionSchedule from './TherapyForm/SessionSchedule';
import FinancialSettings from './TherapyForm/FinancialSettings';

interface Patient {
    id: string;
    name: string;
    cpf: string;
    phone: string;
    birth_date?: string;
    is_blocked?: boolean;
    is_sus?: boolean;
}

interface Doctor {
    id: string;
    name: string;
    specialty_id: string;
}

interface Specialty {
    id: string;
    name: string;
}

interface TherapySessionFormProps {
    isModal?: boolean;
    onSuccess?: (highlightId?: string, highlightDate?: string) => void;
    initialData?: any; // Added for editing
}

const TherapySessionForm: React.FC<TherapySessionFormProps> = ({ isModal = false, onSuccess, initialData }) => {
    const { addToast } = useToast();
    const { profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Store the initial filter state in a ref so it doesn't get lost or overwritten during renders
    const initialFilterRef = useRef((location.state as any)?.selectedDoctorId);
    const [loading, setLoading] = useState(false);

    // Form State
    const [patientSearch, setPatientSearch] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [showPatientResults, setShowPatientResults] = useState(false);

    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [encaminhamento, setEncaminhamento] = useState('');

    const [birthDate, setBirthDate] = useState('');
    const [age, setAge] = useState<number | ''>('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [totalSessions, setTotalSessions] = useState<number>(10);
    const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(1);
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [scheduleTime, setScheduleTime] = useState('08:00');
    const [isPaying, setIsPaying] = useState<boolean>(false);
    const [pricePerSession, setPricePerSession] = useState<number>(0);
    const [isSus, setIsSus] = useState<boolean>(false);
    const [notes, setNotes] = useState('');
    const [newPatientCPF, setNewPatientCPF] = useState('');
    const [newPatientPhone, setNewPatientPhone] = useState('');
    const [isFirstSessionEvaluation, setIsFirstSessionEvaluation] = useState(false);

    const patientSearchRef = useRef<HTMLDivElement>(null);

    const weekDays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

    // Helper functions (same as before)
    const formatCPF = (value: string) => {
        const v = value.replace(/\D/g, '').slice(0, 11);
        return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2');
    };

    const formatPhone = (value: string) => {
        const v = value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 10) return v.replace(/^(\d\d)(\d{5})(\d{4}).*/, '($1) $2-$3');
        if (v.length > 5) return v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        if (v.length > 2) return v.replace(/^(\d\d)(\d{0,5}).*/, '($1) $2');
        return v.replace(/^(\d*)/, '($1');
    };

    useEffect(() => {
        const fetchData = async () => {
            // Priority: Load options first
            const { data: specData } = await supabase.from('specialties').select('id, name').or('name.ilike.%psicolo%,name.ilike.%fisiotera%,name.ilike.%acupuntu%');
            if (specData) setSpecialties(specData);
            const { data: docData } = await supabase.from('doctors').select('id, name, specialty_id').order('name');
            const allDoctors = docData || [];
            if (docData) setDoctors(docData);

            // 1. Handle pre-selected date/doctor from navigation state (Fallback)
            const state = location.state as { preSelectedDate?: string, selectedDoctorId?: string };
            let effectiveDate = state?.preSelectedDate || '';
            let effectiveDoctorId = state?.selectedDoctorId || '';

            // 2. Handle initialData (Primary source)
            if (initialData) {
                const plan = initialData.treatment_plans || initialData;
                const patient = initialData.patients || plan.patient || initialData.patient;

                // Case A: Editing existing plan or prefilled creation
                if (plan.id || initialData.date || initialData.doctor_id) {
                    if (initialData.date) effectiveDate = initialData.date;
                    if (initialData.doctor_id) effectiveDoctorId = initialData.doctor_id;

                    if (plan.id) {
                        // Full edit mode
                        if (patient) {
                            setSelectedPatient({
                                id: plan.patient_id || patient.id,
                                name: patient.name || '',
                                cpf: patient.cpf || '',
                                phone: patient.phone || '',
                                is_sus: !!patient.is_sus
                            });
                            setPatientSearch(patient.name || '');
                            setNewPatientCPF(patient.cpf || '');
                            setNewPatientPhone(patient.phone || '');
                            if (patient.birth_date) setBirthDate(patient.birth_date);
                        }

                        setSelectedSpecialtyId(plan.specialty_id || '');
                        setSelectedDoctorId(plan.doctor_id || '');
                        setStartDate(plan.start_date || new Date().toISOString().split('T')[0]);
                        setTotalSessions(plan.total_sessions || 10);
                        setSessionsPerWeek(plan.sessions_per_week || 1);
                        setSelectedDays(plan.schedule_days || []);
                        setScheduleTime(plan.schedule_time?.slice(0, 5) || '08:00');
                        setIsPaying(plan.is_paying || false);
                        setPricePerSession(plan.price_per_session || 0);
                        setIsSus(!!patient?.is_sus || !!plan.is_sus);
                        setNotes(plan.notes || '');
                        setIsFirstSessionEvaluation(initialData.type?.toLowerCase() === 'avaliação');
                        
                        // If we are editing, we don't want to override with state
                        effectiveDate = '';
                        effectiveDoctorId = '';
                    }
                }
            }

            // 3. Apply Contextual Prefilling (if not editing an existing plan)
            if (effectiveDate) {
                setStartDate(effectiveDate);
                // Calculate weekday name
                try {
                    const dateObj = parseISO(effectiveDate);
                    const dayName = format(dateObj, 'EEEE', { locale: ptBR });
                    // Capitalize: "sexta-feira" -> "Sexta-feira"
                    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                    setSelectedDays([capitalizedDay]);
                } catch (e) {
                    console.error("Error parsing preSelectedDate:", e);
                }
            }

            if (effectiveDoctorId) {
                const doc = allDoctors.find(d => d.id === effectiveDoctorId);
                if (doc) {
                    setSelectedSpecialtyId(doc.specialty_id);
                    setSelectedDoctorId(doc.id);
                }
            }
        };
        fetchData();
    }, [initialData]);

    // Auto-select SUS based on Patient
    useEffect(() => {
        if (selectedPatient) {
            // Force boolean. If DB has null, this ensures false.
            // If DB has true, this ensures true.
            setIsSus(!!selectedPatient.is_sus);
        }
    }, [selectedPatient]);

    const filteredDoctors = useMemo(() => {
        return doctors.filter(d => d.specialty_id === selectedSpecialtyId);
    }, [selectedSpecialtyId, doctors]);

    useEffect(() => {
        if (birthDate) {
            const birth = new Date(birthDate);
            const today = new Date();
            let calculatedAge = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) calculatedAge--;
            setAge(calculatedAge);
        } else setAge('');
    }, [birthDate]);

    useEffect(() => {
        const spec = specialties.find(s => s.id === selectedSpecialtyId);
        const specName = spec?.name.toLowerCase() || '';

        if (specName.includes('fisioterapia') && encaminhamento && filteredDoctors.length >= 2) {
            // Patricia: Geriatria, Ortopedia
            // Filipe: Neurologia, Respiratório, Pediatria
            const referralLower = encaminhamento.toLowerCase();
            const patricia = filteredDoctors.find(d => d.name.toLowerCase().includes('patrícia') || d.name.toLowerCase().includes('patricia'));
            const filipe = filteredDoctors.find(d => d.name.toLowerCase().includes('filipe') || d.name.toLowerCase().includes('felipe'));

            if ((referralLower === 'geriatria' || referralLower === 'ortopedia') && patricia) {
                setSelectedDoctorId(patricia.id);
            } else if ((referralLower === 'neurologia' || referralLower === 'respiratório' || referralLower === 'pediatria') && filipe) {
                setSelectedDoctorId(filipe.id);
            } else {
                // Fallback to first doctor if specific match fails
                setSelectedDoctorId(filteredDoctors[0].id);
            }
        } else if (specName.includes('psicologia')) {
            const gabriel = filteredDoctors.find(d => d.name.toLowerCase().includes('gabriel'));
            if (gabriel) setSelectedDoctorId(gabriel.id);
            else if (filteredDoctors.length > 0) setSelectedDoctorId(filteredDoctors[0].id);
        } else if (specName.includes('acupuntura')) {
            const glaucia = filteredDoctors.find(d => d.name.toLowerCase().includes('glaucia') || d.name.toLowerCase().includes('gláucia'));
            if (glaucia) setSelectedDoctorId(glaucia.id);
            else if (filteredDoctors.length > 0) setSelectedDoctorId(filteredDoctors[0].id);
        } else if (filteredDoctors.length === 1) {
            // Universal auto-select se houver apenas um profissional na especialidade
            setSelectedDoctorId(filteredDoctors[0].id);
        } else if (filteredDoctors.length === 0) {
            setSelectedDoctorId('');
        }
    }, [encaminhamento, selectedSpecialtyId, filteredDoctors, specialties]);

    useEffect(() => { if (!isPaying) setPricePerSession(0); }, [isPaying]);

    useEffect(() => {
        if (isFirstSessionEvaluation) {
            setIsPaying(false);
            setPricePerSession(0);
        }
    }, [isFirstSessionEvaluation]);

    // Auto-set 1 session for evaluations
    useEffect(() => {
        if (isFirstSessionEvaluation) {
            setTotalSessions(1);
            setSessionsPerWeek(1);
        }
    }, [isFirstSessionEvaluation]);

    const handleDayToggle = (day: string) => {
        if (selectedDays.includes(day)) setSelectedDays(prev => prev.filter(d => d !== day));
        else if (selectedDays.length < sessionsPerWeek) setSelectedDays(prev => [...prev, day]);
        else addToast(`Você selecionou a frequência de ${sessionsPerWeek}x na semana.`, 'info');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let targetPatientId = selectedPatient?.id;

        if (!targetPatientId && (!patientSearch || !newPatientCPF || !newPatientPhone)) {
            addToast('Para um novo paciente, preencha Nome, CPF e Telefone', 'error');
            return;
        }
        if (selectedPatient?.is_blocked) {
            addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
            return;
        }
        if (!selectedPatient && !patientSearch.trim()) {
            addToast('Por favor, informe o nome do paciente.', 'error');
            return;
        }

        if (!selectedSpecialtyId || selectedDays.length === 0) {
            addToast('Selecione especialidade e dias da semana', 'error');
            return;
        }

        // Check for conflicts
        if (targetPatientId) {
            let conflictDate: Date | null = null;
            const [hours, minutes] = scheduleTime.split(':');

            // Find the first appointment date logic
            let checkDate = new Date(startDate + 'T00:00:00');
            const getDayIndex = (ptName: string) => ({ 'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6 }[ptName]);
            const targetDays = selectedDays.map(getDayIndex);

            // Limit loop to check first 30 days
            for (let i = 0; i < 30; i++) {
                // Check if it matches selected day OR if it's evaluation (first day forces allow if simple, but usually eval is single day)
                // Logic from insert: if (isFirstDay && isFirstSessionEvaluation) -> push.
                const isFirstDay = i === 0;
                if ((isFirstDay && isFirstSessionEvaluation) || targetDays.includes(checkDate.getDay())) {
                    const d = new Date(checkDate);
                    d.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                    conflictDate = d;
                    break;
                }
                checkDate.setDate(checkDate.getDate() + 1);
            }

            if (conflictDate) {
                const { data: conflicts } = await supabase
                    .from('appointments')
                    .select('id, treatment_plan_id')
                    .eq('patient_id', targetPatientId)
                    .eq('date', conflictDate.toISOString())
                    .neq('attendance_status', 'cancelled');

                if (conflicts && conflicts.length > 0) {
                    // Check if any conflict is NOT from the current plan being edited
                    let currentPlanId = initialData?.treatment_plans?.id || initialData?.id;

                    // If it's a pure appointment edit without plan structure loaded deeply, fallback might be needed but usually consistent.
                    const isRealConflict = conflicts.some(c => c.treatment_plan_id !== currentPlanId);

                    if (isRealConflict) {
                        if (!window.confirm('⚠️ ALERTA DE CONFLITO DE HORÁRIO\n\nEste paciente já possui um agendamento neste mesmo dia e horário em outra ficha/plano.\n\nDeseja realizar o agendamento mesmo assim?')) {
                            return;
                        }
                    }
                }
            }
        }

        setLoading(true);
        try {
            if (!targetPatientId) {
                // 1. Try to find patient with this CPF
                const { data: existingPatient } = await supabase.from('patients')
                    .select('id, name')
                    .or(`cpf.eq."${newPatientCPF}",cpf.eq."${newPatientCPF.replace(/\D/g, '')}"`)
                    .maybeSingle();

                if (existingPatient) {
                    targetPatientId = existingPatient.id;
                    addToast(`Paciente já cadastrado como ${existingPatient.name}. Usando cadastro existente.`, 'success');
                    await supabase.from('patients').update({
                        name: patientSearch.trim(),
                        phone: newPatientPhone,
                        birth_date: birthDate || null,
                        is_sus: isSus ? true : undefined
                    }).eq('id', targetPatientId);
                } else {
                    // 2. Try by name and phone (robust match)
                    const broadNameSearch = patientSearch.trim();

                    const { data: nameResults } = await supabase
                        .from('patients')
                        .select('id, name, is_blocked')
                        .ilike('name', `%${broadNameSearch}%`)
                        .eq('phone', newPatientPhone);

                    if (nameResults && nameResults.length > 0) {
                        const matchedPatient = nameResults.find(p =>
                            normalizeString(p.name) === normalizeString(patientSearch.trim())
                        );

                        if (matchedPatient) {
                            if (matchedPatient.is_blocked) {
                                addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
                                setLoading(false);
                                return;
                            }
                            targetPatientId = matchedPatient.id;
                            addToast(`Paciente já cadastrado. Usando cadastro existente.`, 'success');
                            await supabase.from('patients').update({
                                cpf: newPatientCPF,
                                birth_date: birthDate || null,
                                is_sus: isSus ? true : undefined
                            }).eq('id', targetPatientId);
                        }
                    }

                    // 3. Still no patientId? Create new.
                    if (!targetPatientId) {
                        const { data: newPatient, error: pError } = await supabase
                            .from('patients')
                            .insert([{
                                name: patientSearch,
                                cpf: newPatientCPF,
                                phone: newPatientPhone,
                                birth_date: birthDate || null,
                                is_sus: isSus
                            }])
                            .select().single();

                        if (pError) {
                            if (pError.code === '23505') {
                                // Last chance check (race condition or format mismatch)
                                const { data: lastChance } = await supabase
                                    .from('patients')
                                    .select('id')
                                    .or(`cpf.eq."${newPatientCPF}",cpf.eq."${newPatientCPF.replace(/\D/g, '')}"`)
                                    .maybeSingle();
                                if (lastChance) targetPatientId = lastChance.id;
                                else throw pError;
                            } else throw pError;
                        } else {
                            targetPatientId = newPatient.id;
                        }
                    }
                }
            }
            else {
                // Update existing selected patient
                // Only update is_sus if it's true (don't remove it if unchecked for this specific plan, unless we want to force sync?)
                // User said "logo ele sempre será". So if true -> set true. If false -> ignore?
                const updatePayload: any = { cpf: newPatientCPF, phone: newPatientPhone, birth_date: birthDate || null };
                // Always sync is_sus status to the patient record
                if (isSus) updatePayload.is_sus = true;

                await supabase.from('patients').update(updatePayload).eq('id', targetPatientId);
            }

            const mergedNotes = encaminhamento
                ? [notes, `[Encaminhamento Automático: ${encaminhamento}]`].filter(Boolean).join('\n')
                : notes;

            const planData = {
                patient_id: targetPatientId, specialty_id: selectedSpecialtyId, doctor_id: selectedDoctorId || null,
                start_date: startDate, total_sessions: totalSessions, sessions_per_week: sessionsPerWeek,
                schedule_days: selectedDays, schedule_time: scheduleTime, is_paying: isPaying === true,
                price_per_session: isPaying === true ? pricePerSession : 0, is_sus: isSus, notes: mergedNotes, status: 'active'
            };

            let planId = initialData?.treatment_plans?.id || initialData?.id;
            let newPlan;
            let createdId: string | undefined = undefined;
            let createdDate: string | undefined = undefined;

            if (planId && (initialData.treatment_plans || initialData.schedule_days)) {
                // UPDATE existing plan
                const { data, error } = await supabase.from('treatment_plans').update(planData).eq('id', planId).select().single();
                if (error) throw error;
                newPlan = data;

                // Sync the specific appointment type and DATE if editing from a slot
                if (initialData.id) {
                    // Check if only updating specific appointment details or the whole plan structure
                    // For now, if days changed, we regenerate futures.
                }

                // CHECK FOR STRUCTURAL CHANGES (Days, Time, Sessions, Start Date)
                const daysChanged = JSON.stringify(initialData.treatment_plans?.schedule_days?.sort()) !== JSON.stringify(selectedDays.sort());
                const timeChanged = initialData.treatment_plans?.schedule_time?.slice(0, 5) !== scheduleTime.slice(0, 5);
                const sessionsChanged = initialData.treatment_plans?.total_sessions !== totalSessions;
                const startDateChanged = initialData.treatment_plans?.start_date?.slice(0, 10) !== startDate.slice(0, 10);

                const oldPlan = initialData.treatment_plans || initialData;
                const wasInactive = oldPlan?.status === 'cancelled' || oldPlan?.status === 'completed';
                const isReactivation = wasInactive && planData.status === 'active';

                // If structural changes occurred, or if we are reactivating a plan (to rebuild missing ghosts), we must Sync the Agenda
                if (daysChanged || timeChanged || sessionsChanged || startDateChanged || isReactivation) {
                    // 1. Prepare REGENERATION properly
                    // EXTREMELY IMPORTANT FIX: Always reconstruct from the plan's 'start_date' so we can fill in any missing or cancelled holes
                    // left behind by bugs or bulk cancellations, regardless of which appointment was clicked to open the Edit modal.
                    const rawDate = startDate; // startDate state represents the PLAN start date from the form
                    const pivotDate = startOfDay(parseISO(rawDate));

                    // Fetch all existing physical appointments for this plan to know what history is preserved
                    const { data: allExisting } = await supabase
                        .from('appointments')
                        .select('date, status, attendance_status, type')
                        .eq('treatment_plan_id', planId);

                    let preservedCount = 0;
                    const preservedDates = new Set();
                    let hasPreservedEvaluation = false;

                    (allExisting || []).forEach(apt => {
                        const aptDate = startOfDay(parseISO(apt.date));

                        // We ONLY preserve physical answers (attended, missed, justified) or active sessions that are NOT cancelled.
                        const isLimiterOrScheduled = apt.status === 'scheduled' || apt.status === 'cancelled';
                        const isPhysicalCancel = apt.attendance_status === 'cancelled';

                        if (!isLimiterOrScheduled && !isPhysicalCancel) {
                            if (apt.type === 'Avaliação') {
                                hasPreservedEvaluation = true;
                                // Evaluations don't count towards total_sessions, so we don't increment preservedCount
                            } else {
                                preservedCount++;
                            }
                            preservedDates.add(aptDate.toISOString().split('T')[0]);
                        }
                    });

                    let remainingSessions = totalSessions - preservedCount;
                    const appointmentsToCreate: any[] = [];

                    if (remainingSessions > 0 || (isFirstSessionEvaluation && !hasPreservedEvaluation)) {
                        const { data: { user } } = await supabase.auth.getUser();
                        let currentDate = new Date(pivotDate);
                        const getDayIndex = (ptName: string) => ({ 'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6 }[ptName] as number);
                        const targetDays = selectedDays.map(getDayIndex);
                        let iterations = 0;
                        const MAX_ITERATIONS = 730;

                        let currentCreatedSessions = 0;
                        let createdEvaluation = false;

                        while (currentCreatedSessions < remainingSessions && iterations < MAX_ITERATIONS) {
                            // Determine if we need to create an evaluation on the first valid day
                            const needsEvalThisLoop = isFirstSessionEvaluation && !hasPreservedEvaluation && !createdEvaluation;

                            // Note: Iterations logic here aligns with the day checking.
                            // If it's the very first iteration AND we need an evaluation, we can place it if the day matches the schedule OR just place it on pivotDate regardless if we wanted?
                            // Wait, the original INSERT code places Avaliação on interactions === 0 REGARDLESS of targetDays!
                            // "if (iterations === 0 && isFirstSessionEvaluation) { ... } else if (targetDays.includes...) { ... }"
                            // Let's do exactly that.

                            const dateStr = currentDate.toISOString().split('T')[0];

                            if (needsEvalThisLoop && iterations === 0) {
                                if (!preservedDates.has(dateStr)) {
                                    const [hours, minutes] = scheduleTime.split(':');
                                    const appointmentDate = new Date(currentDate);
                                    appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                                    appointmentsToCreate.push({
                                        patient_id: targetPatientId,
                                        doctor_id: selectedDoctorId || null,
                                        specialty_id: selectedSpecialtyId,
                                        type: 'Avaliação',
                                        date: appointmentDate.toISOString(),
                                        status: 'scheduled',
                                        treatment_plan_id: planId,
                                        created_by: user?.id
                                    });
                                }
                                createdEvaluation = true;
                            } else if (targetDays.includes(currentDate.getDay())) {
                                if (!preservedDates.has(dateStr)) {
                                    const [hours, minutes] = scheduleTime.split(':');
                                    const appointmentDate = new Date(currentDate);
                                    appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                                    appointmentsToCreate.push({
                                        patient_id: targetPatientId,
                                        doctor_id: selectedDoctorId || null,
                                        specialty_id: selectedSpecialtyId,
                                        type: 'Sessão',
                                        date: appointmentDate.toISOString(),
                                        status: 'scheduled',
                                        treatment_plan_id: planId,
                                        created_by: user?.id
                                    });
                                    currentCreatedSessions++;
                                } else {
                                    // If there is a preserved session on this target day, it counts towards remaining
                                    // BUT we already subtracted preservedCount BEFORE the loop. So if we hit a preserved date here,
                                    // we should NOT increment currentCreatedSessions to avoid double counting!
                                    // Wait! `remainingSessions` is `total - preservedCount`.
                                    // So we only need to create `remainingSessions` NEW ones.
                                    // So skipping existing dates WITHOUT incrementing is correct.
                                }
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                            iterations++;
                        }
                    }

                    // 2. NOW execute DB changes
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // We aggressively delete ALL scheduled and ghost cancelled appointments for this plan 
                    // from the absolute start_date onwards to guarantee a perfect refresh
                    await supabase.from('appointments')
                        .delete()
                        .eq('treatment_plan_id', planId)
                        .in('status', ['scheduled', 'cancelled']);

                    // Bulk insert new ones
                    if (appointmentsToCreate.length > 0) {
                        await supabase.from('appointments').insert(appointmentsToCreate);
                    }

                    // If we are editing a specific appointment that is TODAY or immediate, let's update it individually just in case
                    if (initialData.id) {
                        // verify if the appointment still exists before updating it
                        const { data: verifyApt } = await supabase.from('appointments').select('id, date').eq('id', initialData.id).single();

                        if (verifyApt) {
                            const [h, m] = scheduleTime.split(':');
                            const newApptDate = new Date(verifyApt.date); // Use current DB date instead of initialData.date which might be stale
                            newApptDate.setHours(parseInt(h), parseInt(m), 0, 0);

                            await supabase.from('appointments').update({
                                doctor_id: planData.doctor_id,
                                date: newApptDate.toISOString(),
                                type: isFirstSessionEvaluation ? 'Avaliação' : 'Sessão'
                            }).eq('id', initialData.id);
                        }
                    }
                } else {
                    // Just propagation of simple fields if no structural change
                    // Use startOfDay to sure we catch 'Today' appointments that might be 'scheduled'
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    await supabase.from('appointments')
                        .update({ doctor_id: planData.doctor_id })
                        .eq('treatment_plan_id', planId)
                        .eq('status', 'scheduled')
                        .gte('date', today.toISOString());

                    // CRITICAL FIX: Also update the specific appointment being edited, 
                    // even if it's in the past or already attended (mistake correction)
                    if (initialData.id) {
                        const [h, m] = scheduleTime.split(':');
                        const newApptDate = new Date(initialData.date);
                        newApptDate.setHours(parseInt(h), parseInt(m), 0, 0);

                        await supabase.from('appointments')
                            .update({
                                doctor_id: planData.doctor_id,
                                date: newApptDate.toISOString(), // Force sync time even if plan didn't change structurally
                                type: isFirstSessionEvaluation ? 'Avaliação' : 'Sessão'
                            })
                            .eq('id', initialData.id);
                    }
                }

                addToast('Ficha atualizada e agenda sincronizada!', 'success');
            } else {
                // INSERT new plan
                const { data, error } = await supabase.from('treatment_plans').insert([planData]).select().single();
                if (error) throw error;
                newPlan = data;

                const appointmentsToCreate = [];
                let currentSession = 0;
                let currentDate = new Date(startDate + 'T00:00:00');
                const getDayIndex = (ptName: string) => ({ 'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6 }[ptName]);
                const targetDays = selectedDays.map(getDayIndex);
                let iterations = 0;

                while (currentSession < totalSessions && iterations < 730) {
                    if (iterations === 0 && isFirstSessionEvaluation) {
                        const [hours, minutes] = scheduleTime.split(':');
                        const appointmentDate = new Date(currentDate);
                        appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                        appointmentsToCreate.push({
                            patient_id: targetPatientId, doctor_id: selectedDoctorId || null, specialty_id: selectedSpecialtyId,
                            type: 'Avaliação', date: appointmentDate.toISOString(), status: 'scheduled',
                            treatment_plan_id: newPlan.id, created_by: (await supabase.auth.getUser()).data.user?.id
                        });
                        // IMPORTANT: Evaluations do NOT count towards the total_sessions limit
                    } else if (targetDays.includes(currentDate.getDay())) {
                        const [hours, minutes] = scheduleTime.split(':');
                        const appointmentDate = new Date(currentDate);
                        appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                        appointmentsToCreate.push({
                            patient_id: targetPatientId, doctor_id: selectedDoctorId || null, specialty_id: selectedSpecialtyId,
                            type: 'Sessão', date: appointmentDate.toISOString(), status: 'scheduled',
                            treatment_plan_id: newPlan.id, created_by: (await supabase.auth.getUser()).data.user?.id
                        });
                        currentSession++;
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                    iterations++;
                }


                if (appointmentsToCreate.length > 0) {
                    const { data: createdApts, error: aptError } = await supabase.from('appointments').insert(appointmentsToCreate).select('id, date');
                    if (aptError) addToast('Plano criado, mas houve erro ao gerar a agenda automática.', 'warning');
                    if (createdApts && createdApts.length > 0) {
                        createdId = createdApts[0].id;
                        createdDate = createdApts[0].date;
                    }
                }
                addToast('Plano de tratamento criado com sucesso!', 'success');
            }

            if (onSuccess) {
                onSuccess(createdId, createdDate);
            } else {
                // Return to agenda.
                // Logic requested by user:
                // 1. If a specific filter was active (e.g. 'Patricia'), keep it.
                // 2. If NO specific filter was active (e.g. 'all'), switch to the doctor just scheduled.

                const incomingFilter = initialFilterRef.current;

                // If incomingFilter exists and is NOT 'all', use it (Persistence)
                // Else (if it's 'all' or undefined), use the doctor selected in the form (Context Switch)
                const returnFilter = (incomingFilter && incomingFilter !== 'all')
                    ? incomingFilter
                    : (selectedDoctorId || 'all');

                navigate('/agendamentos/sessoes', {
                    state: {
                        highlightId: createdId,
                        highlightDate: createdDate,
                        selectedDoctorId: returnFilter
                    }
                });
            }
        } catch (error: any) {
            console.error('Error saving therapy plan:', error);
            if (error.message?.includes('JWT')) { addToast('Sessão expirada. Redirecionando...', 'error'); await supabase.auth.signOut(); window.location.reload(); }
            else addToast(`Erro ao salvar plano de terapia: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally { setLoading(false); }
    };

    return (
        <form onSubmit={handleSubmit} className={isModal ? "space-y-3 animate-in fade-in duration-500" : "bg-white rounded-2xl p-5 border border-slate-200 shadow-xl shadow-slate-200/50 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-4"}>
            <fieldset disabled={loading} className="space-y-3 group-disabled:opacity-70 transition-opacity">
                <PatientDetails
                    patientSearch={patientSearch} setPatientSearch={setPatientSearch}
                    setSelectedPatient={setSelectedPatient} selectedPatient={selectedPatient}
                    birthDate={birthDate} setBirthDate={setBirthDate} age={age}
                    patients={patients} setPatients={setPatients}
                    newPatientCPF={newPatientCPF} setNewPatientCPF={setNewPatientCPF}
                    newPatientPhone={newPatientPhone} setNewPatientPhone={setNewPatientPhone}
                    formatPatientName={formatPatientName} formatCPF={formatCPF} formatPhone={formatPhone} addToast={addToast}
                />

                {/* Specialty Selection persists here for context */}
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200 relative z-[45]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ModernSelect
                            label="Especialidade"
                            value={selectedSpecialtyId}
                            options={[{ value: '', label: 'Selecione...' }, ...specialties.map(s => ({ value: s.id, label: s.name }))]}
                            onChange={setSelectedSpecialtyId}
                            required
                        />
                        <ModernSelect
                            label="Prestador / Professor"
                            value={selectedDoctorId}
                            options={[{ value: '', label: 'Selecione...' }, ...filteredDoctors.map(d => ({ value: d.id, label: d.name }))]}
                            onChange={setSelectedDoctorId}
                        />
                    </div>
                    {specialties.find(s => s.id === selectedSpecialtyId)?.name.toLowerCase().includes('fisioterapia') && (
                        <div className="mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <ModernSelect
                                label="Encaminhado por (Origem)"
                                value={encaminhamento}
                                options={[
                                    { value: '', label: 'Selecione o encaminhamento...' },
                                    { value: 'Geriatria', label: 'Geriatria' },
                                    { value: 'Ortopedia', label: 'Ortopedia' },
                                    { value: 'Neurologia', label: 'Neurologia' },
                                    { value: 'Respiratório', label: 'Respiratório' },
                                    { value: 'Pediatria', label: 'Pediatria' },
                                ]}
                                onChange={setEncaminhamento}
                            />
                        </div>
                    )}
                </div>

                <SessionSchedule
                    startDate={startDate} setStartDate={setStartDate}
                    totalSessions={totalSessions} setTotalSessions={setTotalSessions}
                    scheduleTime={scheduleTime} setScheduleTime={setScheduleTime}
                    sessionsPerWeek={sessionsPerWeek} setSessionsPerWeek={setSessionsPerWeek}
                    selectedDays={selectedDays} setSelectedDays={setSelectedDays}
                    weekDays={weekDays} handleDayToggle={handleDayToggle}
                    isFirstSessionEvaluation={isFirstSessionEvaluation}
                    setIsFirstSessionEvaluation={setIsFirstSessionEvaluation}
                />

                <FinancialSettings
                    isPaying={isPaying} setIsPaying={setIsPaying}
                    pricePerSession={pricePerSession} setPricePerSession={setPricePerSession}
                    isSus={isSus} setIsSus={setIsSus} loading={loading}
                    isBlocked={selectedPatient?.is_blocked === true}
                    socialPrice={profile?.social_price || 15}
                />
            </fieldset>
        </form>
    );
};

export default TherapySessionForm;
