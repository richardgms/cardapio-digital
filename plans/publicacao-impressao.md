# Publicação e operação contínua

## Estado consolidado em 10/10/2026

Os PRs [#1](https://github.com/richardgms/cardapio-digital/pull/1) e
[#2](https://github.com/richardgms/cardapio-digital/pull/2) foram integrados.
Último deployment conferido: `dpl_6icHz7ixk15Hoe8DfGsQUcbLZcpB`, Ready,
merge `bacc3cc5ed7781f2d36256899b23ad210a4fabb2`, com aliases comerciais e teste1.
Migrações 04 e 05 aplicadas e verificadas; flags de agente, ativação e
`RMENU_PRINT_SELF_SERVICE=1` habilitadas na publicação conferida. O dono pode ativar
após teste físico registrado e computador conectado, sem liberação individual por
UUID no fluxo autônomo. A publicação não ativou outros restaurantes.

Na teste1, o fluxo atualizado foi confirmado em produção: teste no assistente,
confirmação no painel, reativação às 22:44:11 em 08/10 (São Paulo) e pedido fictício
#016 posterior ao corte, em uma via legível com corte e uma tentativa registrada.
O estado foi lido como `self_service`. Testes de continuidade e PWA já concluídos
estão no [changelog](../docs/changelog.md).

Próxima etapa: contato com Soberano Burguer, instalação assistida e operação
prolongada no equipamento do restaurante. O operador escolheu piloto com executável
sem assinatura; assinatura prévia deixou de ser requisito desse piloto. Distribuição
pública permanece pendente. Modelo conhecido antecipadamente ajuda, mas o assistente
lista impressoras instaladas; o teste físico continua obrigatório antes de ativar.
Procedimento: [piloto assistido](piloto-assistido-impressao.md).

## Histórico da preparação

O registro abaixo descreve etapas anteriores. Os deployments, pendências de SQL e
restrições de liberação ali citados foram substituídos pelo estado consolidado acima.

Estado confirmado em 08/10/2026: projeto Vercel richardgms-projects/cardapio-digital, ID prj_WElQReMshf36K9red4cMfyQ6fFVi, Node 24.x. CLI 62.7.0 instalada, autenticada e pasta vinculada ao projeto existente. PR de revisão: https://github.com/richardgms/cardapio-digital/pull/1, ainda draft e sem merge.

## Publicação atual

Somente https://teste1.rmenu.com.br usa o deployment dpl_7VXQgjWnQzHKQa6fKi6trg2Ub1e4, recompilado a partir de 0effb84 sem mudança no código de aplicação 544d499, build e runtime com RMENU_PRINT_AGENT_ENABLED=1, RMENU_PRINT_ACTIVATION_READY=1 e RMENU_PRINT_ACTIVATION_STORE_IDS contendo apenas o UUID da teste1. A política exige lista válida e verifica o dono autenticado antes de ativar ou solicitar reimpressão; lista ausente/vazia/inválida bloqueia todas as lojas. Desativação continua disponível ao dono.

O domínio principal e o wildcard *.rmenu.com.br continuam no deployment comercial anterior dpl_ExCN964hzW812oecxeZnFZcZwu8j. A impressão da teste1 foi ativada pelo próprio operador em 08/10/2026 às 16:11:37 (America/Sao_Paulo), com novo corte sem histórico. A migração 2026100804 ainda não foi aplicada.

A preparação da publicação salvou em produção as três opções não secretas RMENU_PRINT_AGENT_ENABLED=1, RMENU_PRINT_ACTIVATION_READY=1 e RMENU_PRINT_ACTIVATION_STORE_IDS=099cb335-23df-4aca-b13e-3fee1e31fde9. A CLI confirmou as três inclusões, e a consulta de metadados confirmou seus nomes e destino production; nenhum segredo remoto foi baixado. As cinco variáveis anteriores foram preservadas. Essa configuração será usada por novos builds; os deployments e aliases existentes permaneceram iguais. A lista libera exclusivamente a teste1. O piloto escolhido é Soberano Burguer (subdomínio cadastrado soberano-burguer), mas o contato, Windows, modelo da impressora e calibração ainda aguardam o operador; sua loja não foi liberada.

Não houve download nem comparação dos segredos remotos. A revisão automática anterior rejeitou env pull por persistir segredos de produção; esse acesso não foi contornado. A configuração do instalador contém somente a credencial própria do dispositivo, protegida por DPAPI CurrentUser depois da importação, nunca service_role.

## Confirmações concluídas

Os pedidos fictícios publicados #008 a #015 tiveram uma tentativa registrada cada. No Android, o operador confirmou instalação nova (#014), aviso de atualização, recarregamento e pedido após atualizar com uma única via legível e corte (#015). O operador confirmou impressão automática, Chrome fechado no PC, outro celular sem pedido anterior, reinício real do Windows com assistente iniciando sozinho, interrupção de energia da Epson e desconexão/reconexão Ethernet do PC. O health autenticado recuperou conexão e a fila Windows ficou vazia após os testes. O pedido #007, anterior à ativação, não entrou na fila. Evidência: database/reference/published-print-operation-verification-20261008.json.

Com a Epson desligada, o Windows aceitou um trabalho e manteve erro na fila; ao religar, o operador confirmou uma via legível com corte. Isso valida a recuperação observada dessa combinação de driver/Epson de 80 mm; spooler_submitted não comprova impressão física nem garante o mesmo comportamento em outros modelos.

Validação técnica anterior: 246 casos de regressão aprovados em execuções documentadas, mais sete novos testes de liberação por loja; 36 testes direcionados de fila/API/liberação, TypeScript, lint dos arquivos modificados e builds remotos aprovados. As 48 verificações Windows anteriores permanecem documentadas. Auditoria de dependências de produção sem alertas; cinco alertas altos continuam restritos à cadeia do linter de desenvolvimento. Não houve mudança de código depois desses checks ao registrar as evidências físicas.

## Próximos passos

1. O operador confirmou instalação nova do PWA no Android, abertura pelo ícone sem barra do Chrome e pedido fictício #014 com uma via legível e corte; o banco registrou uma tentativa. Para conferir a atualização desse aplicativo instalado, foi publicada somente na teste1 uma nova compilação com worker diferente (dpl_7VXQgjWnQzHKQa6fKi6trg2Ub1e4); a conexão autenticada permaneceu ativa, sem reenviar pedidos. O operador confirmou o aviso, recarregou o PWA e finalizou o pedido fictício #015, com uma via legível e corte; o banco registrou uma tentativa, sem alterar tentativas anteriores. A atualização dessa instalação Serwist passou. Isso ainda não comprova migração de uma instalação antiga com Workbox.
2. A configuração persistente das três opções de impressão foi preparada, restrita à teste1. A revisão final confirmou contrato público válido nas cinco lojas, nenhuma ativação fora do escopo e auditoria de 149 arquivos sem segredos literais nem novos erros de lint. A verificação de privacidade foi corrigida para não exigir que a impressão esteja desligada: informa o número de lojas ativas separadamente e não altera sua ativação; 17 testes passaram, incluindo execução com impressão ligada. Conferir os checks do novo head do PR antes da publicação autorizada. Sequência e recuperação: plans/execucao-publicacao-impressao.md.
3. Conferir os leitores públicos e os fluxos dos restaurantes nos domínios reais depois da publicação. Somente então aplicar/verificar 2026100804_private_store_configuration.sql com a trava de consumidores publicados. Não voltar aos consumidores antigos após revogar suas permissões sem plano de compatibilidade.
4. Assinar digitalmente e preparar a distribuição do instalador. O executável atual é de avaliação local e está excluído do Git, Vercel e cache PWA. Guia para o lojista: printing/guia-do-restaurante.md.
5. Selecionar um restaurante piloto, conferir seu Windows/driver/impressora/papel/corte, liberar somente sua loja e observar operação prolongada. Outras impressoras, 58 mm e macOS/Linux ainda exigem validação própria.

A impressão da teste1 continua ativada para os ensaios controlados. Nenhum pedido real, envio de WhatsApp, reimpressão ou mudança de fila/journal foi necessário para registrar essas confirmações.
