# Preparação e implementação da impressão de pedidos

Atualização 08/10/2026: ensaio automático controlado concluído no Supabase/Next local/agente instalado, pedido fictício #004/R$ 14,00; usuário confirmou uma via legível com corte. Nenhum pedido histórico enfileirado, reinício sem repetição, impressão desligada ao terminar. Ver [ensaio da fila real](../printing/automatic-live-test.md). Vercel CLI 62.7.0/login richardgms confirmados; sem publicação. A migração 04 e a operação contínua permanecem etapas separadas.

Decisão de produto em 07/10/2026: o cliente finaliza no cardápio; o servidor registra o pedido completo; a impressão é automática, sem aceite obrigatório no painel. A conversa no WhatsApp continua sendo conduzida pelo lojista.

## Contrato do fluxo

- Finalizar no cardápio registra o pedido na loja, mesmo se o cliente não enviar a mensagem do WhatsApp.
- Pedido, itens, preços, endereço e reserva de cupom devem ser gravados em uma transação. O trabalho de impressão só pode existir depois da validação completa.
- Abrir o WhatsApp é um sinal de navegação. Não comprova envio, recebimento, conversa, pagamento ou preparo.
- A fila usa o conteúdo salvo no pedido, incluindo complemento, observações, sabores, opções e valores. Mudanças no catálogo não alteram uma comanda histórica.
- A versão definitiva deve permitir impressão com o navegador fechado por meio de um serviço local autenticado. O PC precisa estar ligado, conectado e sem suspensão.

## Riscos e mitigações

| Risco | Mitigação / critério de validação |
| --- | --- |
| Rotas públicas com chave administrativa expõem usuários ou enviam OTP | Encerrar as duas rotas de diagnóstico com resposta 404 sem importar Supabase. Testar ausência de efeitos externos. |
| Cliente declara que o pedido foi confirmado | Permitir apenas o sinal de abertura do WhatsApp, vinculado ao ID e à chave UUID da tentativa. Nunca alterar estado operacional ou pagamento por essa ação pública. |
| Vulnerabilidades nas dependências | Atualizar versões com correções oficiais, lockfile consistente e build/regressões. Consulta npm audit depende de autorização explícita para enviar metadados ao registro público. |
| Pedido visível antes dos itens; falha parcial | Função transacional restrita ao servidor; falha em qualquer item desfaz pedido, itens, cupom e trabalho de impressão. Inventariar constraints e triggers reais antes de alterar o banco. |
| Cliente modifica preços, descontos ou itens de outra loja | Receber IDs de catálogo e opções; calcular valores no servidor; validar loja, disponibilidade, promoções, adicionais e regras de meio a meio. |
| Loja fechada, entrega indisponível, mesa ou pagamento inválidos | Validar regras de negócio no servidor antes de gravar. Definir e testar horários no fuso America/Sao_Paulo e a virada de dia. |
| Repetição após timeout, popup bloqueado ou reabertura do carrinho | Persistir a tentativa e o ID salvo; mesma chave corresponde ao mesmo conteúdo; conteúdo diferente retorna conflito. Reenviar a mensagem usa o pedido salvo. |
| Cliente finaliza mas não envia a mensagem | Aviso explícito de que o pedido já foi registrado. Impressão independe da abertura do WhatsApp. Contato e cancelamento ficam acessíveis ao lojista. |
| Campos incompletos ou valores diferentes na mensagem e comanda | Snapshot completo e um único contrato de pedido para painel, WhatsApp e impressão. Testar complemento, cupom, troco, promoções e sabores. |
| Uso simultâneo ultrapassa limite de cupom | Validação e reserva do uso na mesma transação do pedido. Primeira compra calculada a partir do histórico, com definição de quais estados contam. |
| Configuração privada ou fila acessível a outras lojas | Separar projeção pública da configuração privada; revisar RLS, grants e funções; testar isolamento entre duas lojas. Chave administrativa fica no servidor. |
| Duas abas, dois PCs ou eventos repetidos imprimem duas vezes | Trabalho inicial único por loja/pedido/finalidade, independente do dispositivo; reserva atômica e exclusividade; eventos só sinalizam a existência de trabalhos. Reimpressão explícita e auditada. |
| PC, internet ou impressora indisponíveis | Fila persistente, estados visíveis e reconciliação ao reconectar; renovação de reserva apenas pelo dispositivo autorizado. Testar reconexão e reinício. |
| Falha depois de enviar ao spooler gera repetição | Estado de resultado incerto; não repetir automaticamente após envio sem reconciliação. Entrega ao spooler não comprova impressão física. |
| Ativação ou reconexão imprime pedidos históricos | Data de início explícita por loja, compartilhada pelos dispositivos; não criar fila para todo o histórico. Trabalhos antigos pendentes precisam de política de expiração/revisão. |
| Pedido é cancelado ou alterado durante a impressão | Verificar elegibilidade ao reservar e antes de enviar. Versão do pedido no trabalho; cancelamento bloqueia trabalhos ainda não enviados. Documento já enviado exige aviso/correção explícita. |
| Serviço local perde autorização ou imprime dados de outra loja | Vincular dispositivo à loja, credencial revogável e escopo mínimo; evitar portas locais abertas sem autenticação. Definir instalação, atualização e remoção antes de distribuir o módulo. |
| Painel mostra dados antigos ou detalhe de outro pedido | Atualização automática com reconciliação; ignorar respostas antigas de detalhes; paginação e estados separados para pedido, pagamento, WhatsApp e impressão. |
| Métricas contam registro/abertura como venda paga | Definir estados que entram em cada indicador; manter pagamento e impressão independentes. |
| Impressora produz caracteres errados, corta campos ou duplica via | Teste manual na Epson TM-T20X com dados fictícios: papel, acentos, linhas longas, opções, corte e quantidade de vias; conferir o papel físico. |

