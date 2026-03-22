import React, { useState, useRef, useEffect } from 'react';
import { format, addYears, subYears, parseISO, setMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface ModernMonthPickerProps {
    value: string; // YYYY-MM
    onChange: (date: string) => void;
    label?: string;
    placeholder?: string;
    required?: boolean;
}

const ModernMonthPicker: React.FC<ModernMonthPickerProps> = ({ value, onChange, label, placeholder = "Selecione o mês", required }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value ? parseISO(`${value}-01`) : new Date());
    const containerRef = useRef<HTMLDivElement>(null);

    const months = [
        'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
        'jul', 'ago', 'set', 'out', 'nov', 'dez'
    ];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const renderHeader = () => {
        return (
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <button
                    type="button"
                    onClick={() => setViewDate(subYears(viewDate, 1))}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm transition-all"
                >
                    <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-black text-slate-700 uppercase tracking-widest">
                    {format(viewDate, 'yyyy')}
                </span>
                <button
                    type="button"
                    onClick={() => setViewDate(addYears(viewDate, 1))}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm transition-all"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        );
    };

    const renderMonths = () => {
        return (
            <div className="grid grid-cols-4 gap-2 p-3">
                {months.map((month, idx) => {
                    const isSelected = value === format(setMonth(viewDate, idx), 'yyyy-MM');
                    const isCurrentMonth = format(new Date(), 'yyyy-MM') === format(setMonth(viewDate, idx), 'yyyy-MM');

                    return (
                        <button
                            key={month}
                            type="button"
                            onClick={() => {
                                const newDate = format(setMonth(viewDate, idx), 'yyyy-MM');
                                onChange(newDate);
                                setIsOpen(false);
                            }}
                            className={`
                                py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                ${isSelected
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105 z-10'
                                    : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                                }
                                ${isCurrentMonth && !isSelected ? 'ring-2 ring-indigo-500/20 text-indigo-600' : ''}
                            `}
                        >
                            {month}
                        </button>
                    );
                })}
            </div>
        );
    };

    const displayValue = value
        ? format(parseISO(`${value}-01`), "MMMM 'de' yyyy", { locale: ptBR })
        : placeholder;

    return (
        <div className="space-y-1.5 relative" ref={containerRef}>
            {label && <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">{label}</label>}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full px-5 py-2.5 rounded-2xl bg-slate-50 border-2 transition-all flex items-center justify-between group h-11
                    ${isOpen ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-50' : 'border-transparent hover:border-slate-200'}
                `}
            >
                <span className={`text-sm font-bold capitalize ${value ? 'text-slate-700' : 'text-slate-400'}`}>
                    {displayValue}
                </span>
                <CalendarIcon size={18} className={`${isOpen ? 'text-indigo-500' : 'text-slate-400'} group-hover:text-indigo-500 transition-colors`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[2rem] border-2 border-slate-100 shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 w-full min-w-[280px]">
                    {renderHeader()}
                    {renderMonths()}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-700 transition-colors"
                        >
                            Limpar
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const now = new Date();
                                onChange(format(now, 'yyyy-MM'));
                                setViewDate(now);
                                setIsOpen(false);
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors"
                        >
                            Este mês
                        </button>
                    </div>
                </div>
            )}

            <input type="hidden" name={label} value={value} required={required} />
        </div>
    );
};

export default ModernMonthPicker;
