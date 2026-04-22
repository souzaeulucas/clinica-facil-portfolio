import React, { useState, useEffect, useRef } from 'react';
import { Search, User, AlertCircle, X, ChevronDown, Check } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { normalizeText } from '../../utils/formatters';

export interface PatientSearchResult {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
    birth_date?: string;
    is_blocked?: boolean;
    is_sus?: boolean;
    condition?: string;
}

interface PatientSearchSelectProps {
    value: string; // The text to display in the input
    onChange: (text: string) => void;
    onSelect: (patient: PatientSearchResult) => void;
    onResults?: (results: PatientSearchResult[]) => void;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    autoFocus?: boolean;
}

const PatientSearchSelect: React.FC<PatientSearchSelectProps> = ({
    value,
    onChange,
    onSelect,
    onResults,
    label,
    placeholder = "Busque por nome ou CPF...",
    disabled = false,
    required = false,
    autoFocus = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<PatientSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Creates a wildcard pattern for accent-insensitive search in SQL
    // e.g. "João" -> "%J__o%"
    const getWildcardPattern = (term: string) => {
        return `%${term}%`;
    };

    // Debounce search
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (!value.trim() || !isOpen) {
                setResults([]);
                return;
            }

            setLoading(true);
            setIsOpen(true);
            try {
                const cleanTerm = value.trim();
                const cleanNumericValue = value.replace(/\D/g, '');
                const isNumeric = /^\d+$/.test(cleanNumericValue);

                let query = supabase
                    .from('patients')
                    .select('id, name, cpf, phone, birth_date, is_blocked, is_sus, condition')
                    .limit(100); // Increased limit to allow client-side filtering and broad results

                if (isNumeric && cleanNumericValue.length >= 5) {
                    const formattedCPF = cleanNumericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    query = query.or(`cpf.eq.${value},cpf.eq.${cleanNumericValue},cpf.eq.${formattedCPF},phone.ilike.%${value}%`);
                } else {
                    const terms = cleanTerm.split(/\s+/).filter(Boolean);

                    if (isNumeric && cleanNumericValue.length > 0) {
                        query = query.or(`cpf.ilike.%${cleanNumericValue}%,phone.ilike.%${cleanNumericValue}%,name.ilike.${getWildcardPattern(cleanTerm)}`);
                    } else if (terms.length > 0) {
                        // Use wildcard pattern for the first term to be more inclusive
                        terms.forEach((term, index) => {
                            if (index === 0) {
                                query = query.ilike('name', getWildcardPattern(term));
                            } else {
                                query = query.ilike('name', `%${term}%`);
                            }
                        });
                    } else {
                        query = query.ilike('name', getWildcardPattern(cleanTerm));
                    }
                }

                query = query.order('name');
                const { data, error } = await query;

                if (error) throw error;
                // Final client-side filter to refine results (accent insensitive)
                const normalizedSearch = normalizeText(cleanTerm);
                const finalResults = (data || []).sort((a, b) => {
                    // Boost exact matches or starts-with matches
                    const aNorm = normalizeText(a.name);
                    const bNorm = normalizeText(b.name);

                    if (aNorm === normalizedSearch && bNorm !== normalizedSearch) return -1;
                    if (bNorm === normalizedSearch && aNorm !== normalizedSearch) return 1;

                    if (aNorm.startsWith(normalizedSearch) && !bNorm.startsWith(normalizedSearch)) return -1;
                    if (bNorm.startsWith(normalizedSearch) && !aNorm.startsWith(normalizedSearch)) return 1;

                    return aNorm.localeCompare(bNorm);
                }).filter(p => {
                    if (isNumeric) return true;
                    // Ensure the result actually contains the search term parts (accent insensitive)
                    const pNorm = normalizeText(p.name);
                    const searchParts = normalizedSearch.split(/\s+/).filter(Boolean);
                    return searchParts.every(part => pNorm.includes(part));
                });

                // If results are empty and it was a name search, try a broader search to catch accent variations
                if (finalResults.length === 0 && !isNumeric && cleanTerm.length >= 2) {
                    const firstChar = cleanTerm[0];
                    const { data: broadData } = await supabase
                        .from('patients')
                        .select('id, name, cpf, phone, birth_date, is_blocked, is_sus, condition')
                        .ilike('name', `${firstChar}%`)
                        .limit(200);

                    if (broadData) {
                        const searchParts = normalizedSearch.split(/\s+/).filter(Boolean);
                        const broadResults = broadData.filter(p => {
                            const pNorm = normalizeText(p.name);
                            return searchParts.every(part => pNorm.includes(part));
                        });
                        finalResults.push(...broadResults);
                    }
                }

                setResults(finalResults.slice(0, 20)); // Limit displayed results
                if (onResults) onResults(finalResults.slice(0, 20));
            } catch (err) {
                console.error('Error searching patients:', err);
                setResults([]);
                if (onResults) onResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [value, isOpen]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && results[activeIndex]) {
                handleSelect(results[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // Prevent closing parent modals
            setIsOpen(false);
            inputRef.current?.blur();
        }
    };

    const handleSelect = (patient: PatientSearchResult) => {
        onSelect(patient);
        setIsOpen(false);
        setResults([]);
    };

    return (
        <div className="space-y-1.5 w-full relative group" ref={containerRef}>
            {label && (
                <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider flex items-center justify-between">
                    {label}
                    {loading && <span className="text-[10px] text-indigo-500 animate-pulse">Buscando...</span>}
                </label>
            )}

            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <User size={16} />
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    disabled={disabled}
                    required={required}
                    autoFocus={autoFocus}
                    placeholder={placeholder}
                    className={`
                        w-full pl-10 pr-10 py-2.5 rounded-lg border bg-slate-50 
                        focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 
                        transition-all outline-none font-medium text-slate-700 text-sm placeholder:text-slate-400
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'border-slate-200'}
                    `}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        if (!isOpen && e.target.value.trim().length > 0) setIsOpen(true);
                        if (e.target.value.trim().length === 0) setIsOpen(false);
                    }}
                    onBlur={(e) => {
                        // Delay closing to allow clicks on results to register
                        setTimeout(() => {
                            if (!containerRef.current?.contains(document.activeElement)) {
                                setIsOpen(false);
                            }
                        }, 200);
                    }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                />

                {value && (
                    <button
                        type="button"
                        onClick={() => {
                            onChange('');
                            setIsOpen(false);
                            inputRef.current?.focus();
                        }}
                        className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500 transition-colors"
                        disabled={disabled}
                    >
                        <X size={14} />
                    </button>
                )}

                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    {loading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
                    ) : (
                        <Search size={16} className={`transition-opacity ${value ? 'opacity-0' : 'opacity-100'}`} />
                    )}
                </div>
            </div>

            {/* Dropdown Results */}
            {isOpen && value.trim().length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-2xl z-[9999] max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 custom-scrollbar">
                    {results.length > 0 ? (
                        results.map((patient, index) => (
                            <button
                                key={patient.id}
                                type="button"
                                onClick={() => handleSelect(patient)}
                                onMouseMove={() => setActiveIndex(index)}
                                className={`
                                    w-full text-left px-4 py-3 flex items-center justify-between
                                    border-b border-slate-50 last:border-0 transition-colors
                                    ${index === activeIndex ? 'bg-indigo-50' : 'hover:bg-slate-50'}
                                    ${patient.is_blocked ? 'bg-rose-50/50 hover:bg-rose-50' : ''}
                                `}
                            >
                                <div>
                                    <p className={`text-sm font-bold ${patient.is_blocked ? 'text-rose-700' : 'text-slate-700'}`}>
                                        {patient.name}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {patient.cpf && (
                                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                CPF: {patient.cpf}
                                            </span>
                                        )}
                                        {patient.phone && (
                                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                {patient.phone}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="px-4 py-8 text-center">
                            {loading ? (
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando...</p>
                            ) : (
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum paciente encontrado</p>
                                    <p className="text-[10px] text-slate-400">Pressione Enter para criar um novo</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PatientSearchSelect;
