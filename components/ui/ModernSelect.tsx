import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
    value: string;
    label: string;
}

interface ModernSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
}

const ModernSelect: React.FC<ModernSelectProps> = ({ value, onChange, options, label, placeholder = "Selecione uma opção", required, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="space-y-1.5 relative" ref={containerRef}>
            {label && <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">{label}</label>}

            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 transition-all flex items-center justify-between gap-3 group
                    ${isOpen ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-50' : 'border-transparent hover:border-slate-200'}
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}
                `}
            >
                <span className={`text-sm font-bold ${value ? 'text-slate-700' : 'text-slate-400'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={18} className={`${isOpen ? 'text-indigo-500 rotate-180' : 'text-slate-400'} group-hover:text-indigo-500 transition-all duration-300`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[1.5rem] border-2 border-slate-100 shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="max-h-60 overflow-y-auto py-2 px-2 custom-scrollbar">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`
                                    w-full px-4 py-3 rounded-xl text-left text-sm font-bold transition-all flex items-center justify-between mb-1 last:mb-0
                                    ${value === option.value
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                                    }
                                `}
                            >
                                {option.label}
                                {value === option.value && <Check size={14} className="text-white" />}
                            </button>
                        ))}
                        {options.length === 0 && (
                            <div className="px-4 py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                                Nenhuma opção
                            </div>
                        )}
                    </div>
                </div>
            )}

            <input type="hidden" name={label} value={value} required={required} />
        </div>
    );
};

export default ModernSelect;
