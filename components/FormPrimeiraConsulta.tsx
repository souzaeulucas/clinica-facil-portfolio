import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Save, User, X, Tag, Plus, Calendar, AlertCircle } from 'lucide-react';
import { Especialidade } from '../types';
import { useToast } from '../contexts/ToastContext';
import ModernDatePicker from './ui/ModernDatePicker';
import PatientSearchSelect from './ui/PatientSearchSelect';
import { formatPatientName } from '../utils/formatters';
import { normalizeString, includesNormalized } from '../utils/string';

interface Doctor {
  id: string;
  name: string;
  specialty_id: string;
}

interface FormPrimeiraConsultaProps {
  initialData?: any;
  onSuccess?: () => void;
  isModal?: boolean;
}

interface SelectionRow {
  id: string;
  specialtyId: string;
  doctorId: string;
  specialtySearch: string;
  doctorSearch: string;
  isSpecOpen: boolean;
  isDocOpen: boolean;
  activeSpecIdx: number;
  activeDocIdx: number;
  filteredDoctors: Doctor[];
}

const FormPrimeiraConsulta: React.FC<FormPrimeiraConsultaProps> = ({ initialData, onSuccess, isModal }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [specialties, setSpecialties] = useState<Especialidade[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // Unified Selection State

  const [rows, setRows] = useState<SelectionRow[]>([{
    id: Math.random().toString(36).substr(2, 9),
    specialtyId: '',
    doctorId: '',
    specialtySearch: '',
    doctorSearch: '',
    isSpecOpen: false,
    isDocOpen: false,
    activeSpecIdx: -1,
    activeDocIdx: -1,
    filteredDoctors: []
  }]);

  // Patient and metadata state
  const [formData, setFormData] = useState({
    patientName: '',
    phone: '',
    phone2: '',
    cpf: '',
    status: 'scheduled',
    notes: '',
    selectedDate: new Date().toISOString().split('T')[0],
    is_sus: false
  });

  const [showPhone2, setShowPhone2] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  // Global filtering based on search terms (will be used inside the mapped rows)
  const getFilteredSpecialties = (search: string, currentRowId: string) => {
    // Find IDs already selected in OTHER rows
    const alreadySelectedIds = rows
      .filter(r => r.id !== currentRowId && r.specialtyId)
      .map(r => r.specialtyId);

    return specialties.filter(s =>
      includesNormalized(s.name, search) &&
      !alreadySelectedIds.includes(s.id)
    );
  };

  const getFilteredDoctors = (row: SelectionRow) => {
    return row.filteredDoctors.filter(d =>
      includesNormalized(d.name, row.doctorSearch)
    );
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (initialData) {
      const rawPhone = initialData.patients?.phone || '';
      const [p1, p2] = rawPhone.split(' / ');

      setFormData({
        patientName: initialData.patients?.name || '',
        phone: p1 || '',
        phone2: p2 || '',
        cpf: initialData.patients?.cpf || '',
        status: initialData.status || 'scheduled',
        notes: initialData.notes || '',
        selectedDate: initialData.date ? initialData.date.split('T')[0] : new Date().toISOString().split('T')[0],
        is_sus: initialData.is_sus || initialData.patients?.is_sus || false
      });

      if (p2) setShowPhone2(true);

      // Handle initial selection for editing (only one row is supported for editing)
      const specId = initialData.specialty_id || initialData.doctors?.specialty_id || '';
      const docId = initialData.doctor_id || '';

      // Try to get names directly from initialData relationships to avoid dependency on loaded lists
      // Fallback to searching lists if available, but don't add them to dependency array
      const specName = initialData.specialty?.name
        || initialData.doctors?.spec?.name
        || (specId ? specialties.find(s => s.id === specId)?.name : '')
        || '';

      const docName = initialData.doctors?.name || '';

      // Only filter if we have the list loaded, otherwise empty is fine (will be filled when list loads if we kept logic? No, better to just set ID)
      // Actually, filteredDoctors is derived. If we set it to empty, the dropdown won't show anything until user interacts?
      // Better: we can trust the current 'doctors' state if available.

      setRows([{
        id: 'edit-row',
        specialtyId: specId,
        doctorId: docId,
        specialtySearch: specName,
        doctorSearch: docName,
        isSpecOpen: false,
        isDocOpen: false,
        activeSpecIdx: -1,
        activeDocIdx: -1,
        filteredDoctors: [] // Will be populated on interaction or we could compute it if 'doctors' is stable, but removing dependency is safer.
      }]);
    }
  }, [initialData]);

  // Helper to update a row
  const updateRow = (id: string, updates: Partial<SelectionRow>) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
  };

  // Helper to add a row
  const addRow = () => {
    setRows(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      specialtyId: '',
      doctorId: '',
      specialtySearch: '',
      doctorSearch: '',
      isSpecOpen: false,
      isDocOpen: false,
      activeSpecIdx: -1,
      activeDocIdx: -1,
      filteredDoctors: []
    }]);
  };

  // Helper to remove a row
  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter(row => row.id !== id));
    }
  };

  const fetchData = async () => {
    try {
      const [specRes, docRes] = await Promise.all([
        supabase.from('specialties').select('*').order('name'),
        supabase.from('doctors').select('*').order('name')
      ]);

      if (specRes.data) {
        // Filter out SUS-exclusive specialties for FIRST consultation
        const availableSpecialties = specRes.data
          .filter(s => !s.is_sus_exclusive)
          .map(s => ({
            id: s.id,
            name: s.name,
            is_sus_exclusive: s.is_sus_exclusive
          }));
        setSpecialties(availableSpecialties);
      }
      if (docRes.data) {
        setDoctors(docRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      addToast('Erro ao carregar dados iniciais.', 'error');
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    }
    if (value.length > 10) {
      value = `${value.slice(0, 10)}-${value.slice(10)}`;
    }

    setFormData(prev => ({ ...prev, phone: value }));
  };

  const handlePhone2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    }
    if (value.length > 10) {
      value = `${value.slice(0, 10)}-${value.slice(10)}`;
    }

    setFormData(prev => ({ ...prev, phone2: value }));
  };

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 3) value = `${value.slice(0, 3)}.${value.slice(3)}`;
    if (value.length > 7) value = `${value.slice(0, 7)}.${value.slice(7)}`;
    if (value.length > 11) value = `${value.slice(0, 11)}-${value.slice(11)}`;

    setFormData(prev => ({ ...prev, cpf: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if any row has a specialty selected
    const validRows = rows.filter(r => r.specialtyId);
    if (validRows.length === 0) {
      addToast('Por favor, selecione pelo menos uma especialidade.', 'error');
      return;
    }

    if (!formData.patientName.trim()) {
      addToast('Por favor, informe o nome do paciente.', 'error');
      return;
    }

    const finalPhone = [formData.phone, formData.phone2].filter(p => p.trim()).join(' / ');
    const cleanCPF = formData.cpf.replace(/\D/g, '');
    const finalCPF = cleanCPF ? formData.cpf : null;
    const finalPatientName = formData.patientName.trim();

    setLoading(true);

    try {
      let patientId = initialData?.patient_id;

      if (initialData && patientId) {
        const { error: updateError } = await supabase
          .from('patients')
          .update({
            name: finalPatientName,
            phone: finalPhone,
            cpf: finalCPF
          })
          .eq('id', patientId);
        if (updateError) throw updateError;
      } else {
        // Try to find patient by CPF
        if (cleanCPF) {
          const { data: cpfResults } = await supabase
            .from('patients')
            .select('id, name, cpf, is_blocked')
            // Using quotes around values to avoid parsing issues with dots/dashes
            .or(`cpf.eq."${formData.cpf}",cpf.eq."${cleanCPF}"`);

          if (cpfResults && cpfResults.length > 0) {
            const existing = cpfResults[0];
            if (existing.is_blocked) {
              setIsBlocked(true);
              addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
              setLoading(false);
              return;
            }
            patientId = existing.id;
            addToast(`Paciente já cadastrado como ${existing.name}. Usando cadastro existente.`, 'success');
            const { error: patientUpdateError } = await supabase
              .from('patients')
              .update({ name: finalPatientName, phone: finalPhone, cpf: finalCPF, is_sus: formData.is_sus })
              .eq('id', patientId);
            if (patientUpdateError) throw patientUpdateError;
          }
        }

        // If still no patientId, try by name and phone (robust match)
        if (!patientId) {
          const broadNameSearch = finalPatientName;

          const { data: nameResults } = await supabase
            .from('patients')
            .select('id, name, is_blocked')
            .ilike('name', `%${broadNameSearch}%`)
            .eq('phone', finalPhone);

          if (nameResults && nameResults.length > 0) {
            const matchedPatient = nameResults.find(p =>
              normalizeString(p.name) === normalizeString(finalPatientName)
            );

            if (matchedPatient) {
              if (matchedPatient.is_blocked) {
                setIsBlocked(true);
                addToast('Este paciente está bloqueado por excesso de faltas não justificadas.', 'error');
                setLoading(false);
                return;
              }
              patientId = matchedPatient.id;
            }
          }
        }

        // Still no patient? Create new.
        if (!patientId) {
          const { data: patient, error: patientError } = await supabase
            .from('patients')
            .insert([{
              name: finalPatientName,
              phone: finalPhone,
              cpf: finalCPF,
              is_sus: formData.is_sus
            }])
            .select().single();

          if (patientError) {
            if (patientError.code === '23505') {
              const { data: lastChance } = await supabase
                .from('patients')
                .select('id, name')
                .or(`cpf.eq."${formData.cpf}",cpf.eq."${cleanCPF}"`)
                .maybeSingle();

              if (lastChance) {
                patientId = lastChance.id;
                addToast(`Paciente já cadastrado como ${lastChance.name}.`, 'success');
              } else throw patientError;
            } else throw patientError;
          } else {
            patientId = patient.id;
          }
        }
      }

      // Create appointments for each valid row
      const appointmentsPromises = validRows.map(async (row) => {
        const { data: pendingAppointments } = await supabase
          .from('appointments')
          .select('id, specialty_id, doctor_id')
          .eq('patient_id', patientId)
          .in('status', ['scheduled', 'urgent'])
          .neq('id', initialData?.id || '');

        const isDuplicate = pendingAppointments?.some(apt =>
          (apt.specialty_id === row.specialtyId && row.specialtyId !== '') ||
          (apt.doctor_id === row.doctorId && row.doctorId !== '')
        );

        if (isDuplicate) {
          const specName = specialties.find(s => s.id === row.specialtyId)?.name;
          addToast(`Já existe agendamento pendente para ${specName}.`, 'warning');
          return null;
        }

        const dateISO = new Date(formData.selectedDate + 'T12:00:00').toISOString();

        return {
          patient_id: patientId,
          doctor_id: row.doctorId || null,
          specialty_id: row.specialtyId,
          type: 'Primeira Consulta',
          date: dateISO,
          status: formData.status,
          notes: formData.notes,
          is_sus: formData.is_sus
        };
      });

      const results = await Promise.all(appointmentsPromises);
      const appointmentsToInsert = results.filter(a => a !== null);

      if (appointmentsToInsert.length === 0 && !initialData) {
        setLoading(false);
        return;
      }

      if (initialData?.id) {
        const { error } = await supabase
          .from('appointments')
          .update(appointmentsToInsert[0])
          .eq('id', initialData.id);
        if (error) throw error;
        addToast('Agendamento atualizado com sucesso!', 'success');
      } else if (appointmentsToInsert.length > 0) {
        const { error } = await supabase
          .from('appointments')
          .insert(appointmentsToInsert);
        if (error) throw error;
        addToast(`${appointmentsToInsert.length} agendamento(s) registrado(s)!`, 'success');
      }

      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error processing appointments:', error);
      addToast(`Erro ao processar agendamentos: ${error.message || 'Erro inesperado'}`, 'error');
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
                  value={formData.patientName}
                  onChange={(text) => setFormData(prev => ({ ...prev, patientName: formatPatientName(text) }))}
                  onSelect={(patient) => {
                    setFormData(prev => ({
                      ...prev,
                      patientName: formatPatientName(patient.name),
                      cpf: patient.cpf || prev.cpf,
                      phone: patient.phone || prev.phone,
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

            <div className="col-span-12 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Telefone</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="(00) 00000-0000"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 text-xs placeholder:text-slate-400 h-[42px]"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  maxLength={15}
                />
                {!showPhone2 && (
                  <button type="button" onClick={() => setShowPhone2(true)} className="px-3 py-2 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-100 transition-colors">
                    <Plus size={16} />
                  </button>
                )}
                {showPhone2 && (
                  <div className="flex-1 flex gap-2 animate-in fade-in slide-in-from-left-2">
                    <input
                      type="text"
                      placeholder="Outro telefone"
                      className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 text-xs h-[42px]"
                      value={formData.phone2}
                      onChange={handlePhone2Change}
                      maxLength={15}
                    />
                    <button type="button" onClick={() => { setShowPhone2(false); setFormData(p => ({ ...p, phone2: '' })) }} className="px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, is_sus: !prev.is_sus }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${formData.is_sus ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${formData.is_sus ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                {formData.is_sus && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Paciente SUS</span>
            </button>
          </div>

          {isBlocked && (
            <div className="px-4 pb-4 animate-in fade-in zoom-in duration-300">
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center gap-3">
                <X size={16} className="text-rose-600" />
                <span className="text-rose-700 text-xs font-bold">Paciente bloqueado por faltas excessivas.</span>
              </div>
            </div>
          )}
        </div>

        {/* Date Selection Section */}
        <div className="bg-white rounded-[1rem] shadow-sm border border-slate-200 z-[90] relative overflow-visible">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" /> Data do Agendamento
            </h3>
          </div>
          <div className="p-4">
            <div className="max-w-xs">
              <ModernDatePicker
                label="Selecione a Data"
                value={formData.selectedDate}
                onChange={(date) => setFormData(prev => ({ ...prev, selectedDate: date }))}
                required
              />
            </div>
          </div>
        </div>

        {/* Specialty Selection Section */}
        <div className="bg-white rounded-[1rem] shadow-sm border border-slate-200 relative overflow-visible">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2">
                <Tag size={14} className="text-indigo-500" /> Especialidades Desejadas
              </h3>
            </div>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
            >
              <Plus size={12} />
              Adicionar
            </button>
          </div>

          <div className="p-4 space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="relative animate-in fade-in slide-in-from-left-4 duration-300 grid grid-cols-12 gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0 items-end">
                <div className="col-span-12 md:col-span-6 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Especialidade</label>
                  <div className="relative group z-[60]">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Tag size={14} />
                      </div>
                      <input
                        type="text"
                        placeholder="Especialidade..."
                        className="w-full px-3 py-2.5 pl-9 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 text-xs placeholder:text-slate-400 h-[42px]"
                        value={row.specialtySearch}
                        onChange={(e) => {
                          const val = e.target.value;
                          const filtered = getFilteredSpecialties(val, row.id);
                          updateRow(row.id, {
                            specialtySearch: val,
                            isSpecOpen: true,
                            specialtyId: '', // Clear ID on search change
                            activeSpecIdx: filtered.length > 0 ? 0 : -1
                          });
                        }}
                        onFocus={() => {
                          const filtered = getFilteredSpecialties(row.specialtySearch, row.id);
                          updateRow(row.id, {
                            isSpecOpen: true,
                            activeSpecIdx: filtered.length > 0 ? 0 : -1
                          });
                        }}
                        onBlur={() => setTimeout(() => updateRow(row.id, { isSpecOpen: false }), 200)}
                        onKeyDown={(e) => {
                          if (!row.isSpecOpen) return;

                          const filtered = getFilteredSpecialties(row.specialtySearch, row.id);

                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            updateRow(row.id, {
                              activeSpecIdx: row.activeSpecIdx < filtered.length - 1 ? row.activeSpecIdx + 1 : row.activeSpecIdx
                            });
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            updateRow(row.id, {
                              activeSpecIdx: row.activeSpecIdx > 0 ? row.activeSpecIdx - 1 : 0
                            });
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const targetIdx = row.activeSpecIdx >= 0 ? row.activeSpecIdx : 0;
                            if (filtered[targetIdx]) {
                              const s = filtered[targetIdx];
                              const filteredDocs = doctors.filter(d => d.specialty_id === s.id);
                              updateRow(row.id, {
                                specialtyId: s.id,
                                specialtySearch: s.name,
                                isSpecOpen: false,
                                doctorId: '',
                                doctorSearch: '',
                                filteredDoctors: filteredDocs,
                                activeSpecIdx: -1
                              });
                            }
                          } else if (e.key === 'Escape') {
                            updateRow(row.id, { isSpecOpen: false });
                          }
                        }}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className={`w-4 h-4 transition-transform duration-200 ${row.isSpecOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Dropdown de Especialidades */}
                    {row.isSpecOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] max-h-40 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                        {getFilteredSpecialties(row.specialtySearch, row.id).length > 0 ? (
                          getFilteredSpecialties(row.specialtySearch, row.id).map((s, idx) => (
                            <button
                              key={s.id}
                              type="button"
                              className={`w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors flex flex-col gap-0.5 border-b border-slate-50 last:border-0 ${idx === row.activeSpecIdx ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-4' : ''}`}
                              onClick={() => {
                                const filteredDocs = doctors.filter(d => d.specialty_id === s.id);
                                updateRow(row.id, {
                                  specialtyId: s.id,
                                  specialtySearch: s.name,
                                  isSpecOpen: false,
                                  doctorId: '', // Reset doctor when specialty changes
                                  doctorSearch: '',
                                  filteredDoctors: filteredDocs
                                });
                              }}
                              onMouseMove={() => updateRow(row.id, { activeSpecIdx: idx })}
                            >
                              <span className="font-bold text-slate-800 text-xs">{s.name}</span>
                              {s.is_sus_exclusive && <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">SUS Exclusivo</span>}
                            </button>
                          ))
                        ) : (
                          <div className="px-5 py-4 text-center text-slate-400 text-xs font-bold uppercase">
                            Nenhuma especialidade encontrada
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-12 md:col-span-6 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Médico (Opcional)</label>
                  <div className="relative group z-[50]">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <User size={14} />
                      </div>
                      <input
                        type="text"
                        placeholder={row.specialtyId ? "Busque pelo nome..." : "Selecione..."}
                        className={`w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 text-xs placeholder:text-slate-400 h-[42px] ${!row.specialtyId ? 'opacity-50 cursor-not-allowed' : ''}`}
                        value={row.doctorSearch}
                        disabled={!row.specialtyId}
                        onChange={(e) => {
                          const val = e.target.value;
                          const filtered = getFilteredDoctors({ ...row, doctorSearch: val });
                          updateRow(row.id, {
                            doctorSearch: val,
                            isDocOpen: true,
                            doctorId: '',
                            activeDocIdx: filtered.length > 0 ? 0 : -1
                          });
                        }}
                        onFocus={() => {
                          if (row.specialtyId) {
                            const filtered = getFilteredDoctors(row);
                            updateRow(row.id, {
                              isDocOpen: true,
                              activeDocIdx: filtered.length > 0 ? 0 : -1
                            });
                          }
                        }}
                        onBlur={() => setTimeout(() => updateRow(row.id, { isDocOpen: false }), 200)}
                        onKeyDown={(e) => {
                          if (!row.isDocOpen) return;

                          const filtered = getFilteredDoctors(row);

                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            updateRow(row.id, {
                              activeDocIdx: row.activeDocIdx < filtered.length - 1 ? row.activeDocIdx + 1 : row.activeDocIdx
                            });
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            updateRow(row.id, {
                              activeDocIdx: row.activeDocIdx > 0 ? row.activeDocIdx - 1 : 0
                            });
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const targetIdx = row.activeDocIdx >= 0 ? row.activeDocIdx : 0;
                            if (filtered[targetIdx]) {
                              const d = filtered[targetIdx];
                              updateRow(row.id, {
                                doctorId: d.id,
                                doctorSearch: d.name,
                                isDocOpen: false,
                                activeDocIdx: -1
                              });
                            } else if (row.doctorSearch.trim()) {
                              // Close if they typed something but nothing is available or they just hit enter on what they typed
                              updateRow(row.id, { isDocOpen: false });
                            }
                          } else if (e.key === 'Escape') {
                            updateRow(row.id, { isDocOpen: false });
                          }
                        }}
                      />
                      {row.doctorSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            updateRow(row.id, { doctorSearch: '', doctorId: '' });
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Dropdown de Médicos */}
                    {row.isDocOpen && row.specialtyId && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border-2 border-slate-100 shadow-xl z-[60] max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                        {getFilteredDoctors(row).length > 0 ? (
                          getFilteredDoctors(row).map((d, idx) => (
                            <button
                              key={d.id}
                              type="button"
                              className={`w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex flex-col gap-0.5 border-b border-slate-50 last:border-0 ${idx === row.activeDocIdx ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-4' : ''}`}
                              onClick={() => {
                                updateRow(row.id, { doctorId: d.id, doctorSearch: d.name, isDocOpen: false });
                              }}
                              onMouseMove={() => updateRow(row.id, { activeDocIdx: idx })}
                            >
                              <span className="font-bold text-slate-800 text-sm">{d.name}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-5 py-4 text-center text-slate-400 text-xs font-bold uppercase">
                            Nenhum médico encontrado
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="absolute -right-2 -top-2 bg-rose-100 text-rose-600 p-2 rounded-full hover:bg-rose-200 transition-colors shadow-sm"
                    title="Remover especialidade"
                  >
                    <X size={14} strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Observation Section */}
        <div className="bg-white rounded-[1rem] shadow-sm border border-slate-200 overflow-hidden transform transition-all">
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

        {/* Urgency and Submit */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-0">
          <div
            className="flex items-center gap-2 bg-slate-50 p-2 pr-3 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors select-none border border-slate-100"
            onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'urgent' ? 'scheduled' : 'urgent' }))}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${formData.status === 'urgent' ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-slate-300 text-slate-500'}`}>
              <AlertCircle size={24} />
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-black uppercase tracking-wider ${formData.status === 'urgent' ? 'text-rose-600' : 'text-slate-500'}`}>
                {formData.status === 'urgent' ? 'Urgência Alta' : 'Sem Urgência'}
              </span>
              <span className="text-[10px] font-bold text-slate-400">Clique para alternar</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || isBlocked}
            className="w-full md:w-auto bg-slate-900 text-white px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {loading ? 'Salvando...' : 'Confirmar Agendamento'}
          </button>
        </div>
      </fieldset >
    </form >
  );
};

export default FormPrimeiraConsulta;
