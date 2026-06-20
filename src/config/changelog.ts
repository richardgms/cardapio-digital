export interface ChangelogEntry {
  version: string
  date: string
  title: string
  changes: string[]
}

export const changelogHistory: ChangelogEntry[] = [
  {
    version: "1.36.0",
    date: "19/06/2026",
    title: "Métricas no Simulador (Super Admin)",
    changes: [
      "Integrado painel de métricas do restaurante diretamente na área do Simulador de Loja.",
      "Criação de Server Actions seguras com validação administrativa e log de auditoria para visualização de faturamento e vendas.",
      "Filtros unificados por período (Hoje, 7d, 30d, Todos) e tipo de entrega (Delivery, Retirada, Mesa)."
    ]
  },
  {
    version: "1.35.10",
    date: "30/05/2026",
    title: "Destaque de Promoções no Menu Público",
    changes: [
      "Injeção automática da categoria virtual 'Promoções' no topo da barra de navegação se houver itens promocionais ativos.",
      "Scroll spy e scroll suave integrados nativamente com a nova seção de Promoções.",
      "Exibição discreta de tag inline com porcentagem de desconto (ex: -15%) ao lado do preço com promoção no card."
    ]
  },
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
