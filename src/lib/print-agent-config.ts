export function isPrintAgentEndpointAllowed(input: string) {
    try {
        const url = new URL(input);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/printing/agent') return false;
        if (url.protocol === 'https:' && (url.hostname === 'rmenu.com.br' || url.hostname.endsWith('.rmenu.com.br')) && !url.port) return true;
        return url.protocol === 'http:' && url.port === '3010' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname.endsWith('.localhost'));
    } catch { return false; }
}
