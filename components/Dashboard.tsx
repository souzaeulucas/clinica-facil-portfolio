
import React, { useState, useMemo } from 'react';
import { PacienteRetorno, PacientePrimeiraConsulta, Medico, Especialidade } from '../types';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import Portal from './Portal';
import ModernDatePicker from './ui/ModernDatePicker';
import ModernSelect from './ui/ModernSelect';

interface DashboardProps {
  dataRetorno: PacienteRetorno[];
  dataPrimeira: PacientePrimeiraConsulta[];
  onDeleteRetorno: (id: string) => void;
  onDeletePrimeira: (id: string) => void;
  onUpdateRetorno: (data: PacienteRetorno) => void;
  onUpdatePrimeira: (data: PacientePrimeiraConsulta) => void;
  medicos: Medico[];
  especialidades: Especialidade[];
}

const Dashboard: React.FC<DashboardProps> = ({
  dataRetorno,
  dataPrimeira,
  onDeleteRetorno,
  onDeletePrimeira,
  onUpdateRetorno,
  onUpdatePrimeira,
  medicos,
  especialidades
}) => {
  const [activeTab, setActiveTab] = useState<'primeira' | 'retorno'>('primeira');
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<PacienteRetorno | PacientePrimeiraConsulta | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'primeira' | 'retorno' } | null>(null);

  // Filtros aplicados em tempo real
  const filteredPrimeira = useMemo(() => {
    return dataPrimeira.filter(p =>
      p.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.medico.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.especialidade.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [dataPrimeira, searchTerm]);

  const filteredRetorno = useMemo(() => {
    return dataRetorno.filter(p => {
      const matchesSearch =
        p.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.medico.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.especialidade.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMonth = monthFilter === '' ||
        (p.proxima_consulta && p.proxima_consulta.split('-')[1] === monthFilter);

      let matchesDateRange = true;
      if (startDate || endDate) {
        try {
          const pDate = parseISO(p.proxima_consulta);
          const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
          const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
          matchesDateRange = isWithinInterval(pDate, { start, end });
        } catch (e) {
          matchesDateRange = true;
        }
      }

      return matchesSearch && matchesMonth && matchesDateRange;
    });
  }, [dataRetorno, searchTerm, monthFilter, startDate, endDate]);

  // Estatísticas Dinâmicas
  const stats = useMemo(() => {
    const currentList = activeTab === 'primeira' ? filteredPrimeira : filteredRetorno;
    const total = currentList.length;

    const bySpecialty: Record<string, number> = {};
    const byDoctor: Record<string, number> = {};

    currentList.forEach(p => {
      bySpecialty[p.especialidade] = (bySpecialty[p.especialidade] || 0) + 1;
      if (p.medico && p.medico !== 'A definir') {
        byDoctor[p.medico] = (byDoctor[p.medico] || 0) + 1;
      }
    });

    const topSpec = Object.entries(bySpecialty).sort((a, b) => b[1] - a[1])[0];
    const topDoc = Object.entries(byDoctor).sort((a, b) => b[1] - a[1])[0];

    return { total, topSpec, topDoc };
  }, [activeTab, filteredPrimeira, filteredRetorno]);

  const months = [
    { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
  ];

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditFormData({ ...item });
  };

  const handleSaveEdit = () => {
    if (!editFormData) return;
    if (activeTab === 'primeira') {
      onUpdatePrimeira(editFormData as PacientePrimeiraConsulta);
    } else {
      onUpdateRetorno(editFormData as PacienteRetorno);
    }
    setEditingId(null);
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'primeira') {
      onDeletePrimeira(confirmDelete.id);
    } else {
      onDeleteRetorno(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Modal de Confirmação de Exclusão */}
      {confirmDelete && (
        <Portal>
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-center text-slate-900 mb-2 tracking-tight">Excluir Paciente?</h3>
              <p className="text-slate-500 text-center text-sm mb-8 font-medium">
                Você está prestes a remover este registro permanentemente.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={executeDelete}
                  className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-700 transition-all shadow-lg shadow-red-900/20 active:scale-95"
                >
                  Confirmar Exclusão
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="w-full bg-transparent text-slate-400 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-b-4 border-b-blue-500">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pacientes Ativos</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-3xl font-black text-blue-900">{stats.total}</p>
            <span className="text-gray-400 text-xs font-bold">atendimentos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-b-4 border-b-indigo-500">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Especialidade em Foco</p>
          <p className="text-lg font-bold text-indigo-900 mt-1 truncate">
            {stats.topSpec ? stats.topSpec[0] : 'Nenhum dado'}
          </p>
          <p className="text-[10px] text-gray-400 font-bold">{stats.topSpec ? `${stats.topSpec[1]} registros` : '-'}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-b-4 border-b-emerald-500">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Maior Volume Médico</p>
          <p className="text-lg font-bold text-emerald-900 mt-1 truncate">
            {stats.topDoc ? stats.topDoc[0] : 'Nenhum médico'}
          </p>
          <p className="text-[10px] text-gray-400 font-bold">{stats.topDoc ? `${stats.topDoc[1]} pacientes` : '-'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-gray-800">Visualização de Registros</h2>
        <div className="flex bg-gray-200 p-1 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => { setActiveTab('primeira'); setSearchTerm(''); setMonthFilter(''); setStartDate(''); setEndDate(''); }}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'primeira' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
              }`}
          >
            Primeira Consulta
          </button>
          <button
            onClick={() => setActiveTab('retorno')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'retorno' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
              }`}
          >
            Retorno
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Filtros */}
        <div className="p-4 sm:p-6 bg-gray-50/50 border-b border-gray-100 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 relative w-full">
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Buscar paciente/médico</label>
              <input
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm bg-white text-gray-900 font-medium placeholder-gray-400"
              />
              <div className="absolute right-3 top-9 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {activeTab === 'retorno' && (
              <div className="w-full md:w-56">
                <ModernSelect
                  label="Filtrar por Mês"
                  value={monthFilter}
                  options={[
                    { value: '', label: 'Todos os meses' },
                    ...months.map(m => ({ value: m.value, label: m.label }))
                  ]}
                  onChange={setMonthFilter}
                />
              </div>
            )}
          </div>

          {activeTab === 'retorno' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4 border-t border-gray-200/60">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Data exata do retorno:</span>
              <div className="flex items-center gap-3">
                <div className="w-40">
                  <ModernDatePicker
                    value={startDate}
                    onChange={setStartDate}
                  />
                </div>
                <span className="text-gray-300 font-bold">~</span>
                <div className="w-40">
                  <ModernDatePicker
                    value={endDate}
                    onChange={setEndDate}
                  />
                </div>
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                    title="Limpar intervalo de datas"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tabela de Dados */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/80 text-gray-500 font-bold uppercase text-[10px] tracking-[0.1em]">
              <tr>
                <th className="px-6 py-4 border-b">Paciente</th>
                <th className="px-6 py-4 border-b">Especialidade</th>
                <th className="px-6 py-4 border-b">Médico Responsável</th>
                {activeTab === 'primeira' ? (
                  <th className="px-6 py-4 border-b">Contato</th>
                ) : (
                  <>
                    <th className="px-6 py-4 border-b">Ult. Consulta</th>
                    <th className="px-6 py-4 border-b">Próx. Retorno</th>
                  </>
                )}
                <th className="px-6 py-4 border-b text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(activeTab === 'primeira' ? filteredPrimeira : filteredRetorno).length > 0 ? (
                (activeTab === 'primeira' ? filteredPrimeira : filteredRetorno).map((p) => (
                  <tr key={p.id} className="hover:bg-[#1E3A8A]/[0.02] transition-all group">
                    <td className="px-6 py-4">
                      {editingId === p.id ? (
                        <input
                          autoFocus
                          className="w-full border-2 border-blue-400 p-2 rounded-lg focus:ring-4 focus:ring-blue-100 outline-none font-bold text-gray-900 bg-white"
                          value={editFormData?.nome_completo || ''}
                          onChange={e => editFormData && setEditFormData({ ...editFormData, nome_completo: e.target.value })}
                        />
                      ) : (
                        <span className="font-bold text-gray-900 block">{p.nome_completo}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-[#1E3A8A]/10 text-[#1E3A8A] px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                        {p.especialidade}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-medium">{p.medico}</td>

                    {activeTab === 'primeira' ? (
                      <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                        {editingId === p.id ? (
                          <input
                            className="w-full border-2 border-blue-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none text-gray-900 bg-white"
                            value={editFormData ? (editFormData as PacientePrimeiraConsulta).telefone : ''}
                            onChange={e => editFormData && setEditFormData({ ...editFormData, telefone: e.target.value })}
                          />
                        ) : (
                          (p as PacientePrimeiraConsulta).telefone
                        )}
                      </td>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-gray-500 font-medium">
                          {format(parseISO((p as PacienteRetorno).data_consulta), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-black text-blue-700">
                              {format(parseISO((p as PacienteRetorno).proxima_consulta), 'dd/MM/yyyy')}
                            </span>
                            <span className="text-[9px] uppercase font-bold text-gray-400">Em {(p as PacienteRetorno).periodo_retorno} meses</span>
                          </div>
                        </td>
                      </>
                    )}

                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-3">
                        {editingId === p.id ? (
                          <button
                            onClick={handleSaveEdit}
                            className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-black hover:bg-green-700 shadow-md active:scale-95 transition-all"
                          >
                            OK
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(p)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                              title="Editar Informações"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ id: p.id!, type: activeTab })}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title="Excluir da Lista"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <p className="text-gray-400 font-bold text-lg">Nenhum agendamento encontrado.</p>
                      <p className="text-gray-300 text-sm max-w-xs mx-auto">Tente ajustar os filtros ou pesquisar por outro termo.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
