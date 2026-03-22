
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { Bell, CircleCheck, Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Portal from './Portal';

interface Notification {
    id: string;
    content: string;
    type: string;
    is_read: boolean;
    created_at: string;
}

const NotificationBell: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number | null; right: number | null }>({
        top: 0,
        left: null,
        right: null
    });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const updateCoords = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const isLeftSide = rect.left < window.innerWidth / 2;

            if (isLeftSide) {
                setCoords({
                    top: rect.bottom + 12,
                    left: Math.max(16, rect.left),
                    right: null
                });
            } else {
                setCoords({
                    top: rect.bottom + 12,
                    left: null,
                    right: Math.max(16, window.innerWidth - rect.right)
                });
            }
        }
    };

    useEffect(() => {
        fetchNotifications();

        const channel = supabase.channel('realtime:public:notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
                setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 20));
            })
            .subscribe();

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchNotifications();
            }
        };

        window.addEventListener('scroll', updateCoords, true);
        window.addEventListener('resize', updateCoords);
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (isOpen) updateCoords();
    }, [isOpen]);

    const fetchNotifications = async () => {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            setNotifications(data || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('is_read', false);

            if (error) throw error;
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    const clearNotifications = async () => {
        try {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

            if (error) throw error;
            setNotifications([]);
        } catch (error) {
            console.error('Error clearing notifications:', error);
        }
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-xl transition-all active:scale-95 ${isOpen ? 'bg-teal-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-slate-900 animate-in zoom-in duration-300">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <Portal>
                    <div
                        ref={dropdownRef}
                        className="fixed w-[280px] md:w-80 bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-4 duration-300"
                        style={{
                            top: `${coords.top}px`,
                            left: coords.left !== null ? `${coords.left}px` : 'auto',
                            right: coords.right !== null ? `${coords.right}px` : 'auto'
                        }}
                    >
                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Notificações</h3>
                            <div className="flex gap-2">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        title="Marcar tudo como lido"
                                        className="p-1.5 text-slate-400 hover:text-teal-600 transition-colors"
                                    >
                                        <CircleCheck size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={clearNotifications}
                                    title="Limpar tudo"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[350px] overflow-y-auto no-scrollbar">
                            {notifications.length > 0 ? (
                                notifications.map((n) => (
                                    <div
                                        key={n.id}
                                        className={`p-4 border-b border-slate-50 transition-colors hover:bg-slate-50 relative ${!n.is_read ? 'bg-indigo-50/30' : ''}`}
                                    >
                                        {!n.is_read && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-500" />
                                        )}
                                        <p className={`text-xs leading-relaxed ${!n.is_read ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>
                                            {n.content}
                                        </p>
                                        <div className="flex items-center gap-1 mt-2 text-[9px] font-bold text-slate-400 uppercase">
                                            <Clock size={10} />
                                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center">
                                    <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3 opacity-20" />
                                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Nenhuma notificação</p>
                                </div>
                            )}
                        </div>

                        <div className="p-3 bg-slate-50 text-center border-t border-slate-100">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
};

export default NotificationBell;
