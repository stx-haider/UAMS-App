import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Login from './pages/Login';
import Layout from './components/Layout';
import { FeedbackProvider } from './components/FeedbackProvider';
import {
  AggregatePage,
  AttendancePage,
  DashboardPage,
  SettingsPage,
  StudentsPage,
  SubjectsPage,
} from './pages/SystemPages';

function ProtectedLayout() {
  const account = useAuth();
  if (account === undefined) return <div className="loading-state">Opening local account…</div>;
  return account ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <FeedbackProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/subjects" element={<SubjectsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/mid-term" element={<AggregatePage kind="midterm" />} />
            <Route path="/final-aggregate" element={<AggregatePage kind="final" />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </FeedbackProvider>
  );
}