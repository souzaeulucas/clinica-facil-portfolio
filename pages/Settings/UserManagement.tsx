import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Users, Shield, User as UserIcon, ShieldCheck, Check, X, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

interface Profile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: 'admin' | 'receptionist' | 'doctor';
}

const UserManagement: React.FC = () => {
    const { addToast } = useToast();
    const { profile: currentProfile } = useAuth();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    // Editing State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRole, setEditRole] = useState<Profile['role']>('receptionist');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('email');

            if (error) throw error;
            setProfiles(data || []);
        } catch (error) {
            console.error('Error fetching profiles:', error);
            addToast('Erro ao carregar usuários.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (p: Profile) => {
        setEditingId(p.id);
        setEditName(p.full_name || '');
        setEditRole(p.role);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
    };

    const handleSave = async (userId: string) => {
        if (userId === currentProfile?.id && editRole !== currentProfile.role) {
            // Optional: Allow name change but warn about role
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: editName.trim() || null,
                    role: editRole
                })
                .eq('id', userId);

            if (error) throw error;

            setProfiles(prev => prev.map(p => p.id === userId ? { ...p, full_name: editName.trim() || null, role: editRole } : p));
            addToast('Usuário atualizado com sucesso!', 'success');
            setEditingId(null);
        } catch (error) {
            console.error('Error updating user:', error);
            addToast('Erro ao atualizar usuário.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const getRoleLabel = (role: Profile['role']) => {
        switch (role) {
            case 'admin': return 'Administrador';
            case 'receptionist': return 'Recepção / Comum';
            case 'doctor': return 'Médico';
            default: return role;
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
                <p className="text-slate-500 font-medium">Carregando usuários...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 custom-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <ShieldCheck className="text-teal-600" size={24} />
                        Controle de Usuários
                    </h2>
                    <p className="text-sm text-slate-500">Gerencie nomes e permissões de acesso ao sistema</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuário</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-64">Nome de Exibição</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo e Acesso</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {profiles.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                                                <UserIcon size={18} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-700">{p.email || 'Sem e-mail'}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Name Column */}
                                    <td className="px-6 py-4">
                                        {editingId === p.id ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                placeholder="Nome do usuário"
                                                className="w-full px-3 py-1.5 border-2 border-teal-400 rounded-lg text-sm font-bold text-slate-800 outline-none"
                                            />
                                        ) : (
                                            <span className={`text-sm font-medium ${p.full_name ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                                                {p.full_name || 'Não definido'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Role Column */}
                                    <td className="px-6 py-4">
                                        {editingId === p.id ? (
                                            <select
                                                value={editRole}
                                                onChange={e => setEditRole(e.target.value as any)}
                                                className="bg-white border-2 border-teal-400 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer w-full"
                                                disabled={p.id === currentProfile?.id} // Prevent changing own role if risky, or allow it.
                                            >
                                                <option value="receptionist">Recepção / Comum</option>
                                                <option value="doctor">Médico</option>
                                                <option value="admin">Administrador</option>
                                            </select>
                                        ) : (
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${p.role === 'admin'
                                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : p.role === 'doctor'
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                    : 'bg-teal-50 text-teal-700 border-teal-100'
                                                }`}>
                                                {getRoleLabel(p.role)}
                                            </span>
                                        )}
                                    </td>

                                    {/* Actions Column */}
                                    <td className="px-6 py-4 text-right">
                                        {editingId === p.id ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleSave(p.id)}
                                                    disabled={saving}
                                                    className="p-1.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 shadow-sm transition-all"
                                                >
                                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                </button>
                                                <button
                                                    onClick={cancelEditing}
                                                    disabled={saving}
                                                    className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-all"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => startEditing(p)}
                                                className="p-2 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                                                title="Editar Usuário"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
