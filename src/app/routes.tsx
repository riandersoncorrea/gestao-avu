import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { PortalLayout } from '@/layouts/PortalLayout'
import { ROUTES } from '@/lib/routes'
import { LoadingState } from '@/components/LoadingState'
import { RequireAdmin, RequireAuth, RequirePermission, RedirectIfAuthenticated } from '@/features/auth/ProtectedRoute'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AvusPage = lazy(() => import('@/pages/AvusPage').then((m) => ({ default: m.AvusPage })))
const AvuFormPage = lazy(() => import('@/pages/AvuFormPage').then((m) => ({ default: m.AvuFormPage })))
const AvuDetailPage = lazy(() => import('@/pages/AvuDetailPage').then((m) => ({ default: m.AvuDetailPage })))
const PlanningPage = lazy(() => import('@/pages/PlanningPage').then((m) => ({ default: m.PlanningPage })))
const MapPage = lazy(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })))
const ContractorsPage = lazy(() =>
  import('@/pages/ContractorsPage').then((m) => ({ default: m.ContractorsPage })),
)
const InspectionsPage = lazy(() =>
  import('@/pages/InspectionsPage').then((m) => ({ default: m.InspectionsPage })),
)
const InspectionReviewPage = lazy(() =>
  import('@/pages/InspectionReviewPage').then((m) => ({ default: m.InspectionReviewPage })),
)
const ImportsPage = lazy(() => import('@/pages/ImportsPage').then((m) => ({ default: m.ImportsPage })))
const ImportReviewPage = lazy(() =>
  import('@/pages/ImportReviewPage').then((m) => ({ default: m.ImportReviewPage })),
)
const SapImportPage = lazy(() => import('@/pages/SapImportPage').then((m) => ({ default: m.SapImportPage })))
const SapImportDetailPage = lazy(() =>
  import('@/pages/SapImportDetailPage').then((m) => ({ default: m.SapImportDetailPage })),
)
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const PortalDashboardPage = lazy(() =>
  import('@/pages/PortalDashboardPage').then((m) => ({ default: m.PortalDashboardPage })),
)
const PortalAvusPage = lazy(() => import('@/pages/PortalAvusPage').then((m) => ({ default: m.PortalAvusPage })))
const PortalAvuDetailPage = lazy(() =>
  import('@/pages/PortalAvuDetailPage').then((m) => ({ default: m.PortalAvuDetailPage })),
)
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })))
const ForgotPasswordPage = lazy(() =>
  import('@/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const ForbiddenPage = lazy(() => import('@/pages/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<LoadingState />}>{element}</Suspense>
}

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: ROUTES.login, element: withSuspense(<LoginPage />) },
      { path: ROUTES.signup, element: withSuspense(<SignupPage />) },
      { path: ROUTES.forgotPassword, element: withSuspense(<ForgotPasswordPage />) },
    ],
  },
  // Rota de recuperação de senha fica fora do RedirectIfAuthenticated: o link do e-mail
  // estabelece uma sessão de recovery, e não queremos redirecionar o usuário para o
  // dashboard antes de ele conseguir definir a nova senha.
  { path: ROUTES.resetPassword, element: withSuspense(<ResetPasswordPage />) },
  { path: ROUTES.forbidden, element: withSuspense(<ForbiddenPage />) },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: ROUTES.dashboard, element: withSuspense(<DashboardPage />) },
          { path: ROUTES.avus, element: withSuspense(<AvusPage />) },
          { path: `${ROUTES.avus}/:id`, element: withSuspense(<AvuDetailPage />) },
          {
            element: <RequirePermission permission="avus.create" />,
            children: [
              { path: `${ROUTES.avus}/novo`, element: withSuspense(<AvuFormPage />) },
              { path: `${ROUTES.avus}/:id/editar`, element: withSuspense(<AvuFormPage />) },
            ],
          },
          { path: ROUTES.planning, element: withSuspense(<PlanningPage />) },
          { path: ROUTES.map, element: withSuspense(<MapPage />) },
          { path: ROUTES.contractors, element: withSuspense(<ContractorsPage />) },
          {
            element: <RequirePermission permission="evidence.analyze" />,
            children: [
              { path: ROUTES.inspections, element: withSuspense(<InspectionsPage />) },
              { path: `${ROUTES.inspections}/:id`, element: withSuspense(<InspectionReviewPage />) },
            ],
          },
          {
            element: <RequirePermission permission="avus.create" />,
            children: [
              { path: ROUTES.imports, element: withSuspense(<ImportsPage />) },
              { path: `${ROUTES.imports}/:id`, element: withSuspense(<ImportReviewPage />) },
              { path: ROUTES.sapImports, element: withSuspense(<SapImportPage />) },
              { path: `${ROUTES.sapImports}/:id`, element: withSuspense(<SapImportDetailPage />) },
            ],
          },
          { path: ROUTES.reports, element: withSuspense(<ReportsPage />) },
          { path: ROUTES.notifications, element: withSuspense(<NotificationsPage />) },
          {
            element: <RequirePermission permission="history.view" />,
            children: [{ path: ROUTES.auditLog, element: withSuspense(<AuditLogPage />) }],
          },
          {
            element: <RequireAdmin />,
            children: [{ path: ROUTES.admin, element: withSuspense(<AdminPage />) }],
          },
        ],
      },
      {
        element: <PortalLayout />,
        children: [
          { path: ROUTES.portal, element: withSuspense(<PortalDashboardPage />) },
          { path: `${ROUTES.portal}/avus`, element: withSuspense(<PortalAvusPage />) },
          { path: `${ROUTES.portal}/avus/:id`, element: withSuspense(<PortalAvuDetailPage />) },
        ],
      },
    ],
  },
  {
    path: '*',
    element: withSuspense(<NotFoundPage />),
  },
], {
  // Mesmo valor usado em `base` (vite.config.ts) — "/" em dev, "/gestao-avu/" no build de
  // produção (GitHub Pages). Sem isso, `navigate('/avus')`/`<Link to="/avus">` etc. resolveriam
  // a partir da raiz do domínio, ignorando o subcaminho onde o app está publicado.
  basename: import.meta.env.BASE_URL,
})
