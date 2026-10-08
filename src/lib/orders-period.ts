export type OrdersPeriod = 'today' | '7days' | '30days' | 'all';
export const ORDERS_PAGE_SIZE = 50;

/** Hoje é o dia da loja em São Paulo, independente do fuso do PC/servidor. */
export function ordersPeriodStart(period: OrdersPeriod, now = new Date()): string | null {
    if (period === 'all') return null;
    if (period === '7days' || period === '30days') return new Date(now.getTime() - (period === '7days' ? 7 : 30) * 86_400_000).toISOString();
    if (period !== 'today') throw new Error('Período inválido');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00-03:00`).toISOString();
}

export function ordersPageRange(page: number): [number, number] {
    if (!Number.isSafeInteger(page) || page < 0 || page > 100_000) throw new Error('Página inválida');
    return [page * ORDERS_PAGE_SIZE, (page + 1) * ORDERS_PAGE_SIZE - 1];
}
