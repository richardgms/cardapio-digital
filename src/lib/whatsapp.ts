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
        `--------------------------------`
    ].join('\n')

    const itemsList = order.items.map(item => {
        const productName = item.product?.name || (item as any).product_name || "Item"
        let itemStr = `*${item.quantity}x ${productName}*`

        if (item.half_half?.enabled) {
            itemStr += `\n   ½ ${item.half_half.first_half} + ½ ${item.half_half.second_half}`
        }

        if (item.selected_options && item.selected_options.length > 0) {
            item.selected_options.forEach(opt => {
                itemStr += `\n   + ${opt.option_name}`
            })
        }

        if (item.observation) {
            itemStr += `\n   _Obs: ${item.observation}_`
        }

        itemStr += `\n   ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.item_total)}`

        return itemStr
    }).join('\n\n')

    const deliveryInfo = order.deliveryType === 'delivery' ? [
        `--------------------------------`,
        `*ENTREGA:*`,
        `*Bairro:* ${order.deliveryZoneName}`,
        `*Endereço:* ${order.deliveryAddress}`,
        order.deliveryComplement ? `*Complemento:* ${order.deliveryComplement}` : '',
    ].filter(Boolean).join('\n') : [
        `--------------------------------`,
        `*RETIRADA NO LOCAL*`,
    ].join('\n')

    const paymentInfo = [
        `--------------------------------`,
        `*PAGAMENTO:*`,
        `*Forma:* ${order.paymentMethod === 'pix' ? 'PIX' :
            order.paymentMethod === 'card' ? 'Cartão na Entrega' : 'Dinheiro'
        }`,
        order.changeFor ? `*Troco para:* ${order.changeFor}` : ''
    ].filter(Boolean).join('\n')

    const totals = [
        `--------------------------------`,
        `*RESUMO:*`,
        `Subtotal: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.subtotal)}`,
        `Taxa de Entrega: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.deliveryFee)}`,
        `*TOTAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}*`
    ].join('\n')

    const footer = `\n_Pedido gerado via Cardápio Digital_`

    return encodeURIComponent(
        `${header}\n\n${customerInfo}\n${itemsList}\n\n${deliveryInfo}\n\n${paymentInfo}\n\n${totals}${footer}`
    )
}

export function openWhatsApp(phoneNumber: string, message: string) {
    // Remove non-digits from phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '')
    // Add Brazil country code if missing
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

    window.open(`https://wa.me/${finalPhone}?text=${message}`, '_blank')
}
