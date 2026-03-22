
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  onAction?: () => void;
  actionLabel?: string;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose, onAction, actionLabel }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000); // 6 segundos para dar tempo de ler e clicar em desfazer
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-[#1E3A8A]' : 'bg-red-600';
  const textColor = 'text-white';

  const handleClick = (e: React.MouseEvent) => {
    // Se clicou no botão de ação, não fecha o toast pelo clique geral
    if ((e.target as HTMLElement).closest('.action-btn')) return;
    onClose();
  };

  return (
    <div 
      onClick={handleClick}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 ${bgColor} ${textColor} animate-in slide-in-from-bottom-10 duration-300 cursor-pointer hover:scale-105 active:scale-95 transition-all`}
    >
      <span className="text-lg">{type === 'success' ? '✨' : '⚠️'}</span>
      <div className="flex flex-col">
        <p className="font-semibold text-sm leading-tight">{message}</p>
        {onAction && actionLabel && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onAction();
              onClose();
            }}
            className="action-btn text-[10px] font-black underline uppercase mt-1 tracking-widest hover:text-blue-200"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <button className="ml-4 text-xs opacity-50 hover:opacity-100">✕</button>
    </div>
  );
};
