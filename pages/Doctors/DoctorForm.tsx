import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Especialidade } from '../../types';
import ModernSelect from '../../components/ui/ModernSelect';

const DoctorForm: React.FC = () => {
    const [name, setName] = useState('');
    const [crm, setCrm] = useState('');
    const [phone, setPhone] = useState('');
    const [specialtyId, setSpecialtyId] = useState('');
    const [specialties, setSpecialties] = useState<Especialidade[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchSpecialties();
    }, []);

    const fetchSpecialties = async () => {
        try {
            const { data, error } = await supabase
                .from('specialties')
                .select('*')
                .order('name');

            if (!error && data) {
                setSpecialties(data.map(item => ({
                    id: item.id,
                    name: item.name,
                    is_sus_exclusive: !!item.is_sus_exclusive
                })));
            }
        } catch (error) {
            console.error('Error loading specialties:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!specialtyId) {
            alert('Selecione uma especialidade');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase
                .from('doctors')
                .insert([{
                    name,
                    crm,
                    phone,
                    specialty_id: specialtyId
                }]);

            if (error) throw error;
            navigate('/medicos');
        } catch (error) {
            console.error('Error saving doctor:', error);
            alert('Erro ao salvar médico');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Link
                    to="/medicos"
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Novo Médico</h1>
                    <p className="text-gray-500">Cadastre um novo profissional</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nome Completo
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                            placeholder="Ex: Dr. João da Silva"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                CRM
                            </label>
                            <input
                                type="text"
                                value={crm}
                                onChange={(e) => setCrm(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                                placeholder="00000/UF"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Telefone
                            </label>
                            <input
                                type="text"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                                placeholder="(00) 00000-0000"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Especialidade
                        </label>
                        <div className="relative">
                            <ModernSelect
                                value={specialtyId}
                                onChange={(val) => setSpecialtyId(val)}
                                options={specialties.map(s => ({
                                    value: s.id,
                                    label: s.name
                                }))}
                                placeholder="Selecione a especialidade"
                                required
                            />
                        </div>
                        {specialties.length === 0 && (
                            <p className="mt-1 text-xs text-amber-600">
                                Nenhuma especialidade cadastrada. <Link to="/especialidades/nova" className="underline font-medium">Cadastre uma agora</Link>.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-900 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-800 transition-colors disabled:opacity-50"
                        >
                            <Save size={20} />
                            {loading ? 'Salvando...' : 'Salvar Médico'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DoctorForm;
