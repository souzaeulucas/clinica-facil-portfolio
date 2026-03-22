import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { normalizeText } from '../../utils/formatters';

interface Option {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    label?: string;
    placeholder?: string;
    required?: boolean;
    onClear?: () => void;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
    value,
    onChange,
    options,
    label,
    placeholder = "Selecione...",
    required,
    onClear
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isInteracted, setIsInteracted] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // Focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const filteredOptions = options.filter(opt => {
        if (isOpen && !isInteracted) return true;
        return normalizeText(opt.label).includes(normalizeText(searchTerm));
    });

    const selectedOption = options.find(opt => opt.value === value);

    // Reset focus index when options change or searching
    useEffect(() => {
        setFocusedIndex(-1);
    }, [searchTerm, isOpen]);

    // Update search term when value changes externally
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm(selectedOption ? selectedOption.label : '');
            setIsInteracted(false);
        }
    }, [value, selectedOption, isOpen]);

    return (
        <div className="space-y-1.5 relative" ref={containerRef}>
            {label && <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.2em]">{label}</label>}

            <div
                className={`
                    w-full px-4 py-2.5 rounded-2xl bg-white border-2 transition-all flex items-center justify-between gap-3 group relative cursor-text
                    ${isOpen ? 'border-indigo-500 shadow-lg shadow-indigo-50' : 'border-slate-100 hover:border-slate-200'}
                `}
                onClick={() => {
                    setIsOpen(true);
                    setIsInteracted(false);
                    inputRef.current?.focus();
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-transparent border-none outline-none text-sm font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium truncate"
                    placeholder={placeholder}
                    value={isOpen && isInteracted ? searchTerm : (selectedOption ? selectedOption.label : searchTerm)}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                        setIsInteracted(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setIsInteracted(false);
                        // Reset search term to empty to show all options if it was showing a selection
                        setSearchTerm('');
                        inputRef.current?.select();
                    }}
                    onBlur={(e) => {
                        // Small delay to allow onMouseDown to fire first
                        setTimeout(() => {
                            if (!selectedOption) setSearchTerm('');
                            else setSearchTerm(selectedOption.label);
                            setIsInteracted(false);
                        }, 200);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (!isOpen) setIsOpen(true);
                            setFocusedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (isOpen && focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
                                onChange(filteredOptions[focusedIndex].value);
                                setIsOpen(false);
                                setSearchTerm(filteredOptions[focusedIndex].label);
                                inputRef.current?.blur();
                            } else if (isOpen && filteredOptions.length > 0) {
                                onChange(filteredOptions[0].value);
                                setIsOpen(false);
                                setSearchTerm(filteredOptions[0].label);
                                inputRef.current?.blur();
                            }
                        } else if (e.key === 'Escape') {
                            setIsOpen(false);
                            inputRef.current?.blur();
                        }
                    }}
                />
                <div className="flex items-center gap-2 shrink-0">
                    {value && onClear && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                                setSearchTerm('');
                            }}
                            className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors z-10"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown size={18} className={`${isOpen ? 'text-indigo-500 rotate-180' : 'text-slate-400'} group-hover:text-indigo-500 transition-all duration-300`} />
                </div>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[1.5rem] border-2 border-slate-100 shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="max-h-60 overflow-y-auto py-2 px-2 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onMouseDown={(e) => {
                                        // Use onMouseDown instead of onClick so it fires before the input's onBlur!
                                        e.preventDefault(); // This also stops the input from blurring immediately
                                        onChange(option.value);
                                        setIsOpen(false);
                                        setSearchTerm(option.label);
                                    }}
                                    onMouseEnter={() => setFocusedIndex(index)}
                                    className={`
                                        w-full px-4 py-3 rounded-xl text-left text-sm font-bold transition-all flex items-center justify-between mb-1 last:mb-0
                                        ${value === option.value
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                            : focusedIndex === index
                                                ? 'bg-slate-100 text-indigo-600'
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
                                Nenhuma opção encontrada
                            </div>
                        )}
                    </div>
                </div>
            )}

            <input type="hidden" name={label} value={value} required={required} />
        </div>
    );
};

export default SearchableSelect;
