
import { BusinessHour } from "@/types/database";

export function isStoreOpenNow(
    autoEnabled: boolean,
    manualIsOpen: boolean,
    businessHours: BusinessHour[]
): boolean {
    // Se modo automático desabilitado, usar manual
    if (!autoEnabled) {
        return manualIsOpen;
    }

    // Pegar horário atual de Brasília
    const now = new Date();
    const brasiliaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

    const currentDay = brasiliaTime.getDay(); // 0-6
    // Format "HH:MM"
    const hours = brasiliaTime.getHours().toString().padStart(2, '0');
    const minutes = brasiliaTime.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    // Encontrar config do dia atual
    // Note: businessHours might be partial or unordered, finding by day_of_week is safest
    const todayConfig = businessHours?.find(bh => bh.day_of_week === currentDay);

    if (!todayConfig || !todayConfig.is_open) {
        return false;
    }

    // Verificar se está dentro de algum período
    const periods = todayConfig.periods || [];
    if (periods.length === 0) {
        // If it's open but no periods defined? Usually implies open 24h or closed?
        // Let's assume closed if no periods are defined, unless user wants "Open all day".
        // Based on the UI prompt "Adicionar período", unavailability of periods usually means closed logic in most systems,
        // BUT `is_open` is true? 
        // Let's assume if `is_open` is true and NO periods, it's CLOSED because no valid time range.
        return false;
    }

    return periods.some(period => {
        // Database time might be HH:MM:SS, slice to HH:MM
        const start = period.open_time.slice(0, 5);
        const end = period.close_time.slice(0, 5);
        return currentTime >= start && currentTime <= end;
    });
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