## Etapas e validação

1. **Segurança imediata e sem mudança de schema.** Encerrar diagnóstico público; proteger sinal de WhatsApp; corrigir aviso ao cliente; regressões locais, TypeScript, lint dos arquivos alterados e build. Dependências e configuração pública continuam pendentes até validação específica.
2. **Inventário e base do banco.** Executar `database/inventory-readonly.sql` com conexão autorizada ao PostgreSQL/SQL Editor. Conferir RLS, grants, chaves, índices, triggers e função de numeração; investigar o pedido sem itens preservando histórico; criar migrações versionadas e validar em ambiente de teste.
3. **Checkout transacional.** Implementar cálculo e regras no servidor, cupom concorrente, endereço completo, tentativa persistente e conteúdo imutável. Testar falha no segundo item, chamadas concorrentes, conflito de conteúdo, retorno após timeout e popup bloqueado.
4. **Painel e teste manual de impressão.** Atualização automática, contrato único de detalhes e teste físico controlado na Epson. Não enviar pedidos reais nem histórico durante testes.
5. **Fila automática e serviço local.** Reserva exclusiva, credenciais por dispositivo, reinício/reconexão, cancelamento, expiração, falha após envio e reimpressão auditada. Ativar apenas para novos pedidos após passar as validações.

## Estado da primeira etapa

- Implementado localmente: rotas de diagnóstico retornam 404; sinal de WhatsApp exige chave da tentativa, rejeita confirmação pública, preserva confirmação existente e bloqueia cancelados; aviso ao cliente diz que o pedido está registrado.
- Validação: 13 testes de regressão com banco simulado passaram; TypeScript e build passaram; lint das rotas, ação e testes passou; teste HTTP no build local confirmou resposta 404 com corpo vazio nas duas rotas. O servidor temporário foi encerrado após o teste.
- Lint dos dois componentes do carrinho ainda aponta cinco erros anteriores (quatro usos de `any` e um efeito de montagem) e um aviso anterior. Não introduzidos nesta etapa; permanecem no escopo de limpeza do checkout.
- Nenhuma alteração aplicada no banco remoto, nenhum deploy e nenhuma impressão física nesta etapa.
- O uso da chave de idempotência como vínculo do sinal é limitado à navegação. Credenciais de dispositivos e autorização da fila terão contrato próprio.
- A revisão automática recusou `npm audit --omit=dev --json`: a autorização geral não foi considerada autorização explícita para enviar metadados das dependências ao npm. Não contornar a recusa.
- Só há credenciais REST do Supabase no ambiente disponível; não há conexão PostgreSQL nem CLI `psql`/`supabase`. O usuário executou o inventário, a migração, a verificação de políticas/grants e o teste de isolamento no SQL Editor e trouxe os resultados; não há conexão PostgreSQL direta disponível para o agente.
- O usuário confirmou que pode executar o inventário no SQL Editor e trazer o resultado. O arquivo SQL retorna um único campo `inventory` com o diagnóstico.
- Os diagnósticos anteriores em `docs/audit-order-probes.cjs` reproduzem falhas da versão anterior, não são testes de regressão da implementação corrigida.

