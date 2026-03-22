import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X, Stethoscope } from 'lucide-react';
import { normalizeText } from '../../utils/formatters';

interface Option {
    value: string;
    label: string;
}

interface ModernDoctorSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
}

const ModernDoctorSelect: React.FC<ModernDoctorSelectProps> = ({
    value,
    onChange,
    options,
    label,
    placeholder = "Selecione o médico...",
    required,
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    // Initial value for searchTerm should be selected label if not open
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm(selectedOption ? selectedOption.label : '');
            setActiveIndex(0);
        }
    }, [isOpen, selectedOption]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        normalizeText(opt.label).includes(normalizeText(searchTerm))
    );

    // Reset active index when filter changes
    useEffect(() => {
        setActiveIndex(0);
    }, [searchTerm]);

    const handleSelect = (option: Option) => {
        onChange(option.value);
        setSearchTerm(option.label);
        setIsOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        if (!isOpen) setIsOpen(true);
        // If they clear it, we should probably clear the selection too
        if (e.target.value === '') {
            onChange('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown') {
                setIsOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredOptions.length > 0 && activeIndex >= 0) {
                handleSelect(filteredOptions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className="space-y-1.5 relative group" ref={containerRef}>
            {label && <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">{label}</label>}

            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-indigo-500 transition-colors">
                    <Stethoscope size={16} />
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    disabled={disabled}
                    required={required}
                    placeholder={placeholder}
                    className={`
                        w-full pl-10 pr-10 py-2.5 rounded-xl border-2 bg-slate-50 
                        focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 
                        transition-all outline-none font-bold text-slate-700 text-sm placeholder:text-slate-300
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'border-transparent hover:border-slate-200'}
                        ${isOpen ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-50' : ''}
                    `}
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                />

                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchTerm('');
                                onChange('');
                                setIsOpen(true);
                                inputRef.current?.focus();
                            }}
                            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown
                        size={18}
                        className={`transition-all duration-300 ${isOpen ? 'text-indigo-500 rotate-180' : 'text-slate-400'} cursor-pointer`}
                        onClick={() => setIsOpen(!isOpen)}
                    />
                </div>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[1.5rem] border-2 border-slate-100 shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto py-2 px-2 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    className={`
                                        w-full px-4 py-3 rounded-xl text-left text-sm font-bold transition-all flex items-center justify-between mb-1 last:mb-0
                                        ${value === option.value
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                            : index === activeIndex
                                                ? 'bg-indigo-50 text-indigo-600'
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                                        }
                                    `}
                                >
                                    {option.label}
                                    {value === option.value && <Check size={14} className="text-white" />}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                                Nenhum médico encontrado
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ModernDoctorSelect;
