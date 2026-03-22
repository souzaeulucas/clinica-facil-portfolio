import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextData {
    addToast: (message: string, type: ToastType) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextData>({} as ToastContextData);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((state) => [...state, { id, message, type }]);

        setTimeout(() => {
            removeToast(id);
        }, 5000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((state) => state.filter((toast) => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] space-y-3 pointer-events-none">
                {toasts.map((toast) => (
                    <ToastCard key={toast.id} toast={toast} onRemove={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const ToastCard: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
    const icons = {
        success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
        error: <AlertCircle className="w-5 h-5 text-rose-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />,
        warning: <AlertCircle className="w-5 h-5 text-white" />,
    };

    const colors = {
        success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
        error: 'border-rose-100 bg-rose-50 text-rose-900',
        info: 'border-blue-100 bg-blue-50 text-blue-900',
        warning: 'border-blue-600 bg-blue-600 text-white shadow-blue-500/20',
    };

    return (
        <div
            className={`
        pointer-events-auto
        flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg shadow-slate-900/5
        min-w-[300px] max-w-md
        animate-in slide-in-from-right-full fade-in duration-300
        ${colors[toast.type]}
      `}
        >
            <div className="flex-shrink-0">{icons[toast.type]}</div>
            <div className="flex-1 font-bold text-[13px] leading-tight">{toast.message}</div>
            <button
                onClick={() => onRemove(toast.id)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
                <X className={`w-4 h-4 ${toast.type === 'warning' ? 'text-white' : 'opacity-50 hover:opacity-100'}`} />
            </button>
        </div>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
