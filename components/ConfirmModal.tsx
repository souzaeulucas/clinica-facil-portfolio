import React from 'react';
import { CircleAlert, CircleHelp, X } from 'lucide-react';
import Portal from './Portal';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info' | 'warning';
    onBackdropClick?: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger',
    onBackdropClick
}) => {
    if (!isOpen) return null;

    const colors = {
        danger: {
            bg: 'bg-red-50',
            icon: 'text-red-600',
            button: 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20',
        },
        info: {
            bg: 'bg-blue-50',
            icon: 'text-blue-600',
            button: 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20',
        },
        warning: {
            bg: 'bg-amber-50',
            icon: 'text-amber-600',
            button: 'bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-900/20',
        }
    };

    const currentColors = colors[type];
    const [isLoading, setIsLoading] = React.useState(false);

    // Handle ESC key
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <Portal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={!isLoading ? (onBackdropClick || onClose) : undefined}
                />

                {/* Modal Content */}
                <div
                    className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-visible animate-in zoom-in-95 fade-in duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-8">
                        <div className="flex flex-col items-center text-center">
                            <div className={`mb-6 p-4 rounded-3xl ${currentColors.bg} ${currentColors.icon}`}>
                                {type === 'danger' ? <CircleAlert size={32} strokeWidth={2.5} /> : <CircleHelp size={32} strokeWidth={2.5} />}
                            </div>

                            <h3 className="text-xl font-black text-slate-900 mb-3 leading-tight tracking-tight">
                                {title}
                            </h3>

                            <p className="text-sm text-slate-500 font-medium leading-relaxed px-2">
                                {message}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 mt-8">
                            <button
                                disabled={isLoading}
                                onClick={async () => {
                                    try {
                                        setIsLoading(true);
                                        await onConfirm();
                                        onClose();
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${currentColors.button}`}
                            >
                                {isLoading ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : confirmText}
                            </button>

                            <button
                                disabled={isLoading}
                                onClick={onClose}
                                className="w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {cancelText}
                            </button>
                        </div>
                    </div>

                    <button
                        disabled={isLoading}
                        onClick={onClose}
                        className="absolute top-5 right-5 text-slate-300 hover:text-slate-500 p-2 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-0"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </Portal>
    );
};

export default ConfirmModal;
