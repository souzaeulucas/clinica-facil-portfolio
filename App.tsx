import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppLayout } from './components/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/Dashboard/AdminDashboard';
import Settings from './components/Settings';

// Pages
import AppointmentList from './pages/Appointments/AppointmentList';
import SessionManagement from './pages/Appointments/SessionManagement';
import AttendanceManagement from './pages/Appointments/AttendanceManagement';
import PatientList from './pages/Patients/PatientList';
import DoctorsPublicView from './pages/Doctors/DoctorsPublicView';
import ScaleManagement from './pages/ScaleManagement/ScaleManagement';

const AdminRouteWrapper: React.FC = () => {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children || <Outlet />}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Rotas Públicas */}
            <Route path="/login" element={<Login />} />

            {/* Rotas Privadas com Layout Persistente */}
            <Route element={
              <ProtectedRoute>
                <AppLayout children={null} />
              </ProtectedRoute>
            }>
              {/* Dashboard / Home */}
              <Route path="/" element={<AdminDashboard />} />

              {/* Agendamentos Routes */}
              <Route path="/agendamentos" element={<AppointmentList />} />
              <Route path="/agendamentos/sessoes" element={<SessionManagement />} />
              <Route path="/agendamentos/presenca" element={<AttendanceManagement />} />
              <Route path="/pacientes" element={<PatientList />} />

              <Route path="/medicos" element={<DoctorsPublicView />} />

              {/* Configurações (Apenas Admin) */}
              <Route element={<AdminRouteWrapper />}>
                <Route path="/configuracoes" element={<Settings />} />
                <Route path="/escala" element={<ScaleManagement />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
