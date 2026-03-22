import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';

const SpecialtyForm: React.FC = () => {
    const [name, setName] = useState('');
    const [isSusExclusive, setIsSusExclusive] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase
                .from('specialties')
                .insert([{
                    name,
                    is_sus_exclusive: isSusExclusive
                }]);

            if (error) throw error;
            navigate('/especialidades');
        } catch (error) {
            console.error('Error saving specialty:', error);
            alert('Erro ao salvar especialidade');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Link
                    to="/especialidades"
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Nova Especialidade</h1>
                    <p className="text-gray-500">Adicione uma nova área de atuação</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nome da Especialidade
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                            placeholder="Ex: Cardiologia"
                            required
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out">
                            <input
                                type="checkbox"
                                id="sus-toggle"
                                className="peer absolute opacity-0 w-0 h-0"
                                checked={isSusExclusive}
                                onChange={e => setIsSusExclusive(e.target.checked)}
                            />
                            <label
                                htmlFor="sus-toggle"
                                className={`block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer transition-colors duration-200 peer-checked:bg-blue-600 relative before:content-[''] before:absolute before:top-1 before:left-1 before:bg-white before:w-4 before:h-4 before:rounded-full before:transition-all before:duration-200 peer-checked:before:translate-x-6`}
                            />
                        </div>
                        <label htmlFor="sus-toggle" className="cursor-pointer">
                            <span className="block font-bold text-blue-900 text-sm uppercase tracking-wide">Exclusivo via SUS</span>
                            <span className="block text-xs text-blue-700">Ocultar de agendamentos de "Primeira Consulta"</span>
                        </label>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-900 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-800 transition-colors disabled:opacity-50"
                        >
                            <Save size={20} />
                            {loading ? 'Salvando...' : 'Salvar Especialidade'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SpecialtyForm;
