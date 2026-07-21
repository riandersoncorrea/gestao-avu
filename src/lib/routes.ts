export const ROUTES = {
  dashboard: '/',
  avus: '/avus',
  planning: '/planejamento',
  map: '/mapa',
  contractors: '/contratadas',
  inspections: '/fiscalizacao',
  imports: '/importacoes',
  reports: '/relatorios',
  admin: '/administracao',
  login: '/login',
  signup: '/cadastro',
  forgotPassword: '/esqueci-senha',
  resetPassword: '/redefinir-senha',
  forbidden: '/acesso-negado',
} as const

export type RouteKey = keyof typeof ROUTES