## Inventário recebido e etapa 2A

O usuário trouxe o resultado do inventário em 07/10/2026. Confirmado:

- RLS está habilitado nas 16 tabelas, mas há 12 políticas de escrita abertas ou antigas sem isolamento adequado. `Dev Full Access Products`, `Anon Update Business Hours` e `Anon Update Periods` permitem escrita anônima; categorias, zonas e configuração têm acesso amplo autenticado; regras antigas usam e-mail da primeira configuração.
- Pedidos e itens têm políticas de dono. Há índice único parcial de idempotência por loja e unicidade de número por loja; quatro triggers estão instalados, incluindo numeração e contador de cupom.
- Há um pedido antigo pendente sem itens. Nenhum vínculo de item/produto ou pedido/zona entre lojas nem duplicatas foi encontrado no inventário. Preservar o histórico e investigar o pedido.
- Apenas `orders` está publicado no Realtime. O complemento segue ausente. A tabela de histórico de migrações gerenciadas não existe.

Prioridade ajustada: aplicar e validar `database/migrations/2026100701_harden_store_writes.sql` antes de avançar no checkout transacional. A migração remove escrita antiga de nove tabelas, usa UID do dono, protege relações entre lojas, retira grants de escrita de visitantes e acrescenta guards restritivos. Leitura pública e ações do servidor com service_role continuam disponíveis.

Validação local: 59 testes passaram em PostgreSQL em memória (PGlite 0.5.8), com schema reduzido e dados fictícios. A suite reproduz escrita aberta antes da migração, testa escrita permitida/negada, vínculos entre lojas, reaplicação, service_role, adição futura de permissão ampla e rollback após falha de schema. Lint dos testes passou. Esses testes não substituem conferência do schema e dos fluxos no Supabase real.

A aplicação no Supabase foi feita pelo usuário e o resultado de `database/verify-store-writes-readonly.sql` foi recebido. O usuário confirmou o salvamento e a persistência após recarregar da descrição de produto e dos horários, usando conta normal de lojista. Também confirmou a abertura do cardápio público sem login; o print mostra Chrome em janela anônima em `teste1.rmenu.com.br`, produtos de R$ 15 e R$ 14 e um item de R$ 14 no carrinho, com subtotal e total de R$ 14. Não há confirmação de finalização de pedido ou envio de WhatsApp nesse teste. O procedimento detalhado está em `database/README.md`.

Atualização: o usuário enviou a verificação após aplicar a migração. Confirmadas 36 políticas de escrita: uma permissiva de dono e três restritivas em cada uma das nove tabelas. As duas listas de grants inesperados vieram vazias. Uma consulta real pela API, exclusivamente com chave anon e sem sessão, confirmou leitura nas nove tabelas e relações de produtos/opções e horários/períodos. Evidência local em `docs/database-verification.json` e `docs/anonymous-catalog-verification.json`, ignoradas pelo Git.

Validação funcional recebida: persistência de descrição do produto, persistência de horários e cardápio sem login confirmados pelo usuário. A ferramenta de navegador do agente falhou ao iniciar nesta sessão, mesmo após reset, então esses testes no painel foram executados pelo usuário. A implementação de horários ainda ignora alguns erros retornados pelo SDK e grava configuração/dias/períodos separadamente; a persistência observada confirma o caminho de sucesso, mas a correção do tratamento de falhas e da transação permanece pendente. Os testes manuais de configuração, categorias/opções, zonas e painel de superadmin não foram confirmados.

