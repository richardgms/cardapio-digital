/** Limita leituras travadas; a resposta tardia não é publicada após expirar. */
export function withReadDeadline<T>(promise: Promise<T>, timeoutMs = 10_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Tempo de leitura excedido')), timeoutMs);
        promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
}

export interface RefreshController {
    refresh(): Promise<void>;
    dispose(): void;
}

/** Serializa reconciliações; um evento durante a leitura exige nova leitura antes de publicar. */
export function createReconciler<T>(callbacks: {
    load(): Promise<T>;
    result(value: T): void;
    error(error: unknown): void;
    busy(value: boolean): void;
}): RefreshController {
    let disposed = false;
    let pending = false;
    let running: Promise<void> | null = null;
    async function run() {
        callbacks.busy(true);
        try {
            while (pending && !disposed) {
                pending = false;
                try {
                    const value = await withReadDeadline(callbacks.load());
                    if (!disposed && !pending) callbacks.result(value);
                } catch (error) {
                    if (!disposed && !pending) callbacks.error(error);
                }
            }
        } finally {
            running = null;
            if (!disposed) callbacks.busy(false);
        }
    }
    return {
        refresh() {
            if (disposed) return Promise.resolve();
            pending = true;
            if (!running) running = run();
            return running;
        },
        dispose() { disposed = true; pending = false; },
    };
}

export interface LatestLoader<Input> {
    load(input: Input): Promise<void>;
    invalidate(): void;
    dispose(): void;
}

/** Detalhes A/B, fechamento e troca de loja invalidam resultados e erros antigos. */
export function createLatestLoader<Input, Output>(callbacks: {
    load(input: Input): Promise<Output>;
    start(input: Input): void;
    result(value: Output, input: Input): void;
    error(error: unknown, input: Input): void;
    finish(input: Input): void;
}): LatestLoader<Input> {
    let generation = 0;
    let disposed = false;
    return {
        async load(input) {
            if (disposed) return;
            const current = ++generation;
            callbacks.start(input);
            try {
                const value = await withReadDeadline(callbacks.load(input));
                if (!disposed && generation === current) callbacks.result(value, input);
            } catch (error) {
                if (!disposed && generation === current) callbacks.error(error, input);
            } finally {
                if (!disposed && generation === current) callbacks.finish(input);
            }
        },
        invalidate() { generation++; },
        dispose() { disposed = true; generation++; },
    };
}
