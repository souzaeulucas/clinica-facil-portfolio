import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Medico, Especialidade } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import UserManagement from '../pages/Settings/UserManagement';
import HistoryPage from '../pages/Settings/HistoryPage';
import ProfileSettings from '../pages/Settings/ProfileSettings';
import { LayoutGrid, Users, Stethoscope, Plus, Trash2, Edit2, Check, X, Tag, User as UserIcon, Loader2, History, UserCircle, List, Layout, Grid, Square, RefreshCw, MessageCircle, AlertCircle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { format, parseISO, startOfMonth, addMonths, addDays, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Settings: React.FC = () => {
  const { addToast } = useToast();
  const { isAdmin, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'clinical' | 'users' | 'history' | 'system' | 'comunication'>('profile');
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [viewMode, setViewMode] = useState<'list' | 'grid-sm' | 'grid-md' | 'grid-lg'>(
    (localStorage.getItem('doctorViewMode') as any) || 'list'
  );
  const [repairing, setRepairing] = useState(false);
  const [clinicName, setClinicName] = useState('CIS - Centro Integrado de Saúde');
  const [waitlistTemplate, setWaitlistTemplate] = useState('');

  const [newSpec, setNewSpec] = useState('');
  const [newSpecSusExclusive, setNewSpecSusExclusive] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocSpecId, setNewDocSpecId] = useState('');
  const [newDocMinAge, setNewDocMinAge] = useState(0);
  const [newDocMaxAge, setNewDocMaxAge] = useState(100);
  const [newDocCrm, setNewDocCrm] = useState('');
  const [newDocPrefix, setNewDocPrefix] = useState('Dr.');

  // Estados para edição
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [tempDocName, setTempDocName] = useState('');
  const [tempDocSpecId, setTempDocSpecId] = useState('');
  const [tempDocMinAge, setTempDocMinAge] = useState(0);
  const [tempDocMaxAge, setTempDocMaxAge] = useState(100);
  const [tempDocCrm, setTempDocCrm] = useState('');
  const [tempDocPrefix, setTempDocPrefix] = useState('');
  const [newDocAcceptsSus, setNewDocAcceptsSus] = useState(false);
  const [tempDocAcceptsSus, setTempDocAcceptsSus] = useState(false);

  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [tempSpecName, setTempSpecName] = useState('');
  const [tempSpecSusExclusive, setTempSpecSusExclusive] = useState(false);

  // Estados de busca
  const [specialtySearch, setSpecialtySearch] = useState('');
  const [showSpecialtyDropdown, setShowSpecialtyDropdown] = useState(false);
  const [activeSpecIndex, setActiveSpecIndex] = useState(-1);
  const [docListSearch, setDocListSearch] = useState('');
  const [tempSpecialtySearch, setTempSpecialtySearch] = useState('');
  const [showTempSpecialtyDropdown, setShowTempSpecialtyDropdown] = useState(false);
  const [activeTempSpecIndex, setActiveTempSpecIndex] = useState(-1);
  const [specListSearch, setSpecListSearch] = useState('');

  // Filtragem memoizada de especialidades
  const filteredNewDocSpecialties = React.useMemo(() => {
    return especialidades.filter(e => e.name.toLowerCase().includes(specialtySearch.toLowerCase()));
  }, [especialidades, specialtySearch]);

  const filteredTempDocSpecialties = React.useMemo(() => {
    return especialidades.filter(e => e.name.toLowerCase().includes(tempSpecialtySearch.toLowerCase()));
  }, [especialidades, tempSpecialtySearch]);

  const filteredSpecList = React.useMemo(() => {
    return especialidades.filter(e => e.name.toLowerCase().includes(specListSearch.toLowerCase()));
  }, [especialidades, specListSearch]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  useEffect(() => {
    fetchData();
    fetchSystemSettings();
  }, []);

  const fetchSystemSettings = async () => {
    try {
      const { data, error } = await supabase.from('system_settings').select('*');
      if (data) {
        const retention = data.find(s => s.key === 'data_retention_days');
        const cName = data.find(s => s.key === 'clinic_name');
        const wTemplate = data.find(s => s.key === 'whatsapp_template_vaga_disponivel');

        if (retention) setRetentionDays(parseInt(retention.value));
        if (cName) setClinicName(cName.value);
        if (wTemplate) setWaitlistTemplate(wTemplate.value);
      }
    } catch (err) {
      console.warn('System settings table might not exist yet.');
    }
  };

  const saveSystemSetting = async (key: string, value: string, toastMsg: string) => {
    try {
      const { error } = await supabase.from('system_settings').upsert({
        key,
        value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
      if (error) throw error;
      addToast(toastMsg, 'success');
    } catch (err: any) {
      console.error(err);
      addToast(`Erro ao salvar: ${err.message || 'Verifique se a tabela system_settings existe.'}`, 'error');
    }
  };

  const DEFAULT_WAITLIST_TEMPLATE = "Olá, falo em nome do {clinica}\n\nPaciente {paciente} deixou o nome na lista de espera para {especialidade}. Tivemos uma desistência com o médico {medico}, no dia {data} às {hora} horas. Tem interesse na consulta?";

  const handleManualCleanup = async () => {
    setCleaning(true);
    try {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - retentionDays);

      const { count, error } = await supabase
        .from('appointments')
        .delete()
        .eq('status', 'official')
        .lt('date', expirationDate.toISOString());

      if (error) throw error;
      addToast(`Limpeza concluída! ${count || 0} registros removidos.`, 'success');
    } catch (err: any) {
      console.error(err);
      addToast('Erro ao executar limpeza.', 'error');
    } finally {
      setCleaning(false);
    }
  };

  const handleRepairAgendamentos = async () => {
    setRepairing(true);
    try {
      const { data: plans, error: plansError } = await supabase
        .from('treatment_plans')
        .select('*, patient:patients(name)')
        .eq('status', 'active');

      if (plansError) throw plansError;
      if (!plans || plans.length === 0) {
        addToast('Nenhum plano ativo encontrado.', 'info');
        return;
      }

      const { data: existingApts, error: aptsError } = await supabase
        .from('appointments')
        .select('treatment_plan_id, date')
        .eq('status', 'scheduled');

      if (aptsError) throw aptsError;

      const existingMap = new Set(existingApts?.map(a => `${a.treatment_plan_id}_${format(parseISO(a.date), 'yyyy-MM-dd')}`));
      const start = startOfMonth(new Date());
      const end = endOfMonth(addMonths(new Date(), 1));
      let createdCount = 0;
      const newAppointments: any[] = [];

      plans.forEach(plan => {
        if (!plan.schedule_days || !plan.schedule_time) return;
        let current = start;
        const planStartDate = plan.start_date ? parseISO(plan.start_date) : start;
        while (current <= end) {
          const dayName = format(current, 'eeee', { locale: ptBR });
          const dayNameCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          if (plan.schedule_days.includes(dayNameCapitalized) && current >= planStartDate) {
            const dateStr = format(current, 'yyyy-MM-dd');
            if (!existingMap.has(`${plan.id}_${dateStr}`)) {
              newAppointments.push({
                treatment_plan_id: plan.id,
                patient_id: plan.patient_id,
                doctor_id: plan.doctor_id,
                specialty_id: plan.specialty_id,
                date: `${dateStr}T${plan.schedule_time}`,
                status: 'scheduled',
                type: 'Sessão',
                is_sus: plan.is_sus
              });
            }
          }
          current = addDays(current, 1);
        }
      });

      if (newAppointments.length > 0) {
        for (let i = 0; i < newAppointments.length; i += 50) {
          const chunk = newAppointments.slice(i, i + 50);
          const { error: insertError } = await supabase.from('appointments').insert(chunk);
          if (insertError) throw insertError;
          createdCount += chunk.length;
        }
      }
      addToast(`Reparo concluído! ${createdCount} agendamentos sincronizados.`, 'success');
    } catch (err: any) {
      console.error(err);
      addToast(`Erro no reparo: ${err.message}`, 'error');
    } finally {
      setRepairing(false);
    }
  };

  const handleFixIndices = async () => {
    addToast('Índices da agenda atualizados na visualização.', 'info');
  };

  const fetchData = async () => {
    try {
      const [specsRes, docsRes] = await Promise.all([
        supabase.from('specialties').select('*').order('name'),
        supabase.from('doctors').select('*').order('name')
      ]);

      if (specsRes.data) {
        setEspecialidades(specsRes.data.map(s => ({
          id: s.id,
          name: s.name,
          is_sus_exclusive: !!s.is_sus_exclusive
        })));
      }
      if (docsRes.data) {
        const cleanName = (name: string) => {
          return name.replace(/^(dr|dra|dr\(a\))\.\s+/i, '').trim().toLowerCase();
        };

        const sortedDocs = (docsRes.data || []).sort((a, b) =>
          cleanName(a.name).localeCompare(cleanName(b.name))
        );

        setMedicos(sortedDocs.map(d => ({
          id: d.id,
          name: d.name,
          especialidade_id: d.specialty_id,
          min_age: d.min_age,
          max_age: d.max_age,
          crm: d.crm,
          accepts_sus: d.accepts_sus
        })));
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      addToast('Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpec.trim()) return;

    const exists = especialidades.some(e => e.name.toLowerCase() === newSpec.toLowerCase());
    if (exists) {
      addToast("Esta especialidade já existe!", 'error');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('specialties')
        .insert([{
          name: newSpec.trim(),
          is_sus_exclusive: newSpecSusExclusive
        }])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setEspecialidades(prev => [...prev, {
          id: data.id,
          name: data.name,
          is_sus_exclusive: data.is_sus_exclusive
        }]);
        setNewSpec('');
        setNewSpecSusExclusive(false);
        addToast('Especialidade adicionada com sucesso!', 'success');
      }
    } catch (error) {
      console.error('Erro ao adicionar especialidade:', error);
      addToast('Erro ao adicionar especialidade.', 'error');
    }
  };

  const handleDeleteSpec = async (id: string) => {
    const hasMedicos = medicos.some(m => m.especialidade_id === id);

    const executeDelete = async () => {
      try {
        const { error } = await supabase.from('specialties').delete().eq('id', id);
        if (error) throw error;
        setEspecialidades(prev => prev.filter(e => e.id !== id));
        addToast('Especialidade removida.', 'success');
      } catch (error) {
        console.error('Erro ao remover especialidade:', error);
        addToast('Erro ao remover especialidade.', 'error');
      }
    };

    if (hasMedicos) {
      setConfirmModal({
        isOpen: true,
        title: 'Excluir Especialidade',
        message: 'Existem médicos vinculados a esta especialidade. Deseja remover assim mesmo?',
        onConfirm: executeDelete
      });
    } else {
      executeDelete();
    }
  };

  const handleAddMedico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim() || !newDocSpecId) return;

    const formattedName = `${newDocPrefix} ${newDocName.trim()}`.trim();

    try {
      const { data, error } = await supabase
        .from('doctors')
        .insert([{
          name: formattedName,
          specialty_id: newDocSpecId,
          min_age: newDocMinAge,
          max_age: newDocMaxAge,
          crm: newDocCrm.trim() || null,
          accepts_sus: newDocAcceptsSus
        }])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setMedicos(prev => [...prev, {
          id: data.id,
          name: data.name,
          especialidade_id: data.specialty_id,
          min_age: data.min_age,
          max_age: data.max_age,
          crm: data.crm,
          accepts_sus: data.accepts_sus
        }]);
        setNewDocName('');
        setNewDocSpecId('');
        setNewDocAcceptsSus(false);
        setNewDocMinAge(0);
        setNewDocMaxAge(100);
        setNewDocCrm('');
        setSpecialtySearch('');
        setActiveSpecIndex(-1);
        addToast('Médico adicionado com sucesso!', 'success');
      }
    } catch (error) {
      console.error('Erro ao adicionar médico:', error);
      addToast('Erro ao adicionar médico.', 'error');
    }
  };

  const handleDeleteMedico = async (id: string) => {
    try {
      // 1. Verificar se existem agendamentos vinculados
      const { count: aptCount, error: aptError } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', id);

      if (aptError) throw aptError;

      // 2. Verificar se existem planos de tratamento vinculados
      const { count: planCount, error: planError } = await supabase
        .from('treatment_plans')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', id);

      if (planError) throw planError;

      if ((aptCount && aptCount > 0) || (planCount && planCount > 0)) {
        addToast(`Não é possível excluir: Este médico possui ${aptCount || 0} agendamentos e ${planCount || 0} planos vinculados.`, 'warning');
        return;
      }

      setConfirmModal({
        isOpen: true,
        title: 'Remover Médico',
        message: 'Tem certeza que deseja remover este médico do corpo clínico?',
        onConfirm: async () => {
          try {
            const { error } = await supabase.from('doctors').delete().eq('id', id);
            if (error) throw error;
            setMedicos(prev => prev.filter(m => m.id !== id));
            addToast('Médico removido com sucesso.', 'success');
          } catch (error) {
            console.error('Erro ao remover médico:', error);
            addToast('Erro técnico ao remover médico.', 'error');
          }
        }
      });
    } catch (error: any) {
      console.error('Erro na verificação de exclusão:', error);
      addToast('Erro ao verificar dependências do médico.', 'error');
    }
  };

  const startEditingDoc = (doc: Medico) => {
    setEditingDocId(doc.id);
    setTempDocName(doc.name);
    setTempDocSpecId(doc.especialidade_id);
    setTempDocMinAge(doc.min_age || 0);
    setTempDocMaxAge(doc.max_age || 100);
    setTempDocCrm(doc.crm || '');
    setTempDocAcceptsSus(doc.accepts_sus || false);
    const prefix = doc.name.split(' ')[0];
    setTempDocPrefix(['Dr.', 'Dra.', 'Dr(a).'].includes(prefix) ? prefix : '');
    setTempSpecialtySearch(especialidades.find(e => e.id === doc.especialidade_id)?.name || '');
  };

  // Funções de Edição de Especialidade
  const startEditingSpec = (spec: Especialidade) => {
    setEditingSpecId(spec.id);
    setTempSpecName(spec.name);
    setTempSpecSusExclusive(spec.is_sus_exclusive);
  };

  const saveSpecEdit = async () => {
    if (!tempSpecName.trim() || !editingSpecId) return;

    try {
      const { error } = await supabase
        .from('specialties')
        .update({
          name: tempSpecName.trim(),
          is_sus_exclusive: tempSpecSusExclusive
        })
        .eq('id', editingSpecId);

      if (error) throw error;

      setEspecialidades(prev => prev.map(s =>
        s.id === editingSpecId ? { ...s, name: tempSpecName.trim(), is_sus_exclusive: tempSpecSusExclusive } : s
      ));
      setEditingSpecId(null);
      addToast('Especialidade atualizada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao atualizar especialidade:', error);
      addToast('Erro ao atualizar especialidade.', 'error');
    }
  };

  useEffect(() => {
    if (newDocSpecId) {
      const spec = especialidades.find(e => e.id === newDocSpecId);
      if (spec) {
        setNewDocAcceptsSus(spec.is_sus_exclusive);
      }
    }
  }, [newDocSpecId, especialidades]);

  const saveDocEdit = async () => {
    if (!tempDocName.trim() || !editingDocId || !tempDocSpecId) return;

    const formattedName = tempDocPrefix ? `${tempDocPrefix} ${tempDocName.trim()}`.trim() : tempDocName.trim();

    try {
      const { error } = await supabase
        .from('doctors')
        .update({
          name: formattedName,
          specialty_id: tempDocSpecId,
          min_age: tempDocMinAge,
          max_age: tempDocMaxAge,
          crm: tempDocCrm.trim() || null,
          accepts_sus: tempDocAcceptsSus
        })
        .eq('id', editingDocId);

      if (error) throw error;

      setMedicos(prev => prev.map(m => m.id === editingDocId ? {
        ...m,
        name: formattedName,
        especialidade_id: tempDocSpecId,
        min_age: tempDocMinAge,
        max_age: tempDocMaxAge,
        crm: tempDocCrm.trim(),
        accepts_sus: tempDocAcceptsSus
      } : m));
      setEditingDocId(null);
      addToast('Dados do médico atualizados.', 'success');
    } catch (error) {
      console.error('Erro ao atualizar médico:', error);
      addToast('Erro ao atualizar médico.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
        <p className="text-slate-500 font-medium font-bold uppercase tracking-widest text-[10px]">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Configurações</h1>
        <p className="text-slate-500 text-sm">Gerencie o sistema e os acessos administrativos</p>
      </div>

      {!isAdmin && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-sm mb-8 animate-in slide-in-from-top-4 duration-500">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-rose-700">
                <span className="font-bold">Acesso Restrito:</span> Você está logado como <span className="uppercase font-bold">{profile?.role}</span>.
                Para gerenciar o sistema, seu nível de acesso deve ser <strong>ADMIN</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation - Grid on Mobile, Flex on Desktop */}
      <div className="mb-8 p-1.5 bg-slate-900/5 rounded-2xl border border-slate-200/50 shadow-inner">
        <div className="grid grid-cols-2 md:flex md:items-center gap-1.5">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center justify-center gap-2 px-3 py-3 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'profile'
              ? 'bg-white text-teal-600 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
              }`}
          >
            <UserCircle size={16} />
            Perfil
          </button>
          <button
            onClick={() => setActiveTab('clinical')}
            className={`flex items-center justify-center gap-2 px-3 py-3 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'clinical'
              ? 'bg-white text-teal-600 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
              }`}
          >
            <Stethoscope size={16} />
            Gestão
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center justify-center gap-2 px-3 py-3 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'users'
                  ? 'bg-white text-teal-600 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                  }`}
              >
                <Users size={16} />
                Usuários
              </button>
              <button
                onClick={() => setActiveTab('comunication')}
                className={`flex items-center justify-center gap-2 px-3 py-3 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'comunication'
                  ? 'bg-white text-teal-600 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                  }`}
              >
                <MessageCircle size={16} />
                Comunicações
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`flex items-center justify-center gap-2 px-3 py-3 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'system'
                  ? 'bg-white text-teal-600 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                  }`}
              >
                <LayoutGrid size={16} />
                Sistema
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center justify-center gap-2 px-3 py-3 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'history'
                  ? 'bg-white text-teal-600 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                  }`}
              >
                <History size={16} />
                Histórico
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'clinical' ? (
        <div key="clinical-tab" className="grid grid-cols-1 lg:grid-cols-2 gap-8 custom-fade-in">

          {/* Gestão de Especialidades */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100">
                <Tag size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Especialidades</h2>
                <p className="text-xs text-slate-500 mt-1">Áreas de atuação clínica</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[550px]">
              <div className="p-4 border-b border-slate-100 bg-white space-y-3">
                <form onSubmit={handleAddSpec} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Ex: Neurologia"
                    value={newSpec}
                    onChange={(e) => setNewSpec(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-slate-700 font-medium placeholder:text-slate-400"
                  />
                  <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="relative inline-block w-10 h-5 transition duration-200 ease-in-out">
                      <input
                        type="checkbox"
                        id="sus-toggle-settings"
                        className="peer absolute opacity-0 w-0 h-0"
                        checked={newSpecSusExclusive}
                        onChange={e => setNewSpecSusExclusive(e.target.checked)}
                      />
                      <label
                        htmlFor="sus-toggle-settings"
                        className={`block overflow-hidden h-5 rounded-full bg-gray-300 cursor-pointer transition-colors duration-200 peer-checked:bg-blue-600 relative before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:bg-white before:w-4 before:h-4 before:rounded-full before:transition-all before:duration-200 peer-checked:before:translate-x-5`}
                      />
                    </div>
                    <label htmlFor="sus-toggle-settings" className="cursor-pointer flex-1">
                      <span className="block font-bold text-blue-900 text-xs uppercase tracking-wide">Exclusivo via SUS</span>
                      <span className="block text-[10px] text-blue-700">Ocultar de "Primeira Consulta"</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={!newSpec.trim()}
                    className="w-full bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50"
                  >
                    ADICIONAR
                  </button>
                </form>
              </div>

              {/* Specialty Search Bar */}
              <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-50">
                <div className="relative">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar especialidade..."
                    value={specListSearch}
                    onChange={(e) => setSpecListSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:ring-4 focus:ring-teal-500/5 focus:border-teal-400 outline-none transition-all shadow-sm uppercase tracking-tight"
                  />
                  {specListSearch && (
                    <button
                      onClick={() => setSpecListSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <ul className="divide-y divide-slate-50">
                  {filteredSpecList.length > 0 ? filteredSpecList.map(e => (
                    <li key={e.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                      {editingSpecId === e.id ? (
                        <div className="flex-1 flex flex-col gap-3 pr-2">
                          <input
                            autoFocus
                            type="text"
                            value={tempSpecName}
                            onChange={(e) => setTempSpecName(e.target.value)}
                            className="w-full px-3 py-1.5 border-2 border-teal-400 rounded-lg text-sm font-bold text-slate-800 bg-white outline-none"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                              <input
                                type="checkbox"
                                id={`edit-sus-exclusive-${e.id}`}
                                className="w-3 h-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                checked={tempSpecSusExclusive}
                                onChange={e => setTempSpecSusExclusive(e.target.checked)}
                              />
                              <label htmlFor={`edit-sus-exclusive-${e.id}`} className="text-[9px] font-black text-blue-700 uppercase tracking-tight">SUS</label>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={saveSpecEdit}
                                className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 shadow-sm"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingSpecId(null)}
                                className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 shadow-sm"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full cursor-help ${e.is_sus_exclusive ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-teal-400'}`} title={e.is_sus_exclusive ? 'Exclusivo SUS (Azul)' : 'Geral (Verde)'}></div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-700 text-sm">{e.name}</span>
                              {e.is_sus_exclusive && <span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">Exclusivo SUS</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditingSpec(e)}
                              className="p-2 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                              title="Editar Especialidade"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteSpec(e.id)}
                              className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Remover"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  )) : (
                    <li className="p-10 text-center text-slate-400 italic text-sm">Nenhuma especialidade cadastrada.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          {/* Gestão de Médicos */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                <UserIcon size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Corpo Clínico</h2>
                <p className="text-xs text-slate-500 mt-1">Gerencie médicos e especialidades</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[550px]">
              <div className="p-4 border-b border-slate-100 bg-white">
                <form onSubmit={handleAddMedico} className="space-y-4">
                  {/* Linha 1: Grupo Nome com Prefixo - Largura Total */}
                  <div className="flex items-stretch min-w-0">
                    <div className="relative group/prefix">
                      <select
                        value={newDocPrefix}
                        onChange={(e) => setNewDocPrefix(e.target.value)}
                        className="h-full pl-4 pr-9 border border-slate-200 rounded-l-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm text-slate-700 font-black bg-white cursor-pointer border-r-0 transition-all appearance-none"
                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236366f1\' stroke-width=\'3\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
                      >
                        <option value="Dr.">Dr.</option>
                        <option value="Dra.">Dra.</option>
                        <option value="Dr(a).">Dr(a).</option>
                        <option value="">S/P</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Nome Completo do Profissional..."
                        className="w-full h-full px-5 py-3 border border-slate-200 rounded-r-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm text-slate-700 font-bold placeholder:text-slate-400 transition-all"
                        value={newDocName}
                        onChange={(e) => setNewDocName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Linha 2: CRM e Especialidade - Lado a Lado */}
                  <div className="flex flex-col md:flex-row gap-4 items-stretch">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="CRM"
                        value={newDocCrm}
                        onChange={(e) => setNewDocCrm(e.target.value)}
                        className="w-full h-full px-5 py-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm text-slate-700 font-bold placeholder:text-slate-400 transition-all font-sans"
                      />
                    </div>
                    <div className="relative flex-[1.5]">
                      <div className="relative h-full">
                        <input
                          type="text"
                          placeholder="Especialidade..."
                          value={specialtySearch}
                          onChange={(e) => {
                            setSpecialtySearch(e.target.value);
                            setShowSpecialtyDropdown(true);
                          }}
                          onFocus={() => {
                            setShowSpecialtyDropdown(true);
                            setActiveSpecIndex(0);
                          }}
                          onKeyDown={(e) => {
                            if (!showSpecialtyDropdown) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setActiveSpecIndex(prev => (prev < filteredNewDocSpecialties.length - 1 ? prev + 1 : prev));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setActiveSpecIndex(prev => (prev > 0 ? prev - 1 : 0));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (activeSpecIndex >= 0 && filteredNewDocSpecialties[activeSpecIndex]) {
                                const spec = filteredNewDocSpecialties[activeSpecIndex];
                                setNewDocSpecId(spec.id);
                                setSpecialtySearch(spec.name);
                                setShowSpecialtyDropdown(false);
                              }
                            } else if (e.key === 'Escape') {
                              setShowSpecialtyDropdown(false);
                            }
                          }}
                          className="w-full h-full px-5 py-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm text-slate-700 font-bold placeholder:text-slate-400 transition-all uppercase tracking-tight"
                        />
                        {showSpecialtyDropdown && specialtySearch.trim() && (
                          <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl shadow-slate-200/50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                            {filteredNewDocSpecialties.length > 0 ? (
                              filteredNewDocSpecialties.map((e, index) => (
                                <button
                                  key={e.id}
                                  type="button"
                                  onClick={() => {
                                    setNewDocSpecId(e.id);
                                    setSpecialtySearch(e.name);
                                    setShowSpecialtyDropdown(false);
                                  }}
                                  onMouseMove={() => setActiveSpecIndex(index)}
                                  className={`w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between group ${index === activeSpecIndex ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-4' : ''}`}
                                >
                                  <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">{e.name}</span>
                                  {e.is_sus_exclusive && <span className="text-[10px] font-black text-blue-500 uppercase">SUS</span>}
                                </button>
                              ))
                            ) : (
                              <div className="px-5 py-4 text-slate-400 text-xs italic">Nenhuma especialidade encontrada.</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Linha 3: Rodapé com Faixa Etária e Botão */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 items-end">
                    <div className="md:col-span-6 space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Faixa de Atendimento:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={newDocMinAge}
                          min="0"
                          onChange={(e) => setNewDocMinAge(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-center text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all transition-all bg-white"
                        />
                        <span className="text-slate-400 font-medium text-xs">até</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={newDocMaxAge}
                          min="0"
                          onChange={(e) => setNewDocMaxAge(parseInt(e.target.value) || 100)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-center text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all transition-all bg-white"
                        />
                        <span className="text-[10px] text-slate-400 font-black tracking-widest ml-1">ANOS</span>
                      </div>
                    </div>

                    <div className="md:col-span-3 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Modalidade</label>
                      <button
                        type="button"
                        onClick={() => setNewDocAcceptsSus(!newDocAcceptsSus)}
                        className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${newDocAcceptsSus ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-600'}`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${newDocAcceptsSus ? 'border-white bg-white' : 'border-slate-300'}`}>
                          {newDocAcceptsSus && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Atende SUS</span>
                      </button>
                    </div>

                    <div className="md:col-span-3">
                      <button
                        type="submit"
                        disabled={!newDocName.trim() || !newDocSpecId}
                        className="w-full bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-900/10 disabled:opacity-50 flex items-center justify-center gap-2 h-[42px]"
                      >
                        <Plus size={16} />
                        SALVAR MÉDICO
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Barra de Pesquisa de Médicos */}
              <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-50">
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar médico por nome ou especialidade..."
                    value={docListSearch}
                    onChange={(e) => setDocListSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-400 outline-none transition-all shadow-sm uppercase tracking-tight"
                  />
                  {docListSearch && (
                    <button
                      onClick={() => setDocListSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <ul className="divide-y divide-slate-50">
                  {medicos.filter(m => {
                    const search = docListSearch.toLowerCase();
                    const specName = especialidades.find(e => e.id === m.especialidade_id)?.name.toLowerCase() || '';
                    return m.name.toLowerCase().includes(search) || specName.includes(search);
                  }).length > 0 ? medicos.filter(m => {
                    const search = docListSearch.toLowerCase();
                    const specName = especialidades.find(e => e.id === m.especialidade_id)?.name.toLowerCase() || '';
                    return m.name.toLowerCase().includes(search) || specName.includes(search);
                  }).map(m => (
                    <li
                      key={m.id}
                      className="px-5 py-4 flex flex-col hover:bg-slate-50/50 transition-all group border-b border-slate-50 last:border-0"
                    >
                      {editingDocId === m.id ? (
                        <div className="w-full flex flex-col gap-5 py-3">
                          {/* Linha 1: Grupo de Identidade - Edição */}
                          <div className="flex items-stretch min-w-0">
                            <select
                              value={tempDocPrefix}
                              onChange={(e) => setTempDocPrefix(e.target.value)}
                              className="pl-3 pr-8 border border-slate-200 rounded-l-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-xs font-black text-slate-700 bg-white cursor-pointer border-r-0 transition-all appearance-none"
                              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236366f1\' stroke-width=\'3\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '0.8rem' }}
                            >
                              <option value="">S/P</option>
                              <option value="Dr.">Dr.</option>
                              <option value="Dra.">Dra.</option>
                              <option value="Dr(a).">Dr(a).</option>
                            </select>
                            <input
                              autoFocus
                              type="text"
                              value={tempDocName}
                              onChange={(e) => setTempDocName(e.target.value)}
                              className="w-full px-4 py-3 border border-slate-200 rounded-r-xl text-sm font-bold text-slate-800 bg-white outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                              placeholder="Nome do Profissional..."
                            />
                          </div>

                          {/* Linha 2: CRM e Especialidade - Edição */}
                          <div className="flex flex-col md:flex-row gap-4 items-stretch">
                            <input
                              type="text"
                              placeholder="CRM"
                              value={tempDocCrm}
                              onChange={(e) => setTempDocCrm(e.target.value)}
                              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-center font-sans"
                            />
                            <div className="relative flex-[1.5]">
                              <div className="relative h-full">
                                <input
                                  type="text"
                                  placeholder="Especialidade..."
                                  value={tempSpecialtySearch}
                                  onChange={(e) => {
                                    setTempSpecialtySearch(e.target.value);
                                    setShowTempSpecialtyDropdown(true);
                                    setActiveTempSpecIndex(0);
                                  }}
                                  onFocus={() => {
                                    setShowTempSpecialtyDropdown(true);
                                    setActiveTempSpecIndex(0);
                                  }}
                                  onKeyDown={(e) => {
                                    if (!showTempSpecialtyDropdown) return;
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      setActiveTempSpecIndex(prev => (prev < filteredTempDocSpecialties.length - 1 ? prev + 1 : prev));
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      setActiveTempSpecIndex(prev => (prev > 0 ? prev - 1 : 0));
                                    } else if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (activeTempSpecIndex >= 0 && filteredTempDocSpecialties[activeTempSpecIndex]) {
                                        const spec = filteredTempDocSpecialties[activeTempSpecIndex];
                                        setTempDocSpecId(spec.id);
                                        setTempSpecialtySearch(spec.name);
                                        setShowTempSpecialtyDropdown(false);
                                      }
                                    } else if (e.key === 'Escape') {
                                      setShowTempSpecialtyDropdown(false);
                                    }
                                  }}
                                  className="w-full h-full px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-black text-slate-700 bg-white outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all uppercase tracking-tight"
                                />
                                {showTempSpecialtyDropdown && tempSpecialtySearch.trim() && (
                                  <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl shadow-slate-200/50 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                                    {filteredTempDocSpecialties.length > 0 ? (
                                      filteredTempDocSpecialties.map((e, index) => (
                                        <button
                                          key={e.id}
                                          type="button"
                                          onClick={() => {
                                            setTempDocSpecId(e.id);
                                            setTempSpecialtySearch(e.name);
                                            setShowTempSpecialtyDropdown(false);
                                          }}
                                          onMouseMove={() => setActiveTempSpecIndex(index)}
                                          className={`w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between group ${index === activeTempSpecIndex ? 'bg-indigo-50 border-l-4 border-l-indigo-500 pl-4' : ''}`}
                                        >
                                          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">{e.name}</span>
                                          {e.is_sus_exclusive && <span className="text-[9px] font-black text-blue-500 uppercase">SUS</span>}
                                        </button>
                                      ))
                                    ) : (
                                      <div className="px-5 py-4 text-slate-400 text-xs italic">Nenhuma especialidade encontrada.</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Linha 3: Faixa Etária e Ações - Edição */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 items-end mt-2">
                            {/* Faixa Etária */}
                            <div className="md:col-span-5 space-y-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Faixa de Atendimento:</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={tempDocMinAge}
                                  onChange={(e) => setTempDocMinAge(parseInt(e.target.value) || 0)}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-center text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-white"
                                />
                                <span className="text-slate-400 font-medium text-xs">até</span>
                                <input
                                  type="number"
                                  value={tempDocMaxAge}
                                  onChange={(e) => setTempDocMaxAge(parseInt(e.target.value) || 100)}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-center text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-white"
                                />
                                <span className="text-[10px] text-slate-400 font-black tracking-widest ml-1">ANOS</span>
                              </div>
                            </div>

                            {/* Atende SUS Toggle */}
                            <div className="md:col-span-3 space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Modalidade</label>
                              <button
                                type="button"
                                onClick={() => setTempDocAcceptsSus(!tempDocAcceptsSus)}
                                className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${tempDocAcceptsSus ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-600'}`}
                              >
                                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${tempDocAcceptsSus ? 'border-white bg-white' : 'border-slate-300'}`}>
                                  {tempDocAcceptsSus && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest leading-none">Aceita SUS</span>
                              </button>
                            </div>

                            {/* Botões de Ação */}
                            <div className="md:col-span-4 flex items-center gap-2">
                              <button
                                onClick={() => saveDocEdit()}
                                className="flex-1 bg-indigo-600 text-white px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/10 h-[42px]"
                              >
                                <Check size={16} />
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditingDocId(null)}
                                className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all h-[42px] flex items-center justify-center"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm tracking-tight">{m.name}</span>
                              {m.accepts_sus ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-tighter">Atende SUS</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-tighter">Livre Demanda</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="uppercase font-black text-indigo-500 tracking-wider text-[10px]">
                                {especialidades.find(e => e.id === m.especialidade_id)?.name || 'Sem especialidade'}
                              </span>
                              {m.crm && (
                                <>
                                  <span className="text-[10px] text-slate-300 transform translate-y-[-1px]">•</span>
                                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                                    CRM {m.crm}
                                  </span>
                                </>
                              )}
                              <span className="text-[10px] text-slate-300 transform translate-y-[-1px]">•</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full">
                                {m.min_age || 0} a {m.max_age || 100} ANOS
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                            <button
                              onClick={() => startEditingDoc(m)}
                              className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                              title="Editar Profissional"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteMedico(m.id)}
                              className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                              title="Remover"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )) : (
                    <li className="p-10 text-center text-slate-400 italic text-sm">Nenhum médico cadastrado.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>
        </div>
      ) : activeTab === 'comunication' ? (
        <div key="comunication-tab" className="max-w-4xl mx-auto custom-fade-in space-y-8 pb-10">
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
                <MessageCircle size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Canais de Comunicação</h2>
                <p className="text-sm text-slate-500 font-medium">Configure as mensagens automáticas do WhatsApp</p>
              </div>
            </div>

            <div className="p-8 space-y-10">
              {/* Nome da Clínica */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Identificação da Clínica</label>
                    <p className="text-[10px] text-slate-500 font-medium ml-1">Nome que aparecerá na variável {'{clinica}'}</p>
                  </div>
                  <button 
                    onClick={() => saveSystemSetting('clinic_name', clinicName, 'Nome da clínica salvo!')}
                    className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                  >
                    Salvar Nome
                  </button>
                </div>
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="Ex: CIS - Centro Integrado de Saúde"
                  className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-bold text-slate-800 shadow-inner"
                />
              </div>

              <div className="h-px bg-slate-100" />

              {/* Template: Vaga Disponível */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Mensagem: Vaga Disponível (Fila)</label>
                    <p className="text-[10px] text-slate-500 font-medium ml-1">Disparada ao avisar pacientes sobre desistências</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setWaitlistTemplate(DEFAULT_WAITLIST_TEMPLATE)}
                      className="bg-slate-100 text-slate-500 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Padrão
                    </button>
                    <button 
                      onClick={() => saveSystemSetting('whatsapp_template_vaga_disponivel', waitlistTemplate, 'Template de mensagem salvo!')}
                      className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10 active:scale-95"
                    >
                      Salvar Template
                    </button>
                  </div>
                </div>
                
                <div className="relative group">
                  <textarea
                    value={waitlistTemplate}
                    onChange={(e) => setWaitlistTemplate(e.target.value)}
                    rows={6}
                    placeholder="Escreva sua mensagem aqui..."
                    className="w-full px-5 py-5 border-2 border-slate-100 rounded-3xl focus:border-emerald-500/50 focus:ring-8 focus:ring-emerald-500/5 outline-none transition-all font-medium text-slate-700 leading-relaxed shadow-inner resize-none"
                  />
                  
                  {/* Legend/Placeholders */}
                  <div className="mt-4 bg-slate-50 rounded-2xl p-5 border border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <h4 className="col-span-full text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Variáveis Disponíveis:</h4>
                    {[
                      { key: '{paciente}', desc: 'Nome do Paciente' },
                      { key: '{especialidade}', desc: 'Especialidade' },
                      { key: '{medico}', desc: 'Nome do Médico' },
                      { key: '{data}', desc: 'Data (Hoje)' },
                      { key: '{hora}', desc: 'Horário do Agendamento' },
                      { key: '{clinica}', desc: 'Nome da Clínica' },
                    ].map(item => (
                      <div key={item.key} className="flex flex-col gap-0.5">
                        <code className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-fit">{item.key}</code>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-amber-50 rounded-2xl p-6 border border-amber-100">
             <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest mb-1">Dica de Formatação</h4>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                    O WhatsApp aceita formatação simples: use <b>*texto*</b> para negrito e <b>_texto_</b> para itálico. 
                    As quebras de linha que você digitar no campo acima serão preservadas na mensagem enviada.
                  </p>
                </div>
             </div>
          </section>
        </div>
      ) : activeTab === 'system' ? (
        <div key="system-tab" className="max-w-2xl mx-auto custom-fade-in space-y-8">
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                <RefreshCw size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Manutenção da Agenda</h2>
                <p className="text-sm text-slate-500 font-medium">Sincronização e Reparo de Dados</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
                <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-2">Reparar Agendamentos</h3>
                <p className="text-xs text-indigo-700 font-medium mb-6 leading-relaxed">
                  Esta ferramenta cria registros físicos de agendamentos para datas projetadas (baseadas no plano de tratamento) que ainda não existem no banco de dados. Útil para sincronizar a agenda após alterações massivas.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleRepairAgendamentos}
                    disabled={repairing}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-900/20 flex items-center gap-3 disabled:opacity-50"
                  >
                    {repairing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {repairing ? 'Sincronizando...' : 'Sincronizar Pacientes'}
                  </button>
                  <button
                    onClick={handleFixIndices}
                    className="bg-white border border-indigo-200 text-indigo-600 px-8 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    Corrigir Índices
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-600 shadow-inner">
                <LayoutGrid size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Manutenção de Dados</h2>
                <p className="text-sm text-slate-500 font-medium">Configure políticas de limpeza automática</p>
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Dias para Retenção de Agendamentos "Oficiais"</span>
                  <div className="mt-2 flex items-center gap-4">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      disabled={!isAdmin}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                      className="w-32 px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all font-black text-slate-800 text-lg shadow-inner"
                    />
                    <div className="flex-1 text-sm text-slate-500 font-medium leading-relaxed">
                      Agendamentos marcados como <span className="text-teal-600 font-bold">Oficiais</span> serão mantidos por este período antes da exclusão.
                    </div>
                  </div>
                </label>
                <button
                  onClick={() => saveSystemSetting('data_retention_days', retentionDays.toString(), 'Configuração de retenção salva!')}
                  className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                  Salvar Política
                </button>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="bg-rose-50 rounded-2xl p-6 border border-rose-100">
                <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest mb-2">Limpeza Manual Imediata</h3>
                <p className="text-xs text-rose-700 font-medium mb-6 leading-relaxed">
                  Esta ação removerá permanentemente do banco de dados todos os pacientes marcados como "Oficiais" que excederem o prazo de {retentionDays} dias.
                </p>
                <button
                  onClick={handleManualCleanup}
                  disabled={cleaning}
                  className="bg-rose-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-rose-700 transition-all shadow-xl shadow-rose-900/20 flex items-center gap-3 disabled:opacity-50"
                >
                  {cleaning ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {cleaning ? 'Limpando...' : 'Executar Limpeza Agora'}
                </button>
              </div>
            </div>
          </section>

          <footer className="text-center px-8">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em]">Ambiente de Configuração Crítica</p>
            <p className="text-[9px] text-slate-300 mt-2 leading-relaxed">As alterações nesta aba afetam a persistência de dados de todos os usuários do sistema.</p>
          </footer>
        </div>
      ) : activeTab === 'profile' ? (
        <div key="profile-tab" className="custom-fade-in">
          <ProfileSettings />
        </div>
      ) : activeTab === 'users' ? (
        <div key="users-tab" className="custom-fade-in">
          <UserManagement />
        </div>
      ) : (
        <div key="history-tab" className="custom-fade-in">
          <HistoryPage />
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
      />
    </div >
  );
};

export default Settings;