Próximos pontos: projeção pública sem `admin_email`, revisão de colunas administrativas/Storage, corpos dos triggers de numeração e cupom, checkout transacional, persistência da tentativa e fila de impressão. Não ativar impressão com a gravação separada atual. Preparada `database/inspect-order-logic-readonly.sql` para obter apenas metadados/código das funções ligadas aos triggers de pedidos e cupons. O usuário trouxe `order_logic` com quatro funções/triggers; os corpos reais recebidos foram revisados e executados em PostgreSQL local com dados fictícios. Relatório em `database/review-order-foundation.md`. A etapa 2B preparada revoga apenas privilégios de tabela inteira (TRUNCATE/TRIGGER/REFERENCES) nas 16 tabelas; oito verificações de migração passaram, seis diagnósticos reproduziram riscos atuais e uma verificação confirmou que funções de trigger não podem ser chamadas como SQL normal. Não há teste de concorrência entre duas conexões. Etapa 2B aplicada pelo usuário no Supabase: `tables_checked: 16`, listas de tabelas ausentes/sem RLS/privilégios indevidos vazias. Há zero cupons e usos de cupom, e todas as contagens de inconsistências são zero. Pode preparar a persistência transacional com testes locais; a aplicação atual continua gravando pedido/itens/uso separadamente até a integração posterior.

Verificação adicional preparada: `database/verify-store-isolation-rollback.sql` tenta operações efetivas de produtos usando os papéis anon/authenticated e UIDs de duas lojas, em transação desfeita por rollback. São 11 verificações, incluindo edição entre lojas nos dois sentidos, escrita do dono e bloqueio de visitantes. O procedimento passou em PostgreSQL local e o teste confirma preservação dos dados e políticas após rollback. O usuário executou o arquivo no Supabase real e enviou `all_passed: true`, `checks_count: 11`, com todas as verificações verdadeiras. Comprovado o bloqueio das operações testadas em produtos, usando os papéis reais do banco com UIDs simulados na sessão administrativa. Não substitui duas sessões reais nem abrange todas as tabelas no banco publicado.

## Etapa 2C preparada: persistência transacional

Preparadas `database/migrations/2026100703_atomic_order_persistence.sql` e sua verificação somente de leitura. Complemento/hash/contagem de itens, unicidade por pedido no uso de cupom, contador não nulo/não negativo, trigger de mesma loja e função RPC invoker restrita a service_role. A função grava pedido/itens/uso atomicamente, verifica replay por hash e completude, calcula frete e cupom com bloqueio, valida produto/sabores da loja e mantém handoff separado. Preserva trigger/números antigos e interrompe em inconsistência histórica; não gera fila.

**Não integrada ao checkout.** Antes de ativar a ação pública: servidor deve calcular catálogo/opções/promoções/meio a meio, verificar horários, normalizar intenção/hash, persistir tentativa no carrinho, enviar complemento e usar snapshot registrado para os consumidores. Hash é confiado ao chamador privilegiado; não usar valor enviado pelo cliente. RPC recebe snapshots já validados, não resolve preços de opções sozinho. Pedidos legados/cancelados/incompletos não são retornados como replay seguro.

As 22 verificações locais desta etapa e o lint do teste passaram. Os testes cobrem transação, integridade, replay, cupons, complemento, meio a meio/mesa e preservação de histórico/schema. As verificações das etapas anteriores também passaram na execução combinada. Duas conexões reais, integração pública, proteção de colunas e contador monotônico por loja continuam pendentes. Detalhes em `database/atomic-order-persistence.md`. Usuário confirmou aplicação da etapa 2C: persistence_verification com todas as colunas/constraints e permissões esperadas, contador não nulo e triggers ativos.

## Etapa 2D preparada: catálogo consistente

Preparados cálculo canônico e normalização de intenção, ainda sem ligar a ação/carrinho. A migração 2026100704 acrescenta projeção privada do catálogo e wrapper de submissão que bloqueia pais/filhos, compara o catálogo usado pelo servidor e verifica funcionamento da loja antes da gravação atômica. Rejeita alterações de produto, opções, regras e horário entre leitura e gravação. Replay de pedido completo permanece recuperável após mudanças do catálogo ou fechamento. Funções invoker, search_path vazio, somente service_role. Não altera registros antigos nem libera impressão. A projeção privada não substitui a revisão das consultas públicas antigas.

