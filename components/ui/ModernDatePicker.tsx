import React, { useState, useRef, useEffect } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, isToday, parseISO, setMonth, setYear, getYear, startOfYear, addYears, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Portal from '../Portal';

interface ModernDatePickerProps {
    value: string; // YYYY-MM-DD
    onChange: (date: string) => void;
    label?: string;
    placeholder?: string;
    required?: boolean;
    dateFormat?: string;
    allowManualInput?: boolean;
}

const ModernDatePicker: React.FC<ModernDatePickerProps> = ({ value, onChange, label, placeholder = "Selecione uma data", required, dateFormat = "dd 'de' MMMM, yyyy", allowManualInput = true }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');
    const [currentMonth, setCurrentMonth] = useState(value ? parseISO(value) : new Date());
    const containerRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const [manualInputValue, setManualInputValue] = useState("");

    // Update manual input when value changes externally
    useEffect(() => {
        if (value) {
            try {
                if (allowManualInput) {
                    setManualInputValue(format(parseISO(value), 'dd/MM/yyyy'));
                }
            } catch (e) {
                // Invalid date
            }
            setCurrentMonth(parseISO(value));
        } else {
            setManualInputValue("");
        }
    }, [value, allowManualInput]);

    const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let text = e.target.value.replace(/\D/g, ''); // Remove non-digits

        // Simple masking dd/MM/yyyy
        if (text.length > 2) text = text.slice(0, 2) + '/' + text.slice(2);
        if (text.length > 5) text = text.slice(0, 5) + '/' + text.slice(5);
        if (text.length > 10) text = text.slice(0, 10);

        setManualInputValue(text);

        // Try to parse and set value if complete
        if (text.length === 10) {
            const [day, month, year] = text.split('/').map(Number);
            // Basic validation
            if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900 && year < 2100) {
                const date = new Date(year, month - 1, day);
                if (isValidDate(date)) {
                    onChange(format(date, 'yyyy-MM-dd'));
                    setCurrentMonth(date);
                }
            }
        } else if (text === "") {
            onChange("");
        }
    };

    const isValidDate = (d: Date) => {
        return d instanceof Date && !isNaN(d.getTime());
    }

    const updatePosition = () => {
        if (containerRef.current && isOpen) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + window.scrollY + 8, // 8px spacing
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
        }
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const dropdown = document.getElementById(`datepicker-dropdown-${label || 'default'}`);

            if (containerRef.current && !containerRef.current.contains(target as Node) && (!dropdown || !dropdown.contains(target as Node))) {
                setIsOpen(false);
                setView('calendar'); // Reset view on close
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [label]);

    const handleHeaderClick = () => {
        if (view === 'calendar') setView('month');
        else if (view === 'month') setView('year');
        else setView('calendar');
    };

    const toggleYearRange = (direction: 'prev' | 'next') => {
        if (direction === 'prev') setCurrentMonth(subYears(currentMonth, 12));
        else setCurrentMonth(addYears(currentMonth, 12));
    };

    const renderHeader = () => {
        return (
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <button
                    type="button"
                    onClick={() => {
                        if (view === 'year') toggleYearRange('prev');
                        else if (view === 'month') setCurrentMonth(subYears(currentMonth, 1));
                        else setCurrentMonth(subMonths(currentMonth, 1));
                    }}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm transition-all"
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    type="button"
                    onClick={handleHeaderClick}
                    className="text-sm font-black text-slate-700 uppercase tracking-widest hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                    {view === 'year'
                        ? `${getYear(currentMonth) - 5} - ${getYear(currentMonth) + 6}`
                        : view === 'month'
                            ? format(currentMonth, 'yyyy')
                            : format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (view === 'year') toggleYearRange('next');
                        else if (view === 'month') setCurrentMonth(addYears(currentMonth, 1));
                        else setCurrentMonth(addMonths(currentMonth, 1));
                    }}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm transition-all"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        );
    };

    const renderDays = () => {
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        return (
            <div className="grid grid-cols-7 mb-2 px-2">
                {days.map(day => (
                    <div key={day} className="text-[10px] font-black text-slate-400 uppercase tracking-tighter text-center py-2">
                        {day}
                    </div>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const rows = [];
        let days = [];
        let day = startDate;
        let formattedDate = "";

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                formattedDate = format(day, "d");
                const cloneDay = day;
                const isSelected = value && isSameDay(day, parseISO(value));
                const isCurrentMonth = isSameMonth(day, monthStart);

                days.push(
                    <button
                        key={day.toString()}
                        type="button"
                        className={`
                            h-9 w-9 flex items-center justify-center rounded-xl text-xs font-bold transition-all relative
                            ${!isCurrentMonth ? 'text-slate-300' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}
                            ${isSelected ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 z-10 scale-110' : ''}
                            ${isToday(day) && !isSelected ? 'text-indigo-600 ring-2 ring-indigo-500/20' : ''}
                        `}
                        onClick={() => {
                            onChange(format(cloneDay, 'yyyy-MM-dd'));
                            setIsOpen(false);
                            if (allowManualInput) setManualInputValue(format(cloneDay, 'dd/MM/yyyy'));
                        }}
                    >
                        {formattedDate}
                        {isToday(day) && !isSelected && (
                            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-500 rounded-full"></span>
                        )}
                    </button>
                );
                day = addDays(day, 1);
            }
            rows.push(
                <div className="grid grid-cols-7 gap-1 px-2 mb-1" key={day.toString()}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="pb-2">{rows}</div>;
    };

    const renderMonths = () => {
        const months = [];
        for (let i = 0; i < 12; i++) {
            const monthDate = setMonth(new Date(), i);
            const isSelected = isSameMonth(monthDate, currentMonth);
            months.push(
                <button
                    key={i}
                    type="button"
                    onClick={() => {
                        setCurrentMonth(setMonth(currentMonth, i));
                        setView('calendar');
                    }}
                    className={`
                        py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all
                        ${isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}
                    `}
                >
                    {format(monthDate, 'MMM', { locale: ptBR })}
                </button>
            );
        }
        return <div className="grid grid-cols-3 gap-2 p-2">{months}</div>;
    };

    const renderYears = () => {
        const currentYear = getYear(currentMonth);
        const years = [];
        const startYear = currentYear - 5;
        const endYear = currentYear + 6;

        for (let i = startYear; i <= endYear; i++) {
            const isSelected = i === currentYear;
            years.push(
                <button
                    key={i}
                    type="button"
                    onClick={() => {
                        setCurrentMonth(setYear(currentMonth, i));
                        setView('month');
                    }}
                    className={`
                        py-3 rounded-xl text-xs font-bold transition-all
                        ${isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}
                    `}
                >
                    {i}
                </button>
            );
        }
        return <div className="grid grid-cols-4 gap-2 p-2">{years}</div>;
    };

    const displayValue = value
        ? format(parseISO(value), dateFormat, { locale: ptBR })
        : placeholder;

    return (
        <div className="space-y-1.5 relative" ref={containerRef}>
            {label && <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">{label}</label>}

            {allowManualInput ? (
                <div className={`
                    w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 transition-all flex items-center justify-between gap-3 group relative
                    ${isOpen ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-50' : 'border-transparent hover:border-slate-200'}
                `}>
                    <input
                        type="text"
                        value={manualInputValue}
                        onChange={handleManualChange}
                        placeholder={placeholder}
                        className="bg-transparent border-none outline-none w-full text-sm font-bold text-slate-700 placeholder-slate-400 h-full p-0"
                        maxLength={10}
                        onFocus={() => setIsOpen(false)}
                    />
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
                        className="text-slate-400 group-hover:text-indigo-600 transition-colors outline-none"
                    >
                        <CalendarIcon size={18} />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        setIsOpen(!isOpen);
                    }}
                    className={`
                        w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 transition-all flex items-center justify-between gap-3 group
                        ${isOpen ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-50' : 'border-transparent hover:border-slate-200'}
                    `}
                >
                    <span className={`text-sm font-bold ${value ? 'text-slate-700' : 'text-slate-400'}`}>
                        {displayValue}
                    </span>
                    <CalendarIcon size={18} className={`${isOpen ? 'text-indigo-500' : 'text-slate-400'} group-hover:text-indigo-500 transition-colors`} />
                </button>
            )}

            {isOpen && (
                <Portal>
                    <div
                        id={`datepicker-dropdown-${label || 'default'}`}
                        style={{
                            position: 'absolute',
                            top: `${dropdownPosition.top}px`,
                            left: `${dropdownPosition.left}px`,
                            width: `${Math.max(dropdownPosition.width, 320)}px`,
                            zIndex: 9999
                        }}
                        className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    >
                        {renderHeader()}
                        <div className="p-2">
                            {view === 'calendar' && (
                                <>
                                    {renderDays()}
                                    {renderCells()}
                                </>
                            )}
                            {view === 'month' && renderMonths()}
                            {view === 'year' && renderYears()}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(format(new Date(), 'yyyy-MM-dd'));
                                    setCurrentMonth(new Date());
                                    setIsOpen(false);
                                    setView('calendar');
                                }}
                                className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors"
                            >
                                Hoje
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </Portal>
            )}

            <input type="hidden" name={label} value={value} required={required} />
        </div>
    );
};

export default ModernDatePicker;
