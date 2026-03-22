import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { Save, User, X, Calendar, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import ModernDatePicker from './ui/ModernDatePicker';
import ModernSelect from './ui/ModernSelect';
import PatientSearchSelect from './ui/PatientSearchSelect';
import { formatPatientName } from '../utils/formatters';
import { normalizeString, includesNormalized } from '../utils/string';

interface ReturnFormProps {
  initialData?: any;
  onSuccess?: () => void;
  isModal?: boolean;
}

const FormRetorno: React.FC<ReturnFormProps> = ({ initialData, onSuccess, isModal }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [specialties, setSpecialties] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    patientId: '',
    patientName: '',
    cpf: '',
    doctorId: '',
    consultationDate: '',
    returnPeriodValue: '1',
    returnPeriodUnit: 'months',
    forecastDate: '',
    notes: '',
    is_sus: false
  });
  const [doctorSearch, setDoctorSearch] = useState('');
  const [isDocDropdownOpen, setIsDocDropdownOpen] = useState(false);
  const [activeDocIndex, setActiveDocIndex] = useState(-1);
  const [isBlocked, setIsBlocked] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Generic Selection State
  const [isGenericMode, setIsGenericMode] = useState(false);
  const [specialtySearch, setSpecialtySearch] = useState('');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');
  const [isSpecDropdownOpen, setIsSpecDropdownOpen] = useState(false);
  const [activeSpecIndex, setActiveSpecIndex] = useState(-1);

  const [dischargeBlockWarning, setDischargeBlockWarning] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkDischarges = async () => {
      try {
        const cleanName = searchTerm.trim();
        if (!cleanName && !formData.cpf) {
           if (isMounted) setDischargeBlockWarning(null);
           return;
        }
        
        const checkSpecialtyId = isGenericMode ? selectedSpecialtyId : (doctors.find(d => d.id === formData.doctorId)?.specialty_id || null);
        const checkDoctorId = isGenericMode ? null : formData.doctorId;

        if (!checkSpecialtyId && !checkDoctorId) {
            if (isMounted) setDischargeBlockWarning(null);
            return;
        }

        const cleanCPF = formData.cpf.replace(/\D/g, '');
        let possiblePatientIds = formData.patientId ? [formData.patientId] : [];
        
        if (cleanCPF) {
          const { data: matchedCpf } = await supabase.from('patients').select('id').or(`cpf.eq."${formData.cpf}",cpf.eq."${cleanCPF}"`);
          if (matchedCpf && matchedCpf.length > 0) {
            possiblePatientIds = [...possiblePatientIds, ...matchedCpf.map(p => p.id)];
          }
        }
        
        if (cleanName) {
          const { data: matchedName } = await supabase.from('patients').select('id').ilike('name', `%${cleanName}%`);
          if (matchedName && matchedName.length > 0) {
            possiblePatientIds = [...possiblePatientIds, ...matchedName.map(p => p.id)];
          }
        }

        const uniquePatientIds = Array.from(new Set(possiblePatientIds));
        if (uniquePatientIds.length === 0) {
            if (isMounted) setDischargeBlockWarning(null);
            return;
        }

        const { data: discharges, error: fetchErr } = await supabase
          .from('patient_discharges')
          .select('*')
          .in('patient_id', uniquePatientIds);
          
        if (fetchErr) throw fetchErr;

        if (discharges && discharges.length > 0) {
          const blockingDischarge = discharges.find(d => {
            if (!d.doctor_id && !d.specialty_id) return true; // Alta geral
            if (checkDoctorId && d.doctor_id === checkDoctorId) return true;
            if (checkSpecialtyId && d.specialty_id === checkSpecialtyId) return true;
            return false;
          });

          if (blockingDischarge && isMounted) {
             setDischargeBlockWarning('Este paciente possui registro de ALTA para esta especialidade ou profissional. O agendamento está bloqueado.');
          } else if (isMounted) {
             setDischargeBlockWarning(null);
          }
        } else if (isMounted) {
          setDischargeBlockWarning(null);
        }
      } catch (err: any) {
        // If there's an error, display it so we can debug!
        console.error("Discharge check error: ", err);
        if (isMounted) setDischargeBlockWarning(`Erro Crítico na Busca de Altas: ${err.message || 'Desconhecido'}`);
      }
    };

    const timeoutId = setTimeout(() => {
        checkDischarges();
    }, 600);

    return () => {
        isMounted = false;
        clearTimeout(timeoutId);
    };
  }, [searchTerm, formData.cpf, formData.patientId, formData.doctorId, selectedSpecialtyId, isGenericMode, doctors]);

  const filteredDoctorsList = useMemo(() => {
    return doctors.filter(d =>
      !d.is_generic && // Hide generic options from doctor list in this mode
      (d.name || '').toLowerCase().includes((doctorSearch || '').toLowerCase())
    );
  }, [doctors, doctorSearch]);

  const filteredSpecialtiesList = useMemo(() => {
    return specialties.filter(s =>
      (s.name || '').toLowerCase().includes((specialtySearch || '').toLowerCase())
    );
  }, [specialties, specialtySearch]);

  useEffect(() => {
    fetchData();
    if (initialData) {
      let consultDate = '';
      let periodValue = '1';
      let periodUnit = 'months';

      if (initialData.notes) {
        const matchDate = initialData.notes.match(/realizada em: (\d{2})\/(\d{2})\/(\d{4})/);
        if (matchDate) {
          consultDate = `${matchDate[3]}-${matchDate[2]}-${matchDate[1]}`;
        }

        const matchPeriod = initialData.notes.match(/Período de retorno: (\d+) (\w+)/);
        if (matchPeriod) {
          periodValue = matchPeriod[1];
          const unitLabel = matchPeriod[2].toLowerCase();
          if (unitLabel.includes('dia')) periodUnit = 'days';
          else if (unitLabel.includes('semana')) periodUnit = 'weeks';
          else if (unitLabel.includes('mês') || unitLabel.includes('meses')) periodUnit = 'months';
        } else {
          const matchOld = initialData.notes.match(/Período de retorno: (\d+)/);
          if (matchOld) periodValue = matchOld[1];
        }
      }

      let notesValue = '';
      if (initialData.notes) {
        const parts = initialData.notes.split('\n\nObservação: ');
        if (parts.length > 1) {
          notesValue = parts[1];
        }
      }

      setFormData({
        patientId: initialData.patient_id || '',
        patientName: initialData.patients?.name || '',
        cpf: initialData.patients?.cpf || '',
        doctorId: initialData.doctor_id || '',
        consultationDate: consultDate,
        returnPeriodValue: periodValue,
        returnPeriodUnit: periodUnit,
        forecastDate: initialData.date ? initialData.date.split('T')[0] : '',
        notes: notesValue,
        is_sus: initialData.is_sus || initialData.patients?.is_sus || false
      });

      if (initialData.doctors?.name) {
        setDoctorSearch(initialData.doctors.name);
      }
      if (initialData.patients?.name) {
        setSearchTerm(initialData.patients.name);
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (formData.consultationDate && formData.returnPeriodValue) {
      const [year, month, day] = formData.consultationDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const value = parseInt(formData.returnPeriodValue);

      if (formData.returnPeriodUnit === 'days') {
        date.setDate(date.getDate() + value);
      } else if (formData.returnPeriodUnit === 'weeks') {
        date.setDate(date.getDate() + value * 7);
      } else {
        date.setMonth(date.getMonth() + value);
      }

      const fYear = date.getFullYear();
      const fMonth = String(date.getMonth() + 1).padStart(2, '0');
      const fDay = String(date.getDate()).padStart(2, '0');

      setFormData(prev => ({ ...prev, forecastDate: `${fYear}-${fMonth}-${fDay}` }));
    }
  }, [formData.consultationDate, formData.returnPeriodValue, formData.returnPeriodUnit]);

  const fetchData = async () => {
    try {
      const [docRes, specRes] = await Promise.all([
        supabase.from('doctors').select('*').order('name'),
        supabase.from('specialties').select('*')
      ]);

      if (docRes.data) setDoctors(docRes.data);
      if (specRes.data) setSpecialties(specRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      addToast('Erro ao carregar dados.', 'error');
    }
  };

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 3) value = `${value.slice(0, 3)}.${value.slice(3)}`;
    if (value.length > 7) value = `${value.slice(0, 7)}.${value.slice(7)}`;
    if (value.length > 11) value = `${value.slice(0, 11)}-${value.slice(11)}`;

    setFormData(prev => ({ ...prev, cpf: value }));
  };

  const getDoctorSpecialty = (doctorId: string) => {
    if (isGenericMode) {
      const s = specialties.find(s => s.id === selectedSpecialtyId);
      return s ? s.name : '';
    }
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return '';
    const specialty = specialties.find(s => s.id === doctor.specialty_id);
    return specialty ? specialty.name : 'Especialidade não encontrada';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!searchTerm.trim()) {
      addToast('O nome do paciente é obrigatório.', 'error');
      return;
    }

    if (isGenericMode) {
      if (!selectedSpecialtyId) {
        addToast('A especialidade é obrigatória no modo "Qualquer Profissional".', 'error');
        return;
      }
    } else {
      if (!formData.doctorId) {
        addToast('O médico responsável é obrigatório.', 'error');
        return;
      }
    }
    if (!formData.consultationDate) {
      addToast('A data da consulta base é obrigatória.', 'error');
      return;
    }
    if (!formData.returnPeriodValue) {
      addToast('O tempo para retorno é obrigatório.', 'error');
      return;
    }

    setLoading(true);

    try {
      let patientId = formData.patientId;
      const cleanName = searchTerm.trim();
      const cleanCPF = formData.cpf.replace(/\D/g, '');

      if (cleanCPF) {
        // Check if patient exists by CPF (formatted or raw)
        const { data: cpfResults } = await supabase
          .from('patients')
          .select('id, name, is_blocked')
          .or(`cpf.eq."${formData.cpf}",cpf.eq."${cleanCPF}"`);

        if (cpfResults && cpfResults.length > 0) {
          const existingPatient = cpfResults[0];
          if (existingPatient.is_blocked) {
            setIsBlocked(true);
            addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
            setLoading(false);
            return;
          }
          patientId = existingPatient.id;

          const selectedDoctorForCheck = doctors.find(d => d.id === formData.doctorId);
          const { data: pendingAppointments } = await supabase
            .from('appointments')
            .select('id, specialty_id, doctor_id')
            .eq('patient_id', patientId)
            .in('status', ['scheduled', 'urgent'])
            .neq('id', initialData?.id || '');

          const isDuplicate = pendingAppointments?.some(apt =>
            (apt.doctor_id === formData.doctorId && !isGenericMode && formData.doctorId !== '') ||
            (apt.specialty_id === (isGenericMode ? selectedSpecialtyId : selectedDoctorForCheck?.specialty_id))
          );

          if (isDuplicate) {
            addToast(`Este paciente já possui um agendamento pendente para esta especialidade ou médico.`, 'warning');
            setLoading(false);
            return;
          }

          await supabase
            .from('patients')
            .update({
              name: cleanName,
              cpf: formData.cpf,
              is_sus: formData.is_sus
            })
            .eq('id', patientId);
        } else {
          // Construct a broad SQL search term by replacing vowels/ç with underscores
          const broadNameSearch = cleanName;

          const { data: nameResults } = await supabase
            .from('patients')
            .select('id, name, is_blocked, cpf')
            .ilike('name', `%${broadNameSearch}%`)
            .order('cpf', { ascending: false }); // Prioritize those who have CPF

          const matchedPatient = nameResults?.find(p =>
            normalizeString(p.name) === normalizeString(cleanName)
          );

          if (matchedPatient) {
            if (matchedPatient.is_blocked) {
              setIsBlocked(true);
              addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
              setLoading(false);
              return;
            }
            patientId = matchedPatient.id;

            const selectedDoctorForCheck = doctors.find(d => d.id === formData.doctorId);
            const { data: pendingAppointments } = await supabase
              .from('appointments')
              .select('id, specialty_id, doctor_id')
              .eq('patient_id', patientId)
              .in('status', ['scheduled', 'urgent'])
              .neq('id', initialData?.id || '');

            const isDuplicate = pendingAppointments?.some(apt =>
              (apt.doctor_id === formData.doctorId && !isGenericMode && formData.doctorId !== '') ||
              (apt.specialty_id === (isGenericMode ? selectedSpecialtyId : selectedDoctorForCheck?.specialty_id))
            );

            if (isDuplicate) {
              addToast(`Este paciente já possui um agendamento pendente para esta especialidade ou médico.`, 'warning');
              setLoading(false);
              return;
            }

            await supabase
              .from('patients')
              .update({
                cpf: formData.cpf,
                is_sus: formData.is_sus
              })
              .eq('id', patientId);
          } else {
            const { data: newPatient, error: createError } = await supabase
              .from('patients')
              .insert([{ name: cleanName, cpf: formData.cpf, is_sus: formData.is_sus }])
              .select()
              .single();
            if (createError) throw createError;
            patientId = newPatient.id;
          }
        }
      } else {
        // Legacy flow without CPF
        // Construct a broad SQL search term by replacing vowels/ç with underscores
        const broadNameSearch = cleanName;

        const { data: nameResults } = await supabase
          .from('patients')
          .select('id, name, is_blocked')
          .ilike('name', `%${broadNameSearch}%`);

        const matchedPatient = nameResults?.find(p =>
          normalizeString(p.name) === normalizeString(cleanName)
        );

        if (matchedPatient) {
          if (matchedPatient.is_blocked) {
            setIsBlocked(true);
            addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
            setLoading(false);
            return;
          }
          patientId = matchedPatient.id;

          const selectedDoctorForCheck = doctors.find(d => d.id === formData.doctorId);
          const { data: pendingAppointments } = await supabase
            .from('appointments')
            .select('id, specialty_id, doctor_id')
            .eq('patient_id', patientId)
            .in('status', ['scheduled', 'urgent'])
            .neq('id', initialData?.id || '');

          const isDuplicate = pendingAppointments?.some(apt =>
            (apt.doctor_id === formData.doctorId && formData.doctorId !== '') ||
            (apt.specialty_id === selectedDoctorForCheck?.specialty_id && selectedDoctorForCheck?.specialty_id)
          );

          if (isDuplicate) {
            addToast(`Este paciente já possui um agendamento pendente para esta especialidade ou médico.`, 'warning');
            setLoading(false);
            return;
          }
        } else {
          const { data: newPatient, error: createError } = await supabase
            .from('patients')
            .insert([{ name: cleanName, is_sus: formData.is_sus }])
            .select()
            .single();
          if (createError) throw createError;
          patientId = newPatient.id;
        }
      }

      // Discharge block verification is handled reactively by the useEffect hooks
      if (dischargeBlockWarning) {
          addToast(dischargeBlockWarning, 'error');
          setLoading(false);
          return;
      }
      // ----------------------------------------

      const [cYear, cMonth, cDay] = formData.consultationDate.split('-');

      const unitLabels: Record<string, string> = {
        days: parseInt(formData.returnPeriodValue) === 1 ? 'dia' : 'dias',
        weeks: parseInt(formData.returnPeriodValue) === 1 ? 'semana' : 'semanas',
        months: parseInt(formData.returnPeriodValue) === 1 ? 'mês' : 'meses'
      };

      const returnNotes = `Consulta base realizada em: ${cDay}/${cMonth}/${cYear}\nPeríodo de retorno: ${formData.returnPeriodValue} ${unitLabels[formData.returnPeriodUnit]}`;
      const finalNotes = `${returnNotes}${formData.notes ? '\n\nObservação: ' + formData.notes : ''}`;


      // Submit logic
      const selectedDoctor = doctors.find(d => d.id === formData.doctorId);
      const appointmentData = {
        patient_id: patientId,
        doctor_id: isGenericMode ? null : formData.doctorId,
        specialty_id: isGenericMode ? selectedSpecialtyId : (selectedDoctor?.specialty_id || null),
        type: 'Retorno',
        date: new Date(formData.forecastDate + 'T12:00:00').toISOString(),
        status: 'scheduled',
        notes: finalNotes,
        is_sus: formData.is_sus
      };

      if (initialData?.id) {
        const { error } = await supabase
          .from('appointments')
          .update(appointmentData)
          .eq('id', initialData.id);
        if (error) throw error;
        addToast('Retorno atualizado com sucesso!', 'success');
      } else {
        const { error } = await supabase
          .from('appointments')
          .insert([appointmentData]);
        if (error) throw error;
        addToast('Retorno agendado com sucesso!', 'success');
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Error creating appointment:', error);
      const errorMessage = error.message || error.details || 'Erro desconhecido';
      if (error.message?.includes('JWT')) {
        addToast('Sessão expirada. Por favor, recarregue a página.', 'error');
      } else {
        addToast(`Erro ao realizar agendamento: ${errorMessage}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-4">
      <fieldset disabled={loading} className="space-y-3 group-disabled:opacity-70 transition-opacity">
        {/* Patient Data Section */}
        <div className="bg-white rounded-[1rem] shadow-sm border border-slate-200 z-[100] relative overflow-visible">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2">
              <User size={14} className="text-teal-500" /> Identificação
            </h3>
          </div>

          <div className="p-4 grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-8 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Nome do Paciente</label>
              <div className="relative group z-[60]">
                <PatientSearchSelect
                  value={searchTerm}
                  onChange={(text) => {
                    const formatted = formatPatientName(text);
                    setSearchTerm(formatted);
                    setFormData(prev => ({ ...prev, patientName: formatted, patientId: '' }));
                  }}
                  onSelect={(patient) => {
                    const formattedName = formatPatientName(patient.name);
                    setSearchTerm(formattedName);
                    setFormData(prev => ({
                      ...prev,
                      patientName: formattedName,
                      patientId: patient.id,
                      cpf: patient.cpf || prev.cpf,
                      is_sus: !!patient.is_sus
                    }));
                    if (patient.is_blocked) {
                      setIsBlocked(true);
                      addToast('Paciente bloqueado.', 'error');
                    } else {
                      setIsBlocked(false);
                    }
                  }}
                  required
                  placeholder="Nome ou CPF"
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">CPF</label>
              <input
                type="text"
                placeholder="000.000.000-00"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 text-xs placeholder:text-slate-400 h-[42px]"
                value={formData.cpf}
                onChange={handleCPFChange}
                maxLength={14}
              />
            </div>
          </div>

          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, is_sus: !prev.is_sus }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${formData.is_sus ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-slate-50 border-slate-300 text-slate-400 opacity-60'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${formData.is_sus ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                {formData.is_sus && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Paciente SUS</span>
            </button>
          </div>

          {isBlocked && (
            <div className="px-8 pb-8 animate-in fade-in zoom-in duration-300">
              <div className="bg-rose-50 border-2 border-rose-100 rounded-2xl p-4 flex items-start gap-4">
                <div className="bg-rose-100 p-2 rounded-xl shrink-0">
                  <X size={20} className="text-rose-600" />
                </div>
                <div>
                  <h4 className="text-rose-800 font-black text-xs uppercase tracking-widest mb-1">Paciente Bloqueado</h4>
                  <p className="text-rose-700 text-sm font-bold leading-relaxed">
                    Este paciente atingiu o limite de 2 faltas não justificadas e não pode receber novos agendamentos sem liberação administrativa.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Return Details Section */}
        <div className="bg-white rounded-[1rem] shadow-sm border border-slate-200 z-20 relative overflow-visible">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" /> Detalhes do Retorno
            </h3>
          </div>

          <div className="p-4 grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-5 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">
                  {isGenericMode ? 'Especialidade' : 'Profissional'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsGenericMode(!isGenericMode);
                    setFormData(prev => ({ ...prev, doctorId: '' }));
                    setDoctorSearch('');
                    setSelectedSpecialtyId('');
                    setSpecialtySearch('');
                  }}
                  className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded transition-colors"
                >
                  {isGenericMode ? 'Buscar Médico' : 'Qualquer Um?'}
                </button>
              </div>

              <div className="relative group z-[60]">
                {/* Search Input for Doctor/Specialty - Compact */}
                <div className="relative">
                  <input
                    type="text"
                    disabled={isGenericMode}
                    placeholder={isGenericMode ? "Qualquer Profissional" : "Busque..."}
                    className={`w-full px-3 py-2.5 rounded-xl border ${isGenericMode ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500'} outline-none font-bold text-slate-700 text-xs h-[42px]`}
                    value={isGenericMode ? '' : doctorSearch}
                    onChange={(e) => {
                      if (isGenericMode) return;
                      const val = e.target.value;
                      setDoctorSearch(val);
                      const filtered = doctors.filter(d =>
                        !d.is_generic &&
                        (d.name || '').toLowerCase().includes(val.toLowerCase())
                      );
                      if (val.trim().length > 0) {
                        setIsDocDropdownOpen(true);
                        setActiveDocIndex(filtered.length > 0 ? 0 : -1);
                      } else {
                        setIsDocDropdownOpen(false);
                      }
                    }}
                    onFocus={() => {
                      if (!isGenericMode && doctorSearch.trim().length > 0) {
                        const filtered = doctors.filter(d =>
                          !d.is_generic &&
                          (d.name || '').toLowerCase().includes(doctorSearch.toLowerCase())
                        );
                        setIsDocDropdownOpen(true);
                        setActiveDocIndex(filtered.length > 0 ? 0 : -1);
                      }
                    }}
                    onBlur={() => setTimeout(() => setIsDocDropdownOpen(false), 200)}
                    onKeyDown={(e) => {
                      if (!isDocDropdownOpen) return;
                      const filtered = filteredDoctorsList;

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveDocIndex(prev => prev < filtered.length - 1 ? prev + 1 : prev);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveDocIndex(prev => prev > 0 ? prev - 1 : 0);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const targetIdx = activeDocIndex >= 0 ? activeDocIndex : 0;
                        if (filtered[targetIdx]) {
                          const d = filtered[targetIdx];
                          setFormData(p => ({ ...p, doctorId: d.id }));
                          setDoctorSearch(d.name);
                          setIsDocDropdownOpen(false);
                        } else if (doctorSearch.trim()) {
                          setIsDocDropdownOpen(false);
                        }
                      } else if (e.key === 'Escape') {
                        setIsDocDropdownOpen(false);
                      }
                    }}
                  />
                  {/* Reuse existing dropdown logic but adapt styles if needed - kept existing logic structure for simplicity but applied compact classes */}
                  {!isGenericMode && isDocDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-40 overflow-y-auto">
                      {filteredDoctorsList.map((d, i) => (
                        <button key={d.id} type="button" className={`w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 border-b border-slate-50 last:border-0 ${i === activeDocIndex ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-4' : ''}`}
                          onClick={() => { setFormData(p => ({ ...p, doctorId: d.id })); setDoctorSearch(d.name); setIsDocDropdownOpen(false); }}
                          onMouseMove={() => setActiveDocIndex(i)}>
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-populated Specialty Field */}
              {!isGenericMode && formData.doctorId && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Especialidade</label>
                  <div className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-bold text-xs h-[42px] flex items-center">
                    {getDoctorSpecialty(formData.doctorId)}
                  </div>
                </div>
              )}

              {/* Specialty Logic for Generic Mode */}
              {isGenericMode && (
                <div className="relative mt-2">
                  <input
                    type="text"
                    placeholder="Especialidade..."
                    className="w-full px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 focus:bg-white outline-none font-bold text-slate-700 text-xs h-[42px]"
                    value={specialtySearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSpecialtySearch(val);
                      const filtered = specialties.filter(s =>
                        (s.name || '').toLowerCase().includes(val.toLowerCase())
                      );
                      if (val.length > 0) {
                        setIsSpecDropdownOpen(true);
                        setActiveSpecIndex(filtered.length > 0 ? 0 : -1);
                      } else {
                        setIsSpecDropdownOpen(false);
                      }
                    }}
                    onFocus={() => {
                      if (specialtySearch.trim().length > 0) {
                        const filtered = specialties.filter(s =>
                          (s.name || '').toLowerCase().includes(specialtySearch.toLowerCase())
                        );
                        setIsSpecDropdownOpen(true);
                        setActiveSpecIndex(filtered.length > 0 ? 0 : -1);
                      }
                    }}
                    onBlur={() => setTimeout(() => setIsSpecDropdownOpen(false), 200)}
                    onKeyDown={(e) => {
                      if (!isSpecDropdownOpen) return;
                      const filtered = filteredSpecialtiesList;

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveSpecIndex(prev => prev < filtered.length - 1 ? prev + 1 : prev);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveSpecIndex(prev => prev > 0 ? prev - 1 : 0);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const targetIdx = activeSpecIndex >= 0 ? activeSpecIndex : 0;
                        if (filtered[targetIdx]) {
                          const s = filtered[targetIdx];
                          setSelectedSpecialtyId(s.id);
                          setSpecialtySearch(s.name);
                          setIsSpecDropdownOpen(false);
                        } else if (specialtySearch.trim()) {
                          setIsSpecDropdownOpen(false);
                        }
                      } else if (e.key === 'Escape') {
                        setIsSpecDropdownOpen(false);
                      }
                    }}
                  />
                  {isSpecDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-indigo-100 shadow-lg z-50 max-h-40 overflow-y-auto">
                      {filteredSpecialtiesList.map((s, i) => (
                        <button key={s.id} type="button" className={`w-full text-left px-4 py-2 hover:bg-indigo-50 text-xs font-bold text-slate-700 border-b border-slate-50 ${i === activeSpecIndex ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-4' : ''}`}
                          onClick={() => { setSelectedSpecialtyId(s.id); setSpecialtySearch(s.name); setIsSpecDropdownOpen(false); }}
                          onMouseMove={() => setActiveSpecIndex(i)}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="col-span-12 md:col-span-7 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Data da Consulta</label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative z-50">
                  <ModernDatePicker value={formData.consultationDate} onChange={d => setFormData({ ...formData, consultationDate: d })} required />
                </div>
                <div className="shrink-0 flex gap-2">
                  <input type="number" min="1" className="w-16 px-2 py-2.5 rounded-xl border border-slate-200 text-center text-xs font-bold outline-none h-[42px]" value={formData.returnPeriodValue} onChange={e => setFormData({ ...formData, returnPeriodValue: e.target.value })} />
                  <div className="w-28">
                    <ModernSelect value={formData.returnPeriodUnit} options={[{ value: 'days', label: 'Dias' }, { value: 'weeks', label: 'Semanas' }, { value: 'months', label: 'Meses' }]} onChange={v => setFormData({ ...formData, returnPeriodUnit: v })} />
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Data Final</span>
                  <span className="text-sm font-black text-indigo-600">{formData.forecastDate ? new Date(formData.forecastDate).toLocaleDateString('pt-BR') : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Observation Section - Compact */}
        <div className="bg-white rounded-[1rem] shadow-sm border border-slate-200 z-10 relative overflow-hidden mb-6">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Observações</h3>
          </div>
          <div className="p-3">
            <textarea
              placeholder="Observações..."
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 transition-all outline-none font-medium text-slate-700 text-xs min-h-[60px] resize-none"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </div>

        {dischargeBlockWarning && (
          <div className="bg-rose-50 border-2 border-rose-200 text-rose-700 px-5 py-4 rounded-xl mb-6 font-bold text-sm shadow-sm flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <AlertCircle size={24} className="shrink-0" />
            <p>{dischargeBlockWarning}</p>
          </div>
        )}

        <div className="flex justify-end pt-0">
          <button
            type="submit"
            disabled={loading || isBlocked || !!dischargeBlockWarning}
            className="w-full md:w-auto bg-slate-900 text-white px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {loading ? 'Salvando...' : (isBlocked || dischargeBlockWarning ? 'Operação Bloqueada' : 'Confirmar')}
          </button>
        </div>
      </fieldset>
    </form>
  );
};

export default FormRetorno;
