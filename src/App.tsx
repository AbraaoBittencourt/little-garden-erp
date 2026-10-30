import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/components/Toast'
import Layout from '@/components/Layout'
import { ProtectedRoute, RoleRoute } from '@/components/ProtectedRoute'
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@/pages/AuthPages'
import Dashboard from '@/pages/Dashboard'
import UsersPage from '@/pages/Users'
import SettingsPage from '@/pages/Settings'
import { NotFound, Welcome } from '@/pages/Misc'
import StudentsPage from '@/pages/Students'
import StudentDetail from '@/pages/StudentDetail'
import GuardiansPage from '@/pages/Guardians'
import EnrollmentsPage from '@/pages/Enrollments'
import EnrollmentWizard from '@/pages/EnrollmentWizard'
import ClassesPage from '@/pages/Classes'
import StaffPage from '@/pages/Staff'
import AttendancePage from '@/pages/Attendance'
import PedagogicalPage from '@/pages/Pedagogical'
import FinancePage from '@/pages/Finance'
import PayablesPage from '@/pages/Payables'
import ReceivablesPage from '@/pages/Receivables'
import DocumentsPage from '@/pages/Documents'
import CommunicationPage from '@/pages/Communication'
import ReportsPage from '@/pages/Reports'
import GuardianPortal from '@/pages/GuardianPortal'
import AuditPage from '@/pages/Audit'
import RematriculaPage from '@/pages/Rematricula'
import SchoolItemsPage from '@/pages/SchoolItems'
import { useAuth } from '@/contexts/AuthContext'
import type { Role } from '@/lib/types'
import { ACADEMIC, DF, DS, DSC, DSF, PED, STAFF } from '@/lib/roles'
import type { ReactElement } from 'react'

function Home() {
  const { hasRole } = useAuth()
  if (hasRole('direcao', 'secretaria', 'financeiro', 'coordenacao')) return <Dashboard />
  if (hasRole('responsavel') && !hasRole('professor')) return <Navigate to="/meus-filhos" replace />
  return <Welcome />
}

const guarded = (roles: Role[], path: string, el: ReactElement) => (
  <Route key={path} element={<RoleRoute roles={roles} />}><Route path={path} element={el} /></Route>
)

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-a-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            {guarded(ACADEMIC, '/alunos', <StudentsPage />)}
            {guarded(['direcao', 'secretaria', 'financeiro', 'coordenacao', 'professor'], '/alunos/:id', <StudentDetail />)}
            {guarded(DS, '/rematricula', <RematriculaPage />)}
            {guarded(DS, '/fardamentos-materiais', <SchoolItemsPage />)}
            {guarded(DS, '/responsaveis', <GuardiansPage />)}
            {guarded(DS, '/matriculas', <EnrollmentsPage />)}
            {guarded(DS, '/matriculas/nova', <EnrollmentWizard />)}
            {guarded(ACADEMIC, '/turmas', <ClassesPage />)}
            {guarded(DSC, '/equipe', <StaffPage />)}
            {guarded(ACADEMIC, '/frequencia', <AttendancePage />)}
            {guarded(PED, '/pedagogico', <PedagogicalPage />)}
            {/* REGRA ESPECÍFICA: Módulo financeiro estritamente exclusivo da Direção */}
            {guarded(['direcao'], '/financeiro', <FinancePage />)}
            {guarded(['direcao'], '/contas-a-pagar', <PayablesPage />)}
            {guarded(['direcao'], '/contas-a-receber', <ReceivablesPage />)}
            {guarded(DS, '/documentos', <DocumentsPage />)}
            {guarded(DSC, '/comunicacao', <CommunicationPage />)}
            {guarded(['direcao', 'secretaria', 'financeiro', 'coordenacao', 'professor'], '/relatorios', <ReportsPage />)}
            {guarded(['responsavel'], '/meus-filhos', <GuardianPortal />)}
            {guarded(['direcao'], '/usuarios', <UsersPage />)}
            {guarded(['direcao'], '/auditoria', <AuditPage />)}
            {guarded(['direcao'], '/configuracoes', <SettingsPage />)}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
void STAFF
