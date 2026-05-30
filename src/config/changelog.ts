export interface ChangelogEntry {
  version: string
  date: string
  title: string
  changes: string[]
}

export const changelogHistory: ChangelogEntry[] = [
  {
    version: "1.35.9",
    date: "30/05/2026",
    title: "Módulo de Descontos e Preços Promocionais",
    changes: [
      "Adicionado suporte a preço promocional por produto no painel de administração.",
      "Validação para garantir que o preço promocional seja menor que o preço base.",
      "Preço promocional destacado em verde no cardápio, com o preço original tachado ao lado.",
      "Modal do produto atualizado para calcular subtotais e adicionais baseando-se no preço promocional ativo.",
      "Pizza Meio a Meio adaptada para cobrar a metade mais cara baseando-se no preço ativo (promocional ou original)."
    ]
  },
  {
    version: "1.35.8",
    date: "30/05/2026",
    title: "Nomes de Abas Dinâmicos e Ajustes de Pagamento",
    changes: [
      "Implementado títulos dinâmicos na aba do navegador de acordo com a página acessada no admin.",
      "Alterado o termo de pagamento com cartão na entrega de 'Cartão' para 'Maquininha na entrega'.",
      "Melhorias de peso tipográfico e legibilidade na tela de seleção de pagamento do checkout."
    ]
  },
  {
    version: "1.35.7",
    date: "30/05/2026",
    title: "Métodos de Pagamento Configuráveis",
    changes: [
      "Adicionada configuração de métodos de pagamento (Pix, Dinheiro, Cartão) no painel do lojista.",
      "Disponibilização da opção de pagamento com cartão físico para pedidos do tipo Delivery."
    ]
  }
]
