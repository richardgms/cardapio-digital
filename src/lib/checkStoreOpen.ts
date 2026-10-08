
import { BusinessHour } from "@/types/database";

export function isStoreOpenNow(
    autoEnabled: boolean, manualIsOpen: boolean, businessHours: BusinessHour[], now = new Date()
): boolean {
    if (!autoEnabled) return manualIsOpen
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'))
    const time = `${part('hour')}:${part('minute')}:${part('second')}`
    return businessHours.some(h => h.is_open && (h.periods ?? []).some(p => {
        const start = p.open_time.length === 5 ? `${p.open_time}:00` : p.open_time
        const end = p.close_time.length === 5 ? `${p.close_time}:00` : p.close_time
        return (h.day_of_week === day && ((start < end && time >= start && time < end) || (start > end && time >= start)))
            || (h.day_of_week === (day + 6) % 7 && start > end && time < end)
    }))
}

const WEEKDAYS = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado"
];

export function getNextOpeningTime(businessHours: BusinessHour[]): string | null {
    if (!businessHours || businessHours.length === 0) return null;

    // Pegar horário atual de Brasília
    const now = new Date();
    const brasiliaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

    const currentDay = brasiliaTime.getDay(); // 0-6
    const hours = brasiliaTime.getHours().toString().padStart(2, '0');
    const minutes = brasiliaTime.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    // Procurar nos próximos 7 dias (incluindo hoje)
    for (let i = 0; i < 7; i++) {
        const checkDay = (currentDay + i) % 7;
        const config = businessHours.find(bh => bh.day_of_week === checkDay);

        if (config && config.is_open && config.periods && config.periods.length > 0) {
            // Ordenar períodos por horário de início
            const sortedPeriods = [...config.periods].sort((a, b) => a.open_time.localeCompare(b.open_time));

            for (const period of sortedPeriods) {
                const start = period.open_time.slice(0, 5);

                // Se for hoje, o período deve começar DEPOIS de agora
                // Se já estiver aberto agora, esta função não deve ser chamada idealmente, ou retornamos null se quisermos apenas "próxima" abertura
                // Mas a lógica aqui assume que a loja está FECHADA

                if (i === 0) {
                    if (start > currentTime) {
                        return `Hoje às ${start}`;
                    }
                } else {
                    // Dias futuros: pegar o primeiro período
                    const dayLabel = i === 1 ? "Amanhã" : WEEKDAYS[checkDay];
                    return `${dayLabel} às ${start}`;
                }
            }
        }
    }

    return null;
}
