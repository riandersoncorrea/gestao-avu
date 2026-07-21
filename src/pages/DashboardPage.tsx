import { CheckCircle2, ClipboardCheck, ShieldAlert, Timer } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'

const DEMO_CHART_DATA = [
  { month: 'Fev', avus: 12 },
  { month: 'Mar', avus: 19 },
  { month: 'Abr', avus: 14 },
  { month: 'Mai', avus: 22 },
  { month: 'Jun', avus: 17 },
  { month: 'Jul', avus: 25 },
]

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral operacional — Serviços Operacionais São Luís EFC."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="AVUs abertas" value={38} icon={ShieldAlert} trend={{ value: '+4 na semana', direction: 'up' }} />
        <KpiCard label="Em execução" value={12} icon={Timer} />
        <KpiCard label="Fiscalizações pendentes" value={7} icon={ClipboardCheck} trend={{ value: '-2 na semana', direction: 'down' }} />
        <KpiCard label="Concluídas no mês" value={25} icon={CheckCircle2} trend={{ value: '+18%', direction: 'up' }} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>AVUs abertas por mês (exemplo — dados fictícios)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DEMO_CHART_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} />
                <Tooltip cursor={{ fill: '#f2f2f2' }} />
                <Bar dataKey="avus" fill="#0e9b8a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Sem atividade ainda"
              description="O feed de atividades será implementado junto com o módulo de AVUs."
              className="border-none px-0 py-8"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
