import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Plus, Trash2, Pencil, Stethoscope } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../contexts/ToastContext';

interface Doctor {
    id: string;
    name: string;
    crm: string;
    specialties: {
        name: string;
    };
}

const DoctorList: React.FC = () => {
    const navigate = useNavigate();
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        id: string;
    }>({ isOpen: false, id: '' });

    useEffect(() => {
        fetchDoctors();
    }, []);

    const fetchDoctors = async () => {
        try {
            const { data, error } = await supabase
                .from('doctors')
                .select(`
          *,
          specialties (
            name
          )
        `);

            if (error) throw error;

            const cleanName = (name: string) => {
                return name.replace(/^(dr|dra|dr\(a\))\.\s+/i, '').trim().toLowerCase();
            };

            const sortedData = (data || []).sort((a, b) =>
                cleanName(a.name).localeCompare(cleanName(b.name))
            );

            setDoctors(sortedData);
        } catch (error) {
            console.error('Error fetching doctors:', error);
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
                .from('doctors')
                .delete()
                .eq('id', id);

            if (error) throw error;
            addToast('Médico excluído com sucesso!', 'success');
            fetchDoctors();
        } catch (error) {
            console.error('Error deleting doctor:', error);
            addToast('Erro ao excluir médico.', 'error');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Médicos</h1>
                    <p className="text-gray-500">Gerencie o corpo clínico</p>
                </div>
                <Link
                    to="/medicos/novo"
                    className="bg-blue-900 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-800 transition-colors"
                >
                    <Plus size={20} />
                    Novo Médico
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Carregando...</div>
                ) : doctors.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-900 mb-4">
                            <Stethoscope size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum médico cadastrado</h3>
                        <p className="text-gray-500 mb-4">Cadastre o primeiro médico para começar.</p>
                    </div>
                ) : (
                    <table className="w-full text-left bg-white">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">CRM</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Especialidade</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {doctors.map((doctor) => (
                                <tr key={doctor.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                        <button
                                            onClick={() => navigate(`/agendamentos?doctor_id=${doctor.id}`)}
                                            className="hover:text-indigo-600 hover:underline transition-colors text-left"
                                        >
                                            {doctor.name}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{doctor.crm || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {doctor.specialties?.name || 'Sem especialidade'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => navigate('/agendamentos', {
                                                state: {
                                                    action: 'new',
                                                    targetTab: 'retorno',
                                                    prefilledDoctor: doctor.id,
                                                    prefilledDoctorName: doctor.name,
                                                    prefilledSpecialty: doctor.specialties?.name
                                                }
                                            })}
                                            className="text-indigo-600 hover:text-indigo-900 p-2 rounded-lg hover:bg-indigo-50 transition-colors"
                                            title="Novo Retorno"
                                        >
                                            <Plus size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(doctor.id)}
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
                title="Excluir Médico"
                message="Tem certeza que deseja excluir este médico? Esta ação removerá o profissional do corpo clínico."
                type="danger"
            />
        </div>
    );
};

export default DoctorList;
