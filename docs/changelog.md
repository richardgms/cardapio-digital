# Histórico de atualizações do RMenu

Registro consolidado em 10/10/2026. A versão da aplicação permanece **1.37.0**:
esta atualização completa as notas das mudanças entregues, sem criar uma versão
nova apenas para documentação. O histórico mostrado ao clicar na versão na sidebar
administrativa usa `src/config/changelog.ts`.

## 1.37.0 — 08/10/2026

### Carrinho e pedidos

- Editar um item substitui a linha existente e conserva quantidade, opções e
  observação. A observação aparece no carrinho para conferência antes de finalizar.
- Registro atômico de pedido, itens e cupom, com validação de preços no servidor e
  recuperação de tentativas sem duplicar o pedido.
- Documento de impressão persistido, numeração por loja e preservação de pedidos
  antigos sem itens, sem enviá-los automaticamente à impressora.
- Painel com atualização, filtros, detalhes e histórico de impressão. Registrar
  pedido, abrir WhatsApp, informar pagamento e imprimir mantêm estados separados.

### Impressão automática e ativação pelo lojista

- Fila persistente com isolamento por loja, credencial própria por dispositivo,
  revogação, autorização antes do envio e journal local durável.
- Ativação pelo proprietário no painel após uma comanda fictícia, confirmação
  física no assistente e computador conectado. A habilitação do módulo na publicação
  não liga a impressão dos restaurantes automaticamente.
- Somente pedidos novos, completos e posteriores à ativação entram automaticamente.
  Ativação repetida preserva o corte; histórico não é reenfileirado.
- Assistente Windows 10/11 lista as impressoras instaladas no Windows, configura
  largura de 58 ou 80 mm e pode iniciar ao entrar no Windows. O driver precisa estar
  instalado; aparecer na lista não comprova compatibilidade física.
- O agente trabalha em segundo plano e continua com o navegador fechado. O computador
  precisa estar ligado, com o usuário Windows conectado, rede e impressora disponíveis.
- Testes e envios com resultado incerto exigem conferência de papel e fila, sem
  repetição física automática nem remoção de journal para forçar outro envio.

### Privacidade e PWA

- Configuração integral da loja privada, leitura pública limitada ao cardápio e
  barreiras de acesso do proprietário no banco e no servidor.
- Upload de imagens com autorização por loja, preservando imagens públicas existentes.
  Um upload autenticado de imagem fictícia foi conferido e removido ao terminar.
- Migração do gerador de PWA para Serwist, com manifest, ícones, aviso de atualização
  e fallback público sem conexão. APIs, admin, autenticação e recursos privados
  permanecem fora do cache de conteúdo público.
- Callback de autenticação dos subdomínios configurado no Supabase e login por e-mail
  conferido no domínio da loja.

### Publicação e evidências

- PRs [#1](https://github.com/richardgms/cardapio-digital/pull/1) e
  [#2](https://github.com/richardgms/cardapio-digital/pull/2) integrados. Última
  publicação conferida: merge `bacc3cc5ed7781f2d36256899b23ad210a4fabb2`, deployment
  Vercel `dpl_6icHz7ixk15Hoe8DfGsQUcbLZcpB`, estado Ready. Domínio raiz, wildcard
  e domínios dos restaurantes conferidos nessa publicação.
- Migrações `2026100804_private_store_configuration` e
  `2026100805_print_self_service` aplicadas pelo operador e verificadas com todos
  os checks aprovados. As consultas de verificação não ativaram impressão.
- Código, builds, TypeScript, lint direcionado e testes SQL/API/Windows aprovados
  nas etapas registradas. Isso não equivale a uma nova execução dessas suítes na
  atualização documental de 10/10.
- Na teste1, operador confirmou uma via legível e corte na Epson TM-T20X USB/80 mm:
  navegador fechado, outro celular, reinício do Windows com início automático,
  recuperação de rede e de energia da impressora, instalação nova e atualização do
  PWA no Android. Pedidos fictícios #008 a #015 tiveram uma tentativa registrada cada.
- No fluxo de ativação pelo lojista, assistente atualizado e confirmação física
  foram conferidos. Reativação em 08/10 às 22:44:11 (São Paulo), modo `self_service`;
  pedido fictício #016 posterior ao corte, uma tentativa registrada e papel
  confirmado pelo operador. `spooler_submitted` significa aceitação pelo Windows;
  a confirmação física foi feita separadamente.

## Limites e próximos passos

- Piloto assistido com instalador sem assinatura escolhido pelo operador. O
  executável permanece fora do Git, da publicação Vercel e do cache PWA; distribuição
  pública e assinatura estão pendentes. Não desativar proteções do Windows para instalar.
- Soberano Burguer foi escolhido para piloto; contato, instalação no equipamento
  do restaurante e observação de um turno completo permanecem pendentes.
- Outros modelos, papel de 58 mm e impressão automática em macOS/Linux ainda
  precisam de validação própria. O site continua acessível pelo navegador nesses sistemas.
- A migração física de um PWA antigo com Workbox ainda não foi validada. Os testes
  Android concluídos cobrem instalação nova Serwist e atualização dessa instalação.
- Estes registros representam as evidências das etapas anteriores; não afirmam
  disponibilidade contínua sem falhas ou uma nova consulta à produção em 10/10.

Veja [operação e instalação](operacao-impressao.md),
[guia do restaurante](../printing/guia-do-restaurante.md) e
[plano do piloto assistido](../plans/piloto-assistido-impressao.md).
