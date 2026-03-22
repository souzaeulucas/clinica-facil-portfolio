import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { LayoutDashboard, Calendar, Settings as SettingsIcon, LogOut, Menu, X, ChevronLeft, ChevronRight, CirclePlus, Stethoscope, Activity, Users, ClipboardList, CalendarDays } from 'lucide-react';
import Portal from './Portal';
import NotificationBell from './NotificationBell';

const ContentWrapper = React.memo(({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-4 md:px-8 md:pt-8 md:pb-0 w-full">
                {children}
            </div>
        </div>
    );
});

ContentWrapper.displayName = 'ContentWrapper';

// --- Sidebar Context ---
interface SidebarContextType {
    isCollapsed: boolean;
    setIsCollapsed: (v: boolean) => void;
    isMobile: boolean;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (v: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
    const context = React.useContext(SidebarContext);
    if (!context) throw new Error('useSidebar must be used within SidebarProvider');
    return context;
};

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(localStorage.getItem('sidebar-collapsed') === 'true');
    const location = useLocation();

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
        };
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    }, [isCollapsed]);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    const value = useMemo(() => ({
        isCollapsed,
        setIsCollapsed,
        isMobile,
        isMobileMenuOpen,
        setIsMobileMenuOpen
    }), [isCollapsed, isMobile, isMobileMenuOpen]);

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    );
};

// --- Sub-components consuming context ---

