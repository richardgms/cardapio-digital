import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { MetricsManager } from '@/components/admin/metrics/MetricsManager'

export default function MetricasPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Métricas' },
            ]} />
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Métricas</h1>
            </div>
            <MetricsManager />
        </div>
    )
}