105 verificações de banco, 13 de segurança e 13 de preço/intenção passaram; lint da etapa e TypeScript passaram. Banco local usa schema reduzido e não valida duas conexões reais. Manual de execução/verificação e contrato em `database/order-catalog-guard.md`. Instalação da etapa 2D confirmada pelo usuário; a integração local subsequente está descrita abaixo.

## Etapa 2E local: checkout integrado

Usuário confirmou catalog_verification da etapa 2D com todas as funções/permissões esperadas. A ação local agora chama rmenu_submit_order com preço calculado do catálogo, hash normalizado e complemento; não faz escritas separadas. Carrinho conserva tentativa, aviso persiste comprovante e mensagem usa snapshot salvo com desconto/cupom. Modal guarda IDs de opções/sabores e calcula o maior preço configurado no meio a meio respeitando regras de ambos. Preview de cupom usa subtotal canônico e projeção limitada. 106 testes de banco (incluindo integração servidor/SQL real), 31 de checkout e 13 de segurança passaram, assim como TypeScript/build; lint sem erros e dois avisos anteriores de img. Consulta real somente de leitura confirmou os dois produtos de teste1 via catálogo privado. Servidor compilado local em 127.0.0.1:3010, GET tenant 200; não publicado. Automação visual indisponível, validação manual pendente em plans/validacao-checkout.md. Impressão, painel automático/fila e demais pontos da base continuam pendentes.

## Referências

