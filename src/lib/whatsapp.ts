import { CartItem } from "@/types/cart"

interface OrderData {
    customerName: string
    customerPhone: string
    deliveryType: 'delivery' | 'pickup'
    deliveryZoneName?: string
    deliveryAddress?: string
    deliveryComplement?: string
    paymentMethod: 'pix' | 'card' | 'cash'
    changeFor?: string
    pixKey?: string
    pixKeyType?: string
    items: CartItem[]
    subtotal: number
    deliveryFee: number
    total: number
}

export function generateWhatsAppMessage(order: OrderData): string {
    const header = `*NOVO PEDIDO - CARDÁPIO DIGITAL*`

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
                itemStr += `\n   + ${optName}`
            })
        }

        if (item.observation) {
            itemStr += `\n   _Obs: ${item.observation}_`
        }

        itemStr += `\n   ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.item_total)}`

        return itemStr
    }).join('\n\n')

    // Delivery Info
    const deliverySection = order.deliveryType === 'delivery' ? [
        `*ENTREGA:*`,
        `*Bairro:* ${order.deliveryZoneName || 'N/A'}`,
        `*Endereço:* ${order.deliveryAddress || 'N/A'}`,
        order.deliveryComplement ? `   _Comp: ${order.deliveryComplement}_` : '',
    ].filter(Boolean).join('\n') : [
        `*RETIRADA NO LOCAL*`
    ].join('\n')

    // Payment Info
    let paymentDetails = ''
    if (order.paymentMethod === 'pix') {
        paymentDetails = [
            `*Forma:* PIX`,
            order.pixKey ? `*Chave:* ${order.pixKey}` : ''
        ].filter(Boolean).join('\n')
    } else if (order.paymentMethod === 'card') {
        paymentDetails = `*Forma:* Cartão na Entrega`
    } else if (order.paymentMethod === 'cash') {
        paymentDetails = [
            `*Forma:* Dinheiro`,
            order.changeFor ? `*Troco para:* ${order.changeFor}` : ''
        ].filter(Boolean).join('\n')
    }

    const paymentSection = [
        `*PAGAMENTO:*`,
        paymentDetails
    ].join('\n')

    const totals = [
        `*RESUMO:*`,
        `Subtotal: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.subtotal)}`,
        `Entrega: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.deliveryFee)}`,
        `*TOTAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}*`
    ].join('\n')

    const footer = `\n_Pedido gerado via Cardápio Digital_`

    // Combine all sections with separators
    const messageBody = [
        header,
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

export function openWhatsApp(phoneNumber: string, message: string) {
    // Remove non-digits from phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '')
    // Add Brazil country code if missing
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/${finalPhone}?text=${encodedMessage}`, '_blank')
}
