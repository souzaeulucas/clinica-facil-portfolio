import React from 'react';
import { CreditCard, Check } from 'lucide-react';

interface FinancialSettingsProps {
    isPaying: boolean;
    setIsPaying: (val: boolean) => void;
    pricePerSession: number;
    setPricePerSession: (val: number) => void;
    isSus: boolean;
    setIsSus: (val: boolean) => void;
    loading: boolean;
    isBlocked: boolean;
    socialPrice: number;
    isEvaluation?: boolean;
}

const FinancialSettings: React.FC<FinancialSettingsProps> = ({
    isPaying, setIsPaying, pricePerSession, setPricePerSession,
    isSus, setIsSus, loading, isBlocked, socialPrice, isEvaluation
}) => {
    return (
        <div className="mt-4 pt-4 pb-4 border-t border-slate-100 px-2 md:px-4">
            <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
                <div className="flex flex-col gap-3 w-full xl:w-auto">
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        <CreditCard size={14} className="text-slate-400" />
                        Condição de Pagamento
                    </label>

                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsPaying(false);
                                setPricePerSession(0);
                            }}
                            disabled={isEvaluation}
                            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl border-2 transition-all flex items-center justify-center gap-2 font-bold text-[11px] uppercase tracking-wider ${isPaying === false
                                ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                                : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-600'
                                } ${isEvaluation ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Isento
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setIsPaying(true);
                            }}
                            disabled={isEvaluation}
                            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl border-2 transition-all flex items-center justify-center gap-2 font-bold text-[11px] uppercase tracking-wider ${isPaying === true
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                                : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200 hover:text-emerald-600'
                                } ${isEvaluation ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Pagante
                        </button>

                        <div className="h-8 w-px bg-slate-100 mx-2 hidden md:block" />

                        <label className={`flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl transition-all select-none cursor-pointer hover:bg-slate-100`}>
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={isSus}
                                    onChange={(e) => setIsSus(e.target.checked)}
                                />
                                <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-teal-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Paciente SUS</span>
                        </label>
                    </div>
                </div>

                <div className="w-full xl:w-auto flex flex-col items-end gap-2">
                    <button
                        type="submit"
                        disabled={loading || isBlocked}
                        className="w-full xl:w-auto bg-slate-900 text-white px-8 py-3 rounded-lg font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        <span className={loading ? 'animate-pulse' : ''}>
                            {loading ? 'Processando...' : (isBlocked ? 'Bloqueado' : 'Confirmar Tratamento')}
                        </span>
                        {!loading && !isBlocked && <Check size={16} className="text-emerald-400" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinancialSettings;
