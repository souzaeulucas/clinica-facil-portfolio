import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { User, Lock, Save, Loader2, Key } from 'lucide-react';

const ProfileSettings: React.FC = () => {
    const { profile, user, refreshProfile } = useAuth();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [fullName, setFullName] = useState('');
    const [socialPrice, setSocialPrice] = useState<number | ''>('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    useEffect(() => {
        if (profile?.full_name) {
            setFullName(profile.full_name);
        }
        if (profile?.social_price !== undefined && profile?.social_price !== null) {
            setSocialPrice(profile.social_price);
        }
    }, [profile]);

    interface ProfileUpdates {
        full_name: string;
        updated_at: string;
        social_price?: number;
    }

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            const updates: ProfileUpdates = {
                full_name: fullName.trim(),
                updated_at: new Date().toISOString(),
            };

            if (socialPrice !== '') {
                updates.social_price = socialPrice as number;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id);

            if (error) throw error;

            await refreshProfile();
            addToast('Perfil atualizado com sucesso!', 'success');
        } catch (error) {
            console.error('Error updating profile:', error);
            const err = error as { message?: string, details?: string };
            const errorMessage = err.message || err.details || 'Erro desconhecido';
            addToast(`Erro ao atualizar perfil: ${errorMessage}`, 'error');
        } finally {
            setLoading(true); // Wait for refresh
            setTimeout(() => setLoading(false), 500);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            addToast('As senhas não coincidem.', 'error');
            return;
        }
        if (newPassword.length < 6) {
            addToast('A senha deve ter pelo menos 6 caracteres.', 'error');
            return;
        }

        setPasswordLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            addToast('Senha alterada com sucesso!', 'success');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error('Error changing password:', error);
            addToast('Erro ao alterar senha. Verifique os requisitos.', 'error');
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 custom-fade-in pb-10">
            {/* Full Name Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100">
                        <User size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Dados Pessoais</h2>
                        <p className="text-xs text-slate-500 mt-1">Identificação no sistema</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                    <form onSubmit={handleUpdateName} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">Nome Completo</label>
                            <input
                                type="text"
                                placeholder="Seu nome completo"
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none font-medium text-slate-700 text-sm"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">Valor Social Padrão (R$)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none font-medium text-slate-700 text-sm"
                                value={socialPrice}
                                onChange={e => setSocialPrice(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                            <p className="text-[10px] text-slate-400 ml-1">Valor sugerido automaticamente ao selecionar "Social" nos agendamentos.</p>
                        </div>

                        <div className="space-y-1.5 opacity-60">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">E-mail (Não pode ser alterado)</label>
                            <input
                                type="email"
                                disabled
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-sm font-medium"
                                value={user?.email || ''}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            SALVAR ALTERAÇÕES
                        </button>
                    </form>
                </div>
            </section>

            {/* Change Password Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Segurança</h2>
                        <p className="text-xs text-slate-500 mt-1">Alterar senha de acesso</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">Nova Senha</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={16} />
                                <input
                                    type="password"
                                    placeholder="Mínimo 6 caracteres"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none font-medium text-slate-700 text-sm"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">Confirmar Nova Senha</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={16} />
                                <input
                                    type="password"
                                    placeholder="Repita a nova senha"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none font-medium text-slate-700 text-sm"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={passwordLoading || !newPassword}
                            className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-900/10 disabled:opacity-50"
                        >
                            {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            ATUALIZAR SENHA
                        </button>
                    </form>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3 items-start">
                    <div className="text-amber-500 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                        Ao alterar sua senha, você continuará logado nesta sessão, mas precisará usar a nova senha em próximos acessos.
                    </p>
                </div>
            </section>
        </div>
    );
};

export default ProfileSettings;
