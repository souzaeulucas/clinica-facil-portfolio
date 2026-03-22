import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../contexts/ToastContext';

interface Specialty {
    id: string;
    name: string;
    is_sus_exclusive: boolean;
    created_at: string;
}

const SpecialtyList: React.FC = () => {
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        id: string;
    }>({ isOpen: false, id: '' });

    useEffect(() => {
        fetchSpecialties();
    }, []);

    const fetchSpecialties = async () => {
        try {
            const { data, error } = await supabase
                .from('specialties')
                .select('*')
                .order('name');

            if (error) throw error;
            setSpecialties(data || []);
        } catch (error) {
            console.error('Error fetching specialties:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (id: string) => {
        setConfirmModal({ isOpen: true, id });
    };

    const executeDelete = async () => {
        const id = confirmModal.id;
        try {
            const { error } = await supabase
                .from('specialties')
                .delete()
                .eq('id', id);

            if (error) throw error;
            addToast('Especialidade excluída com sucesso!', 'success');
            fetchSpecialties();
        } catch (error) {
            console.error('Error deleting specialty:', error);
            addToast('Erro ao excluir. Verifique se não há médicos vinculados.', 'error');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Especialidades</h1>
                    <p className="text-gray-500">Gerencie as áreas de atuação da clínica</p>
                </div>
                <Link
                    to="/especialidades/nova"
                    className="bg-blue-900 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-800 transition-colors"
                >
                    <Plus size={20} />
                    Nova Especialidade
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Carregando...</div>
                ) : specialties.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-900 mb-4">
                            <Plus size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhuma especialidade</h3>
                        <p className="text-gray-500 mb-4">Cadastre a primeira especialidade para começar.</p>
                    </div>
                ) : (
                    <table className="w-full text-left bg-white">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {specialties.map((specialty) => (
                                <tr key={specialty.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900 flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${specialty.is_sus_exclusive ? 'bg-blue-500' : 'bg-teal-400'}`}></div>
                                        {specialty.name}
                                        {specialty.is_sus_exclusive && (
                                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-blue-100">
                                                SUS
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDeleteClick(specialty.id)}
                                            className="text-red-600 hover:text-red-900 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false, id: '' })}
                onConfirm={executeDelete}
                title="Excluir Especialidade"
                message="Tem certeza que deseja excluir esta especialidade? Esta ação não pode ser desfeita e pode falhar se houver vínculos ativos."
                type="danger"
            />
        </div>
    );
};

export default SpecialtyList;
