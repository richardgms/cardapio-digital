import { z } from 'zod';

const checkSchema = z.object({
    ready: z.boolean(),
    devices: z.array(z.object({
        id: z.string().uuid(),
        last_seen_at: z.string().datetime({ offset: true }).nullable(),
        calibration_state: z.enum(['not_requested', 'requested', 'dispatching', 'spooler_submitted', 'uncertain', 'paper_confirmed']),
        calibrated: z.boolean(),
        connected: z.boolean(),
    }).strict()).max(100),
}).strict();

export function parsePrintSelfServiceCheck(input: unknown) {
    const parsed = checkSchema.safeParse(input);
    if (!parsed.success) return { available: false, ready: false, devices: [] as z.infer<typeof checkSchema>['devices'] };
    // Do not trust a permissive/malformed backend summary without a matching device.
    return { available: true, ...parsed.data, ready: parsed.data.ready && parsed.data.devices.some(device => device.calibrated && device.connected) };
}
