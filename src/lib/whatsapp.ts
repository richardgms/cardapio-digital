import { CartItem } from "@/types/cart"

interface OrderData {
    customerName: string
    customerPhone: string
    deliveryType: 'delivery' | 'pickup' | 'table'
    deliveryZoneName?: string
    deliveryAddress?: string
    deliveryComplement?: string
    paymentMethod: 'pix' | 'card' | 'cash'
    changeFor?: string
    pixKey?: string
    pixKeyType?: string
    tableNumber?: string
    items: CartItem[]
    subtotal: number
    deliveryFee: number
    total: number
    orderNumber?: number
}

export function generateWhatsAppMessage(order: OrderData): string {
    const header = order.orderNumber
        ? `*NOVO PEDIDO #${order.orderNumber} - CARDÁPIO DIGITAL*`
        : `*NOVO PEDIDO - CARDÁPIO DIGITAL*`

    const customerInfo = [
        `*Cliente:* ${order.customerName}`,
        `*Telefone:* ${order.customerPhone}`,
    ].join('\n')

    const itemsList = order.items.map(item => {
        const productName = item.product?.name || (item as any).product_name || "Item"
        let itemStr = `*${item.quantity}x ${productName}*`

        if (item.half_half?.enabled) {
            itemStr += `\n   ½ ${item.half_half.first_half} + ½ ${item.half_half.second_half}`
        }

        if (item.selected_options && item.selected_options.length > 0) {
            item.selected_options.forEach(opt => {
                const optName = opt.option_name || (opt as any).name // Fallback
                itemStr += opt.is_replacement ? `\n   ${optName}` : `\n   + ${optName}`
            })
        }

        if (item.observation) {
            itemStr += `\n   _Obs: ${item.observation}_`
        }

        itemStr += `\n   ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.item_total)}`

        return itemStr
    }).join('\n\n')

    // Delivery Info
    let deliverySection = ''
    if (order.deliveryType === 'table') {
        deliverySection = `*PEDIDO NA MESA ${order.tableNumber || '?'}*`
    } else if (order.deliveryType === 'delivery') {
        deliverySection = [
            `*ENTREGA:*`,
            `*Bairro:* ${order.deliveryZoneName || 'N/A'}`,
            `*Endereço:* ${order.deliveryAddress || 'N/A'}`,
            order.deliveryComplement ? `   _Comp: ${order.deliveryComplement}_` : '',
        ].filter(Boolean).join('\n')
    } else {
        deliverySection = `*RETIRADA NO LOCAL*`
    }

    // Payment Info
    let paymentDetails = ''
    const paymentPrefix = (order.deliveryType === 'table' || order.deliveryType === 'pickup')
        ? 'Pagamento no caixa: '
        : 'Forma: '

    if (order.paymentMethod === 'pix') {
        paymentDetails = [
            `*${paymentPrefix}* PIX`,
            order.pixKey ? `*Chave:* ${order.pixKey}` : ''
        ].filter(Boolean).join('\n')
    } else if (order.paymentMethod === 'card') {
        paymentDetails = `*${paymentPrefix}* Cartão`
    } else if (order.paymentMethod === 'cash') {
        paymentDetails = [
            `*${paymentPrefix}* Dinheiro`,
            order.changeFor ? `*Troco para:* ${order.changeFor}` : ''
        ].filter(Boolean).join('\n')
    }

    const paymentSection = [
        `*PAGAMENTO:*`,
        paymentDetails
    ].join('\n')

    const totalsLines = [
        `*RESUMO:*`,
        `Subtotal: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.subtotal)}`,
    ]
    if (order.deliveryType === 'delivery') {
        totalsLines.push(`Entrega: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.deliveryFee)}`)
    }
    totalsLines.push(`*TOTAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}*`)
    const totals = totalsLines.join('\n')

    const footer = `\n_Pedido gerado via RMenu Digital_`

    // Combine all sections with separators
    // Build header with table tag if applicable
    const fullHeader = order.deliveryType === 'table'
        ? `${header}\n\n*PEDIDO NA MESA ${order.tableNumber || '?'}*`
        : header

    const messageBody = [
        fullHeader,
        customerInfo,
        `--------------------------------`,
        `*SEU PEDIDO:*`,
        itemsList,
        `--------------------------------`,
        deliverySection,
        `--------------------------------`,
        paymentSection,
        `--------------------------------`,
        totals,
        footer
    ].join('\n\n')

    // Remove multiple empty lines just in case
    return messageBody.replace(/\n{3,}/g, '\n\n')
}

export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
    const cleanPhone = phoneNumber.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
    const encodedMessage = encodeURIComponent(message)
    return `https://wa.me/${finalPhone}?text=${encodedMessage}`
}

/**
 * Abre o WhatsApp em uma janela pré-aberta (preserva o gesto do clique no
 * Safari iOS, que bloqueia popups disparados depois de awaits). Quando
 * `popupRef` é null, faz fallback pro window.open tradicional.
 *
 * Retorna `true` se a navegação foi disparada, `false` se popup foi bloqueado
 * — caller pode mostrar fallback com link clicável.
 */
export function navigateToWhatsApp(
    popupRef: Window | null,
    phoneNumber: string,
    message: string
): boolean {
    const url = buildWhatsAppUrl(phoneNumber, message)
    if (popupRef && !popupRef.closed) {
        try {
            popupRef.location.href = url
            return true
        } catch {
            popupRef.close()
        }
    }
    const fallback = window.open(url, '_blank')
    return fallback !== null
}

export function openWhatsApp(phoneNumber: string, message: string): boolean {
    return navigateToWhatsApp(null, phoneNumber, message)
}
