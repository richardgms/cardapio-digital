import { PrintConfiguration } from '@/components/admin/printing/PrintConfiguration';
import { Breadcrumb } from '@/components/admin/Breadcrumb';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Impressão de pedidos' };
export const dynamic = 'force-dynamic';
export default function ImpressaoPage() {
    return <div className="space-y-6 max-w-4xl mx-auto pb-20">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Impressão' }]} />
        <PrintConfiguration moduleEnabled={process.env.RMENU_PRINT_AGENT_ENABLED === '1'} activationReady={process.env.RMENU_PRINT_ACTIVATION_READY === '1'} />
    </div>;
}
