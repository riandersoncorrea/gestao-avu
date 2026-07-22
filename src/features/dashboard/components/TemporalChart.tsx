import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import type { TemporalPoint } from '../analytics'

export function TemporalChart({ data }: { data: TemporalPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AVUs criadas por mês</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} allowDecimals={false} />
            <Tooltip cursor={{ stroke: '#c6376b', strokeWidth: 1 }} />
            <Line type="monotone" dataKey="count" stroke="#c6376b" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
