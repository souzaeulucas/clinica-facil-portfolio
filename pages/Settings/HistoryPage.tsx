import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { History, User as UserIcon, Calendar, Info, ArrowRight, Database, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '../../contexts/ToastContext';
import ConfirmModal from '../../components/ConfirmModal';

interface AuditLog {
    id: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    table_name: string;
    record_id: string;
    old_data: any;
    new_data: any;
    created_at: string;
    profiles: {
        email: string;
        full_name?: string;
    } | null;
}

const HistoryPage: React.FC = () => {
    const { addToast } = useToast();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [totalCount, setTotalCount] = useState(0); // Added for pagination support
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const pageSize = 15;
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, [page]);

    useEffect(() => {
        // Subscribe to changes in audit logs
        const channel = supabase
            .channel('audit-logs-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'audit_logs'
                },
                () => {

                    fetchLogs();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();


            const { data, error, count } = await supabase
                .from('audit_logs')
                .select(`
                    *,
                    profiles:profiles!user_id (
                        email,
                        full_name
                    )
                `, { count: 'exact' })

                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                console.error('Audit Fetch Error:', error);
                addToast(`Erro ao carregar auditoria: ${error.message}`, 'error');
                console.error('Error fetching logs:', error);

                // Check specifically for JWT expired error
                if (error.code === 'PGRST301' || error.message?.includes('JWT expired')) {
                    addToast('Sua sessão expirou. Por favor, recarregue a página.', 'error');
                } else {
                    addToast('Erro ao carregar histórico.', 'error');
                }
            } else {

                setLogs(data || []);
                setTotalCount(count || 0);
            }
        } catch (error: any) {
            console.error('Error fetching logs:', error);
            // This catch block will handle network errors or other unexpected errors
            addToast(`Erro inesperado ao carregar auditoria: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };


    const handleClearHistory = async () => {
        setIsClearing(true);
        try {

            const { error, count } = await supabase
                .from('audit_logs')
                .delete({ count: 'exact' })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Standard UUID non-match


            if (error) {
                console.error('Delete Error:', error);
                throw error;
            }



            setLogs([]);
            setPage(0);
            addToast('Histórico limpo com sucesso!', 'success');
        } catch (error: any) {
            addToast(`Erro ao limpar histórico: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally {
            setIsClearing(false);
            setIsConfirmOpen(false);
        }
    };


    const getActionBadge = (action: string) => {
        switch (action) {
            case 'INSERT':
                return <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Criar</span>;
            case 'UPDATE':
                return <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Editar</span>;
            case 'DELETE':
                return <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Excluir</span>;
            default:
                return null;
        }
    };

    const getTableName = (name: string) => {
        const names: Record<string, string> = {
            appointments: 'Agendamento',
            patients: 'Paciente',
            doctors: 'Médico',
            specialties: 'Especialidade',
            profiles: 'Acesso / Perfil'
        };
        return names[name] || name;
    };

    const renderDataPreview = (log: AuditLog) => {
        const data = log.new_data || log.old_data;
        if (!data) return 'Sem detalhes';

        if (log.table_name === 'appointments') {
            const extra = data.type === 'Retorno' ? ' (Retorno)' : ' (Consulta)';
            return `${data.date ? format(new Date(data.date), 'dd/MM HH:mm') : ''}${extra}`;
        }
        return data.name || data.nome || data.email || data.role || data.id || 'Ver detalhes';

    };


    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg shadow-slate-900/10">
                        <History size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Auditoria</h2>
                        <p className="text-xs text-slate-500 mt-1">Histórico completo de alterações no sistema</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {logs.length > 0 && (
                        <button
                            onClick={() => setIsConfirmOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all"
                            title="Limpar todo o histórico"
                        >
                            <Trash2 size={16} />
                            Limpar Tudo
                        </button>
                    )}
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={logs.length < pageSize}
                        className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
                {/* Mobile view: Cards (No Scroll) */}
                <div className="md:hidden divide-y divide-slate-100">
                    {loading ? (
                        <div className="px-6 py-20 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-bold uppercase tracking-widest">Carregando histórico...</span>
                            </div>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="px-6 py-20 text-center text-slate-400 italic text-sm">Nenhuma atividade registrada ainda.</div>
                    ) : (
                        logs.map((log) => (
                            <div key={log.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-slate-800">{format(new Date(log.created_at), 'dd MMM, yyyy', { locale: ptBR })}</span>
                                        <span className="text-[10px] text-slate-400 font-bold">{format(new Date(log.created_at), 'HH:mm:ss')}</span>
                                    </div>
                                    {getActionBadge(log.action)}
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 shrink-0">
                                        <UserIcon size={12} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-600 truncate">
                                        {log.profiles?.full_name || log.profiles?.email || 'Sistema'}
                                    </span>
                                </div>

                                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100/50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Database size={12} className="text-slate-400" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{getTableName(log.table_name)}</span>
                                    </div>
                                    <span className="text-xs text-slate-700 font-bold block leading-relaxed">
                                        {renderDataPreview(log)}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Desktop view: Table (Hidden on small screens) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data / Hora</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuário</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ação</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhe</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-xs font-bold uppercase tracking-widest">Carregando histórico...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic text-sm">Nenhuma atividade registrada ainda.</td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700">{format(new Date(log.created_at), 'dd MMM, yyyy', { locale: ptBR })}</span>
                                            <span className="text-[10px] text-slate-400 font-medium">{format(new Date(log.created_at), 'HH:mm:ss')}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
                                                <UserIcon size={14} />
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600 truncate max-w-[150px]">
                                                {log.profiles?.full_name || log.profiles?.email || 'Sistema'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {getActionBadge(log.action)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Database size={14} className="text-slate-400" />
                                            <span className="text-xs font-bold text-slate-800 tracking-tight">{getTableName(log.table_name)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-slate-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis block max-w-[200px]">
                                            {renderDataPreview(log)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmModal
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleClearHistory}
                title="Limpar Histórico"
                message="Tem certeza que deseja apagar permanentemente todo o histórico de auditoria? Esta ação não pode ser desfeita."
                type="danger"
                confirmText={isClearing ? "Limpando..." : "Sim, Limpar Tudo"}
            />
        </div>
    );
};

export default HistoryPage;

