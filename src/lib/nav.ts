import {
  LayoutDashboard, GraduationCap, Users, ClipboardList, School, CalendarCheck, BookOpenCheck, Briefcase,
  Wallet, Receipt, HandCoins, FolderOpen, Megaphone, BarChart3, ShieldCheck, Settings, History, Baby,
  Shirt, RefreshCw, type LucideIcon,
} from 'lucide-react'
import type { Role } from './types'

export interface NavItem { to: string; label: string; icon: LucideIcon; roles: Role[]; stage: number; ready?: boolean }
export interface NavGroup { title: string; items: NavItem[] }

const ALL: Role[] = ['direcao', 'secretaria', 'financeiro', 'coordenacao', 'professor']

export const NAV: NavGroup[] = [
  { title: 'Visão geral', items: [
    { to: '/meus-filhos', label: 'Meus filhos', icon: Baby, roles: ['responsavel'], stage: 5, ready: true },
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['direcao', 'secretaria', 'financeiro', 'coordenacao'], stage: 1, ready: true },
  ]},
  { title: 'Gestão escolar', items: [
    { to: '/alunos', label: 'Alunos', icon: GraduationCap, roles: ['direcao', 'secretaria', 'coordenacao', 'professor'], stage: 1, ready: true },
    { to: '/rematricula', label: 'Rematrícula 2027', icon: RefreshCw, roles: ['direcao', 'secretaria'], stage: 2, ready: true },
    { to: '/fardamentos-materiais', label: 'Fardamentos e Materiais', icon: Shirt, roles: ['direcao', 'secretaria'], stage: 2, ready: true },
    { to: '/responsaveis', label: 'Responsáveis', icon: Users, roles: ['direcao', 'secretaria'], stage: 1, ready: true },
    { to: '/matriculas', label: 'Matrículas', icon: ClipboardList, roles: ['direcao', 'secretaria'], stage: 1, ready: true },
    { to: '/turmas', label: 'Turmas', icon: School, roles: ['direcao', 'secretaria', 'coordenacao', 'professor'], stage: 1, ready: true },
    { to: '/equipe', label: 'Professores e funcionários', icon: Briefcase, roles: ['direcao', 'secretaria', 'coordenacao'], stage: 1, ready: true },
  ]},
  { title: 'Pedagógico', items: [
    { to: '/frequencia', label: 'Frequência', icon: CalendarCheck, roles: ['direcao', 'secretaria', 'coordenacao', 'professor'], stage: 1, ready: true },
    { to: '/pedagogico', label: 'Pedagógico', icon: BookOpenCheck, roles: ['direcao', 'coordenacao', 'professor'], stage: 1, ready: true },
  ]},
  { title: 'Financeiro', items: [
    // REGRA ESPECÍFICA: O módulo Financeiro e todas as suas subpáginas são estritamente exclusivos da Direção
    { to: '/financeiro', label: 'Financeiro', icon: Wallet, roles: ['direcao'], stage: 1, ready: true },
    { to: '/contas-a-pagar', label: 'Contas a pagar', icon: Receipt, roles: ['direcao'], stage: 1, ready: true },
    { to: '/contas-a-receber', label: 'Contas a receber', icon: HandCoins, roles: ['direcao'], stage: 1, ready: true },
  ]},
  { title: 'Operação', items: [
    { to: '/documentos', label: 'Documentos', icon: FolderOpen, roles: ['direcao', 'secretaria'], stage: 1, ready: true },
    { to: '/comunicacao', label: 'Comunicação', icon: Megaphone, roles: ['direcao', 'secretaria', 'coordenacao'], stage: 1, ready: true },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['direcao', 'secretaria', 'financeiro', 'coordenacao', 'professor'], stage: 1, ready: true },
  ]},
  { title: 'Administração', items: [
    { to: '/usuarios', label: 'Usuários e permissões', icon: ShieldCheck, roles: ['direcao'], stage: 1, ready: true },
    { to: '/auditoria', label: 'Auditoria', icon: History, roles: ['direcao'], stage: 1, ready: true },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['direcao'], stage: 1, ready: true },
  ]},
]
export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items)
export { ALL }
