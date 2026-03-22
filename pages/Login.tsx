import React, { useState } from 'react';
// Demonstrativo: Acesso seguro para recrutadores via VITE_IS_DEMO
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="bg-blue-900 text-white w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold mx-auto mb-4">
                        CF
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">ClinicaFacil</h1>
                    <p className="text-gray-500">Entre para acessar o sistema</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                            placeholder="seu@email.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-900 text-white py-2 rounded-lg font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>

                {import.meta.env.VITE_IS_DEMO === 'true' && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <div className="text-center mb-4">
                            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                                Área de Portfólio
                            </span>
                        </div>
                        <button
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    const { error } = await supabase.auth.signInWithPassword({
                                        email: 'recrutador@portfolio.com',
                                        password: 'demo_password123',
                                    });
                                    if (error) throw error;
                                    navigate('/');
                                } catch (err: any) {
                                    setError('Erro ao acessar demonstração: ' + err.message);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 border-2 border-slate-200/50 active:scale-95"
                        >
                            <span className="text-lg">👋</span> 
                            Acesso para Recrutadores (Sem Senha)
                        </button>
                        <p className="text-center text-[10px] text-gray-400 mt-4 font-medium uppercase tracking-widest">
                            Dados fictícios e seguros para demonstração
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Login;
