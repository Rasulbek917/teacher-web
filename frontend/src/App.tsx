import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ChatPage } from './pages/ChatPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { TeachersPage } from './pages/admin/TeachersPage';
import { TeacherDashboardPage } from './pages/teacher/TeacherDashboardPage';
import { GroupsPage } from './pages/teacher/GroupsPage';
import { StudentsPage } from './pages/teacher/StudentsPage';
import { MaterialsPage } from './pages/teacher/MaterialsPage';
import { HomeworkPage } from './pages/teacher/HomeworkPage';
import { AttendancePage } from './pages/teacher/AttendancePage';
import { GradesPage } from './pages/teacher/GradesPage';
import { StatisticsPage } from './pages/teacher/StatisticsPage';
import { PaymentsPage } from './pages/teacher/PaymentsPage';
import { StudentHomePage } from './pages/student/StudentHomePage';
import { StudentGroupPage } from './pages/student/StudentGroupPage';
import { StudentHomeworkPage } from './pages/student/StudentHomeworkPage';
import { StudentGradesPage } from './pages/student/StudentGradesPage';
import { StudentMaterialsPage } from './pages/student/StudentMaterialsPage';
import { StudentStatsPage } from './pages/student/StudentStatsPage';
import { StudentPaymentsPage } from './pages/student/StudentPaymentsPage';
import { Spinner } from './components/ui';

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner label="Yuklanmoqda..." />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RoleHome() {
  const { user } = useAuth();
  if (user?.role === 'SUPER_ADMIN') return <AdminDashboardPage />;
  if (user?.role === 'TEACHER') return <TeacherDashboardPage />;
  return <StudentHomePage />;
}

function MaterialsRouter() {
  const { user } = useAuth();
  return user?.role === 'TEACHER' ? <MaterialsPage /> : <StudentMaterialsPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<RoleHome />} />
        <Route
          path="/teachers"
          element={
            <RequireRole roles={['SUPER_ADMIN']}>
              <TeachersPage />
            </RequireRole>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireRole roles={['TEACHER']}>
              <GroupsPage />
            </RequireRole>
          }
        />
        <Route
          path="/students"
          element={
            <RequireRole roles={['TEACHER']}>
              <StudentsPage />
            </RequireRole>
          }
        />
        <Route path="/materials" element={<MaterialsRouter />} />
        <Route
          path="/homework"
          element={
            <RequireRole roles={['TEACHER']}>
              <HomeworkPage />
            </RequireRole>
          }
        />
        <Route
          path="/attendance"
          element={
            <RequireRole roles={['TEACHER']}>
              <AttendancePage />
            </RequireRole>
          }
        />
        <Route
          path="/grades"
          element={
            <RequireRole roles={['TEACHER']}>
              <GradesPage />
            </RequireRole>
          }
        />
        <Route
          path="/statistics"
          element={
            <RequireRole roles={['TEACHER']}>
              <StatisticsPage />
            </RequireRole>
          }
        />
        <Route
          path="/payments"
          element={
            <RequireRole roles={['TEACHER']}>
              <PaymentsPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-group"
          element={
            <RequireRole roles={['STUDENT']}>
              <StudentGroupPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-homework"
          element={
            <RequireRole roles={['STUDENT']}>
              <StudentHomeworkPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-grades"
          element={
            <RequireRole roles={['STUDENT']}>
              <StudentGradesPage />
            </RequireRole>
          }
        />
        <Route path="/images" element={<RequireRole roles={['STUDENT']}><StudentMaterialsPage /></RequireRole>} />
        <Route
          path="/my-stats"
          element={
            <RequireRole roles={['STUDENT']}>
              <StudentStatsPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-payments"
          element={
            <RequireRole roles={['STUDENT']}>
              <StudentPaymentsPage />
            </RequireRole>
          }
        />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
