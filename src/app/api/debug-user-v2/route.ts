// Diagnóstico público desativado; nenhuma consulta administrativa é executada.

export const dynamic = 'force-dynamic'

export function GET() {
    return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
    })
}