- [Cardápio Web: impressão e aceite automáticos](https://ajuda.cardapioweb.com/gestao/gestao-de-pedidos/como-mudar-o-status-de-um-pedido-no-sistema-delivery-retirada-e-agendamento)
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: funções de banco](https://supabase.com/docs/guides/database/functions)
- [npm audit: dados enviados e comportamento](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
- [Next.js: atualização de segurança de setembro de 2026](https://nextjs.org/blog/september-2026-security-release)


## Etapas 2F e 4: documentos confirmados e ensaio físico

Etapa 2F aplicada no Supabase pelo usuário: `document_verification.all_passed: true`, 12 checks corretos, 6 triggers válidos, funções privadas/invoker, sem grants de escrita indevidos e sem divergências de documentos/contadores. Numeração persistente por loja, conteúdo imutável, versão 1, documento selado no commit dos pedidos do novo fluxo. Legado sem itens preservado, sem documento automático. Migração não cria fila nem ativa impressão. Procedimento e limites em [order-documents-and-numbers.md](../database/order-documents-and-numbers.md).

Ensaio na Epson TM-T20X de 80 mm: uma única via fictícia enviada via driver/GDI, sem pedido real. Prévia e foto do usuário comprovam layout legível, acentos, endereço/complemento/bairro, opções, observações, valores e total R$ 32,00. Usuário confirmou corte automático e exatamente uma via. Driver informou largura imprimível de cerca de 72,2 mm. Journal local registra intenção antes do envio e recusa repetição automática. Largura/driver/corte devem ser configurados por fila/dispositivo para atender restaurantes com 58 ou 80 mm.

Painel local implementado: reconciliação por eventos/polling/retomada, paginação/filtros no banco, proteção contra respostas antigas e detalhes lidos juntos; estados de pedido/contato/pagamento distintos. Sete testes do sincronizador, TypeScript/lint/build passaram. Navegador local conferido pelo agente com três pedidos de teste e detalhe do #003; exercício visual de perda/reconexão e concorrência de eventos ainda pendente. Ensaio físico aprovado não valida fila/lease/dispositivo/reimpressão. Ferramentas, evidência e próximos critérios em [printing/README.md](../printing/README.md). Não ativar automático antes de concluir etapa 5 e os riscos que afetam a ativação.


## Etapa 3A preparada: fila desligada

Migração 2026100802 aplicada pelo usuário no Supabase; verificação all_passed true, 11 checks verdadeiros, zero jobs/dispositivos/lojas ativadas. Quatro tabelas com RLS, credencial por dispositivo, largura por fila, unicidade inicial por loja/pedido/finalidade, job no commit do documento, lease/token/renovação/dispatch, cancelamento/revogação/corte e eventos imutáveis. Dezenove testes SQL locais passaram, inclusive rollback da gravação completa quando a fila falha, escopo e privilégios herdados. Um trigger limitado de cancelamento é definer privado; demais funções invoker. Após fronteira de dispatch, incerto não volta à fila. Reimpressão privada exige ator/motivo/chave. Não há credencial real, endpoint público, agente definitivo ou ativação. Procedimento e limites em [persistent-print-queue.md](../database/persistent-print-queue.md).


## Etapa 3B local: API, agente e painel

API POST de operações fixas com credencial revogável por dispositivo, validação de payload/transporte/deadlines/limites e texto renderizado do documento selado. Ações de cadastro/revogação/ativação/reimpressão exigem sessão verificada do dono. Painel /admin/impressao e histórico/motivo/ator nos pedidos; reimpressão conserva a chave da tentativa após falha. Agente PowerShell/.NET Windows com DPAPI/ACL, mutex, validação GDI em memória, journal CreateNew+Flush antes do dispatch e reconciliação que repete somente ACK. Pacote ZIP estático preparado, sem credenciais reais. Dez testes API com SQL real e 23 verificações Windows passaram; sete testes do painel, TypeScript/lint/build passaram. Conferência local permite só cadastro/conexão, mantendo RMENU_PRINT_ACTIVATION_READY=0. Não houve dispositivo real cadastrado pelo agente, spool adicional, ativação ou publicação. Usuário concluiu cadastro, importação DPAPI e health em 08/10/2026 (imagens de sucesso; nenhum pedido reservado/impresso). Concorrência remota, segurança antes de deploy e ensaio integrado fictício continuam pendentes. Procedimento/limites em [agent-integration.md](../printing/agent-integration.md).

## Pareamento confirmado e segurança do framework

Em 08/10/2026, usuário confirmou importação DPAPI e health autenticado, sem reserva/impressão. Dispositivo PC de teste, fila EPSON TM-T20X Receipt, rolo 80 mm conferidos no painel; automático desligado e ativação/reimpressão bloqueadas. Next/eslint-config-next atualizados localmente para 16.3.8 segundo comunicado oficial de 30/09/2026. 61 regressões passaram, TypeScript/lint direcionado/build aprovados; servidor local reiniciado e health do agente instalado confirmado novamente. Não é atualização do site publicado. Consulta somente de leitura para configuração pública/colunas administrativas/Storage preparada e validada em PostgreSQL local: [public-and-storage-review.md](../database/public-and-storage-review.md). Inventário remoto recebido: dispositivo ativo 1/jobs 0/lojas ativadas 0; leitura pública inclui admin_email e escritas de Storage não conferem dono. Etapa 3C preparada em public-and-storage-review.md: migração 2026100803 compatível para campos administrativos/logs/propriedade de imagens, com preflight/verificação; 2026100804 fecha leitura da configuração apenas após publicar leitores públicos limitados (bloqueada por padrão). Código local adaptado, 17 testes de SQL/projeção e 31 de checkout passaram, TypeScript/lint/build aprovados. Migração 03 aplicada e verificada pelo usuário em 08/10/2026: all_passed=true, dez checks verdadeiros, impressão desligada e contrato de leitura pública ainda pendente. API anônima confirmou leitura do cardápio de teste, duas imagens existentes acessíveis e logs negados (HTTP 401/42501, sem dados). Migração 04 segue bloqueada até publicar e conferir os leitores públicos limitados. Concorrência local com duas conexões PostgreSQL reais concluída em 08/10/2026: 14 checks passaram (reserva, checkout/numeração, dispatch, lease, incerteza, ACK, cancelamento, desativação/revogação e reimpressão), com bloqueio comprovado por pg_blocking_pids e servidor temporário encerrado. 52 regressões afetadas passaram. Não acessou Supabase nem enviou papel; concorrência remota/carga não foram comprovadas. Upload autenticado real de imagem fictícia concluído: leitura pública, escrita anônima negada, limpeza do arquivo e preservação das imagens existentes. Ensaio integrado isolado com PostgreSQL nativo, API HTTP real, AgentCore Windows, GDI, journal/ACK e reinício sem nova reserva concluído. Uma única comanda fictícia R$ 14,00 impressa, legível e cortada automaticamente, confirmada pelo usuário e foto. Marcador exclusivo preservado; fila real continua desligada. Limites/publicação/04 em printing/integrated-test.md.
