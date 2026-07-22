import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import type { GroupedCount } from '../analytics'

export function GroupBarChart({ title, data }: { title: string; data: GroupedCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <EmptyState title="Sem dados" description="Nenhuma AVU corresponde aos filtros atuais." className="border-none px-0 py-8" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="key" tickLine={false} axisLine={false} fontSize={12} width={110} />
              <Tooltip cursor={{ fill: '#f2f2f2' }} />
              <Bar dataKey="count" fill="#0e9b8a" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