const Sidebar = React.memo(() => {
    const { isCollapsed, setIsCollapsed } = useSidebar();
    const { profile, isAdmin, signOut } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const isActive = useCallback((path: string) => {
        if (path === '/') return location.pathname === '/';
        if (path === '/agendamentos') {
            return location.pathname === '/agendamentos' || location.pathname === '/agendamentos/novo';
        }
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
    }, [location.pathname]);

    const navLinks = useMemo(() => [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/agendamentos', label: 'Agendamentos', icon: Calendar },
        { to: '/agendamentos/presenca', label: 'Controle de Faltas', icon: ClipboardList },
        { to: '/agendamentos/sessoes', label: 'Sessões por paciente', icon: Activity },
        { to: '/pacientes', label: 'Pacientes', icon: Users },
        { to: '/medicos', label: 'Médicos', icon: Stethoscope },
        ...(isAdmin ? [
            { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon }
        ] : []),
    ], [isAdmin]);
    return (
        <aside
            className={`hidden md:flex flex-col bg-slate-900 text-slate-300 h-full transition-[width] duration-300 ease-in-out shadow-xl z-30 will-change-[width] relative ${isCollapsed ? 'w-20' : 'w-72'}`}
        >
            {/* Inner wrapper for content that needs to be hidden during transition */}
            <div className="flex flex-col h-full w-full overflow-hidden">
                <div className="h-20 border-b border-slate-800/50 relative shrink-0 flex items-center px-4">
                    <div className="flex items-center gap-4 w-full h-full">
                        <div className="bg-teal-500 text-white rounded-xl font-bold text-xl shadow-lg shadow-teal-900/20 shrink-0 w-12 h-12 flex items-center justify-center">
                            CF
                        </div>
                        <div
                            className={`transition-[opacity,transform,width] duration-300 transform origin-left cursor-pointer ${isCollapsed ? 'opacity-0 scale-95 w-0 pointer-events-none' : 'opacity-100 scale-100 w-auto'
                                }`}
                            onClick={() => navigate('/')}
                        >
                            <h1 className="font-bold text-sm text-white tracking-tight leading-tight whitespace-nowrap">
                                {profile?.full_name || 'ClinicaFacil'}
                            </h1>
                            <p className="text-[10px] text-teal-400 font-black uppercase tracking-widest mt-0.5 whitespace-nowrap">
                                {profile?.role === 'admin' ? 'ADMINISTRADOR' : profile?.role === 'doctor' ? 'MÉDICO' : 'RECEPÇÃO'}
                            </p>
                        </div>
                    </div>

                    <div className={`absolute right-4 top-1/2 -translate-y-1/2 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <NotificationBell />
                    </div>
                </div>

                <div className="px-4 py-6 shrink-0 flex flex-col items-center">
                    <button
                        onClick={() => navigate('/agendamentos', { state: { action: 'new' } })}
                        className={`flex items-center w-full h-12 rounded-xl font-bold transition-[background-color,transform,box-shadow] duration-200 bg-teal-600 text-white shadow-lg shadow-teal-900/20 hover:bg-teal-500 mb-6 shrink-0 ${isCollapsed ? 'justify-center p-0' : 'px-4'}`}
                        title={isCollapsed ? "Novo Agendamento" : ""}
                    >
                        <CirclePlus size={24} className="shrink-0" />
                        <span className={`text-sm whitespace-nowrap transition-[opacity,display] duration-300 flex-1 text-left ml-4 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                            Novo Agendamento
                        </span>
                    </button>
                    <div className="h-px bg-slate-800/50 w-full mb-6" />
                </div>

                <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar overflow-x-hidden">
                    {navLinks.filter(l => l.to !== '/configuracoes').map((link) => (
                        <Link
                            key={link.to}
                            title={isCollapsed ? link.label : ''}
                            to={link.to}
                            className={`flex items-center h-12 rounded-xl text-sm font-medium transition-[background-color,transform] duration-200 group relative shrink-0 ${isCollapsed ? 'justify-center p-0' : 'px-4'} ${isActive(link.to)
                                ? 'bg-slate-800/80 text-white shadow-sm border-l-4 border-teal-500 rounded-l-none'
                                : 'hover:bg-slate-800 hover:text-white'
                                }`}
                        >
                            <link.icon
                                size={20}
                                className={`shrink-0 transition-colors duration-200 ${isActive(link.to) ? 'text-teal-400' : 'text-slate-500 group-hover:text-white'
                                    }`}
                            />
                            <span className={`transition-[opacity,display] duration-300 whitespace-nowrap flex-1 text-left ml-4 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                                {link.label}
                            </span>
                        </Link>
                    ))}

                    <Link
                        to="/escala"
                        title={isCollapsed ? 'Escala Médica' : ''}
                        className={`flex items-center h-12 rounded-xl text-sm font-medium transition-[background-color,transform] duration-200 group relative shrink-0 ${isCollapsed ? 'justify-center p-0' : 'px-4 gap-4'} ${isActive('/escala')
                            ? 'bg-slate-800/80 text-white shadow-sm border-l-4 border-teal-500 rounded-l-none'
                            : 'hover:bg-slate-800 hover:text-white'
                            }`}
                    >
                        <CalendarDays
                            size={20}
                            className={`shrink-0 transition-colors duration-200 ${isActive('/escala') ? 'text-teal-400' : 'text-slate-500 group-hover:text-white'
                                }`}
                        />
                        <span className={`transition-[opacity,display] duration-300 whitespace-nowrap flex-1 text-left ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                            Escala Médica
                        </span>
                    </Link>

                    {isAdmin && (
                        <div className="pt-4 space-y-1">
                            <div className={`px-4 text-[10px] font-black text-teal-500/50 uppercase tracking-[0.2em] mb-2 transition-all duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                                Administração
                            </div>
                            <Link
                                to="/configuracoes"
                                title={isCollapsed ? 'Configurações' : ''}
                                className={`flex items-center h-12 rounded-xl text-sm font-medium transition-[background-color,transform] duration-200 group relative shrink-0 ${isCollapsed ? 'justify-center p-0' : 'px-4'} ${isActive('/configuracoes')
                                    ? 'bg-slate-800/80 text-white shadow-sm border-l-4 border-teal-500 rounded-l-none'
                                    : 'hover:bg-slate-800 hover:text-white'
                                    }`}
                            >
                                <SettingsIcon
                                    size={20}
                                    className={`shrink-0 transition-colors duration-200 ${isActive('/configuracoes') ? 'text-teal-400' : 'text-slate-500 group-hover:text-white'
                                        }`}
                                />
                                <span className={`transition-[opacity,display] duration-300 whitespace-nowrap flex-1 text-left ml-4 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                                    Configurações
                                </span>
                            </Link>
                        </div>
                    )}
                </nav>

                <div className="p-4 border-t border-slate-800/50 bg-slate-900/50 shrink-0">
                    <button
                        onClick={() => signOut()}
                        title={isCollapsed ? 'Sair do Sistema' : ''}
                        className={`flex items-center h-12 rounded-xl text-sm font-medium text-red-400 hover:bg-red-950/30 hover:text-red-300 w-full transition-all shrink-0 ${isCollapsed ? 'justify-center p-0' : 'px-4'}`}
                    >
                        <LogOut size={20} className="shrink-0" />
                        <span className={`transition-all duration-300 whitespace-nowrap flex-1 text-left ml-4 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                            Sair do Sistema
                        </span>
                    </button>
                </div>
            </div>

            {/* Toggle Button - Outside the overflow:hidden wrapper to avoid clipping */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsCollapsed(!isCollapsed);
                }}
                className="absolute -right-3 top-10 -translate-y-1/2 bg-teal-600 text-white p-1 rounded-full shadow-lg hover:bg-teal-500 transition-colors z-[60] border border-slate-900 flex items-center justify-center cursor-pointer"
            >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
        </aside>
    );
});

const MobileSidebar = React.memo(() => {
    const { isMobile, isMobileMenuOpen, setIsMobileMenuOpen, isActive } = useSidebar() as any; // Temporary cast, ideally refine types
    const { profile, isAdmin, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Re-declare isActive here to avoid complex context sharing
    const checkActive = useCallback((path: string) => {
        if (path === '/') return location.pathname === '/';
        if (path === '/agendamentos') {
            return location.pathname === '/agendamentos' || location.pathname === '/agendamentos/novo';
        }
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
    }, [location.pathname]);

    const navLinks = useMemo(() => [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/agendamentos', label: 'Agendamentos', icon: Calendar },
        { to: '/agendamentos/presenca', label: 'Controle de Faltas', icon: ClipboardList },
        { to: '/agendamentos/sessoes', label: 'Sessões por paciente', icon: Activity },
        { to: '/pacientes', label: 'Pacientes', icon: Users },
        { to: '/medicos', label: 'Médicos', icon: Stethoscope },
        ...(isAdmin ? [
            { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon }
        ] : []),
    ], [isAdmin]);

    if (!isMobile) return null;

    return (
        <Portal>
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[90] transition-opacity animate-in fade-in"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            <aside
                className={`fixed top-0 left-0 bottom-0 w-[280px] bg-slate-900 text-slate-300 z-[100] transform transition-transform duration-300 ease-in-out shadow-2xl ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-teal-500 text-white p-2 rounded-lg font-bold text-lg shadow-lg shadow-teal-900/20">CF</div>
                        <div>
                            <h1 className="font-bold text-sm text-white tracking-tight leading-tight">{profile?.full_name || 'ClinicaFacil'}</h1>
                            <p className="text-[10px] text-teal-400 font-black uppercase tracking-widest">
                                {profile?.role === 'admin' ? 'ADMINISTRADOR' : profile?.role === 'doctor' ? 'MÉDICO' : 'RECEPÇÃO'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="px-4 py-6">
                    <button
                        onClick={() => {
                            navigate('/agendamentos', { state: { action: 'new' } });
                            setIsMobileMenuOpen(false);
                        }}
                        className="flex items-center gap-4 px-4 py-4 w-full rounded-xl font-bold transition-all bg-teal-600 text-white shadow-lg shadow-teal-900/30 hover:bg-teal-500 mb-6"
                    >
                        <CirclePlus size={22} className="shrink-0" />
                        <span className="text-sm">Novo Agendamento</span>
                    </button>
                    <div className="h-px bg-slate-800/50 mb-6" />
                </div>

                <nav className="flex-1 px-4 space-y-6 overflow-y-auto shadow-inner no-scrollbar">
                    <div className="space-y-2">
                        {navLinks.filter(l => l.to !== '/configuracoes').map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-bold transition-all group ${checkActive(link.to)
                                    ? 'bg-slate-800/80 text-white shadow-sm translate-x-1 border-l-4 border-teal-500 rounded-l-none'
                                    : 'hover:bg-slate-800 text-slate-400 hover:translate-x-1'
                                    }`}
                            >
                                <link.icon size={22} className={checkActive(link.to) ? 'text-teal-400' : 'text-slate-500 group-hover:text-white transition-colors'} />
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    {isAdmin && (
                        <div className="space-y-2">
                            <div className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                                Administração
                            </div>
                            <Link
                                to="/escala"
                                className={`flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-bold transition-all group ${checkActive('/escala')
                                    ? 'bg-slate-800/80 text-white shadow-sm translate-x-1 border-l-4 border-teal-500 rounded-l-none'
                                    : 'hover:bg-slate-800 text-slate-400 hover:translate-x-1'
                                    }`}
                            >
                                <CalendarDays size={22} className={checkActive('/escala') ? 'text-teal-400' : 'text-slate-500 group-hover:text-white transition-colors'} />
                                Escala Médica
                            </Link>
                            <Link
                                to="/configuracoes"
                                className={`flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-bold transition-all group ${checkActive('/configuracoes')
                                    ? 'bg-slate-800/80 text-white shadow-sm translate-x-1 border-l-4 border-teal-500 rounded-l-none'
                                    : 'hover:bg-slate-800 text-slate-400 hover:translate-x-1'
                                    }`}
                            >
                                <SettingsIcon size={22} className={checkActive('/configuracoes') ? 'text-teal-400' : 'text-slate-500 group-hover:text-white transition-colors'} />
                                Configurações
                            </Link>
                        </div>
                    )}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800/50 bg-slate-900/80">
                    <button
                        onClick={() => signOut()}
                        className="flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-bold text-red-400 hover:bg-red-950/30 hover:text-red-300 w-full transition-all"
                    >
                        <LogOut size={22} />
                        Sair do Sistema
                    </button>
                </div>
            </aside>
        </Portal>
    );
});

const MobileHeader = React.memo(() => {
    const { isMobile, setIsMobileMenuOpen } = useSidebar();
    if (!isMobile) return null;

    return (
        <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between sticky top-0 z-20 shadow-lg shrink-0">
            <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 hover:bg-slate-800 rounded-xl transition-all text-teal-400 active:scale-95"
                aria-label="Menu"
            >
                <Menu size={24} />
            </button>

            <div className="flex items-center gap-2">
                <div className="bg-teal-500 text-white p-1.5 rounded-lg font-bold text-sm shadow-lg shadow-teal-900/20">CF</div>
                <span className="font-bold text-white tracking-tight">ClinicaFacil</span>
            </div>

            <NotificationBell />
        </header>
    );
});

const MainContent = React.memo(({ children }: { children: React.ReactNode }) => {
    const { isCollapsed, isMobile } = useSidebar();

    return (
        <main
            className="flex-1 flex flex-col min-w-0 h-full overflow-hidden"
            style={{ '--sidebar-width': isMobile ? '0px' : (isCollapsed ? '80px' : '288px') } as any}
        >
            {import.meta.env.VITE_IS_DEMO === 'true' && (
                <div className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-1.5 px-4 text-center shadow-sm z-50 animate-in slide-in-from-top duration-500">
                    ✨ Ambiente de Demonstração (Portfólio) - Todos os dados são fictícios e seguros ✨
                </div>
            )}
            <MobileHeader />
            <ContentWrapper>
                {children || <Outlet />}
            </ContentWrapper>
        </main>
    );
});

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <SidebarProvider>
            <div className="fixed inset-0 overflow-hidden bg-[#F3F4F6] flex w-screen h-screen">
                <Sidebar />
                <MobileSidebar />
                <MainContent>{children}</MainContent>
            </div>
        </SidebarProvider>
    );
};
