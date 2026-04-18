// ─── Phone ───────────────────────────────────────────────

/** Aplica máscara (XX) XXXXX-XXXX, aceitando somente dígitos e ignorando prefixo 55 se presente */
export function formatPhone(value: string): string {
    let digits = value.replace(/\D/g, '')

    // Se começar com 55 e tiver 12 ou 13 dígitos, remove o 55 (DDI Brasil)
    // Isso evita que o 55 seja tratado como DDD em números que já vem com o código do país
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        digits = digits.slice(2)
    }

    // Garante no máximo 11 dígitos para o formato (DD) 9XXXX-XXXX
    digits = digits.slice(0, 11)

    if (digits.length <= 2) return digits.length ? `(${digits}` : ''
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/** Remove máscara, retorna somente dígitos */
export function cleanPhone(value: string): string {
    return value.replace(/\D/g, '')
}

/**
 * Valida telefone brasileiro: 11 dígitos
 * DDD (11–99) + 9 + 8 dígitos
 * Retorna mensagem de erro ou null se válido
 */
export function validatePhone(value: string): string | null {
    const digits = cleanPhone(value)

    if (digits.length === 0) return 'Informe seu telefone'
    if (digits.length < 11) return 'Telefone incompleto — digite DDD + 9 dígitos'
    if (digits.length > 11) return 'Telefone inválido — muitos dígitos'

    const ddd = parseInt(digits.slice(0, 2), 10)
    if (ddd < 11 || ddd > 99) return 'DDD inválido'

    if (digits[2] !== '9') return 'Celular deve começar com 9 após o DDD'

    return null
}

// ─── Name ────────────────────────────────────────────────

/**
 * Valida nome do cliente.
 * Mín 3 chars, aceita letras (inclui acentos), espaços, apóstrofos e hífens.
 * Retorna mensagem de erro ou null se válido.
 */
export function validateName(value: string): string | null {
    const trimmed = value.trim().replace(/\.+$/, '')

    if (trimmed.length === 0) return 'Informe seu nome'
    if (trimmed.length < 3) return 'Nome muito curto'
    if (/\d/.test(trimmed)) return 'Nome não pode conter números'
    if (!/^[a-zA-ZÀ-ÿ\s'\-]+$/.test(trimmed)) return 'Nome contém caracteres inválidos'

    return null
}
