import React from 'react';
import { Clock } from 'lucide-react';
import ModernDatePicker from '../../ui/ModernDatePicker';
import ModernSelect from '../../ui/ModernSelect';

interface SessionScheduleProps {
    startDate: string;
    setStartDate: (val: string) => void;
    totalSessions: number;
    setTotalSessions: (val: number) => void;
    scheduleTime: string;
    setScheduleTime: (val: string) => void;
    sessionsPerWeek: number;
    setSessionsPerWeek: (val: number) => void;
    selectedDays: string[];
    setSelectedDays: (val: string[] | ((prev: string[]) => string[])) => void;
    weekDays: string[];
    handleDayToggle: (day: string) => void;
    isFirstSessionEvaluation: boolean;
    setIsFirstSessionEvaluation: (val: boolean) => void;
}

const SessionSchedule: React.FC<SessionScheduleProps> = ({
    startDate, setStartDate, totalSessions, setTotalSessions,
    scheduleTime, setScheduleTime, sessionsPerWeek, setSessionsPerWeek,
    selectedDays, setSelectedDays, weekDays, handleDayToggle,
    isFirstSessionEvaluation, setIsFirstSessionEvaluation
}) => {
    return (
        <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200 relative z-40">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                Planejamento das Sessões
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <ModernDatePicker
                        label="Data de Início"
                        required
                        value={startDate}
                        onChange={setStartDate}
                    />
                    <div className="mt-2 ml-1 flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="firstEval"
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={isFirstSessionEvaluation}
                            onChange={(e) => setIsFirstSessionEvaluation(e.target.checked)}
                        />
                        <label htmlFor="firstEval" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none">
                            O primeiro atendimento é uma Avaliação?
                        </label>
                    </div>
                </div>
                <div>
                    <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                        Total de Sessões
                    </label>
                    <div className="relative group">
                        <input
                            type="number"
                            min="1"
                            disabled={isFirstSessionEvaluation}
                            className={`w-full pl-5 pr-20 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 h-[48px] ${isFirstSessionEvaluation ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
                            value={totalSessions}
                            onChange={(e) => setTotalSessions(Number(e.target.value))}
                            placeholder="Ex: 10"
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest pointer-events-none">
                            Sessões
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                    <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                        <Clock size={14} className="text-indigo-500" />
                        Horário
                    </label>
                    <input
                        type="time"
                        className="w-full px-5 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 h-[48px]"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                    />
                </div>
                <div className="space-y-4">
                    <ModernSelect
                        label="Vezes por Semana"
                        disabled={isFirstSessionEvaluation}
                        value={sessionsPerWeek.toString()}
                        options={[
                            { value: '1', label: '1x por semana' },
                            { value: '2', label: '2x por semana' },
                            { value: '3', label: '3x por semana' }
                        ]}
                        onChange={val => {
                            setSessionsPerWeek(Number(val));
                            setSelectedDays([]);
                        }}
                    />

                    <div>
                        <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                            Dias da Semana ({selectedDays.length} de {sessionsPerWeek})
                        </label>
                        <div className="flex gap-2">
                            {weekDays.map(day => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => handleDayToggle(day)}
                                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${selectedDays.includes(day)
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                                        : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200 hover:text-indigo-600'
                                        }`}
                                >
                                    {day.split('-')[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionSchedule;
