// ─── Phone ───────────────────────────────────────────────

/**
 * Aplica máscara, aceitando somente dígitos e ignorando prefixo 55 se presente.
 * - 10 dígitos (fixo): (XX) XXXX-XXXX
 * - 11 dígitos (celular): (XX) XXXXX-XXXX
 */
export function formatPhone(value: string): string {
    let digits = value.replace(/\D/g, '')

    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        digits = digits.slice(2)
    }

    digits = digits.slice(0, 11)

    if (digits.length === 0) return ''
    if (digits.length <= 2) return `(${digits}`
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    }
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function cleanPhone(value: string): string {
    return value.replace(/\D/g, '')
}

/**
 * Valida telefone brasileiro: 10 dígitos (fixo) ou 11 (celular).
 * Retorna mensagem de erro ou null se válido.
 */
export function validatePhone(value: string): string | null {
    const digits = cleanPhone(value)

    if (digits.length === 0) return 'Informe seu telefone'
    if (digits.length < 10) return 'Telefone incompleto'
    if (digits.length > 11) return 'Telefone inválido'

    const ddd = parseInt(digits.slice(0, 2), 10)
    if (ddd < 11 || ddd > 99) return 'DDD inválido'

    if (digits.length === 11 && digits[2] !== '9') {
        return 'Celular deve começar com 9 após o DDD'
    }

    return null
}

// ─── Name ────────────────────────────────────────────────

export function validateName(value: string): string | null {
    const trimmed = value.trim().replace(/\.+$/, '')

    if (trimmed.length === 0) return 'Informe seu nome'
    if (trimmed.length < 3) return 'Nome muito curto'
    if (/\d/.test(trimmed)) return 'Nome não pode conter números'
    if (!/^[a-zA-ZÀ-ÿ\s'\-]+$/.test(trimmed)) return 'Nome contém caracteres inválidos'

    return null
}
