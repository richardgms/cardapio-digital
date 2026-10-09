import 'server-only';
import { isPrintSelfServiceEnabled } from '@/lib/print-activation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPrintRequestLimiter, handlePrintAgentRequest } from '@/lib/print-agent-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const allow = createPrintRequestLimiter();
export async function POST(request: Request) {
    return handlePrintAgentRequest(request, {
        enabled: process.env.RMENU_PRINT_AGENT_ENABLED === '1', selfServiceEnabled: isPrintSelfServiceEnabled(), allow,
        rpc: async (name, parameters) => {
            const { data, error } = await createAdminClient().rpc(name, parameters).abortSignal(AbortSignal.timeout(8_000));
            return { data, error: error ? { code: error.code } : null };
        },
    });
}
