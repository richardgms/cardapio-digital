// Diagnóstico público desativado; nenhum usuário é alterado e nenhum OTP é enviado.

export const dynamic = 'force-dynamic'

export function GET() {
    return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
    })
}
