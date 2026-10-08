# Etapa 2D: consistência do catálogo antes de gravar

Atualização: a instalação da etapa 2D foi confirmada pelo usuário no Supabase. A integração da etapa 2E está concluída na versão local e aguarda validação manual; ver [validação do checkout](../plans/validacao-checkout.md). O texto abaixo registra o contrato e o escopo original da preparação 2D.

A etapa 2C foi aplicada no Supabase e verificada pelo usuário: RPC privado/invoker, search_path vazio, três colunas e cinco constraints validadas, permissões esperadas e triggers ativos. Isso confirma a instalação; o checkout publicado ainda grava separadamente e não usa o RPC.

## Risco e proteção preparada

Só buscar preços no servidor não basta: o lojista pode mudar produto, promoção, disponibilidade, grupo, opção, regra de tamanho ou horário entre a leitura e a gravação. A etapa 2D instala três funções privadas. A projeção `rmenu_order_catalog_state` contém os produtos solicitados e regras de cálculo, configuração operacional e horários, com arrays ordenados por ID. Não contém admin_email, WhatsApp ou endereço do lojista. Isso não remove esses campos das consultas públicas antigas, que continuam na revisão pendente.

`rmenu_submit_order` bloqueia a loja, produtos envolvidos, grupos, opções, regras, horários e períodos. Compara a projeção atual àquela usada pelo servidor para calcular os snapshots. Mudanças relevantes rejeitam a tentativa; nenhum pedido é criado com a cotação obsoleta. Se estiver consistente e a loja aberta no instante da submissão, chama `rmenu_create_order_atomic` na mesma transação. O helper de horário recebe o instante explicitamente; o wrapper usa clock_timestamp, fuso America/Sao_Paulo, início inclusivo e fechamento exclusivo.

A ordem dos bloqueios é fixa. FOR UPDATE nos registros pais também conflita com o bloqueio de chave exigido por inserções/vínculos de filhos. Isso permite comparar novamente o catálogo mantendo a proteção até o commit. Deadlock ou timeout pode abortar a transação; a aplicação deverá tratar a falha e conservar a chave da tentativa. Base técnica: [bloqueios do PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html) e [isolamento Read Committed](https://www.postgresql.org/docs/current/transaction-iso.html). Ainda não há teste com duas conexões reais.

Um replay passa primeiro pela verificação da etapa 2C: hash igual, contagem de itens completa e pedido não cancelado. Depois de um commit, alterar o catálogo, fechar a loja ou expirar o cupom não deve transformar uma repetição em um segundo pedido.

## Contrato para integrar o checkout

1. Normalizar IDs, escolhas, quantidade e dados do cliente; calcular SHA-256 da intenção no servidor. Não aceitar o hash do navegador como autoridade.
2. Consultar `rmenu_order_catalog_state(store_id, product_ids)` com os IDs do produto principal e dos dois sabores, quando houver. Guardar a resposta inteira sem editar ou filtrar.
3. Calcular os itens a partir dessa projeção. `src/lib/order-pricing.ts` foi preparado para promoções, centavos, substituições, adicionais, obrigatoriedade, limites, regras por tamanho e maior preço configurado no meio a meio. Opções incompatíveis ou ambíguas entre sabores são rejeitadas. `checkout-intent.ts` descarta preços e nomes de itens fornecidos pelo cliente.
4. Chamar `rmenu_submit_order(payload, hash, projection)` somente no servidor com service_role. O payload contém snapshots calculados; essa função continua confiando no servidor para o cálculo e não recalcula os preços das opções em SQL. A função base permanece privada e disponível para service_role; o checkout deverá usar o wrapper para pedidos novos.
5. Construir mensagem/comanda a partir do pedido efetivamente salvo. Persistir a tentativa para timeout/reload, bloquear cliques simultâneos, enviar complemento e permitir recuperação quando o navegador não abre o WhatsApp. Esses pontos ainda precisam de integração no carrinho/ação.

Nenhuma ação pública chama as funções nesta etapa. Os módulos novos de preço/intenção ainda não foram conectados. A correção de origem da regra de tamanho no helper compartilhado já exige source_group_id correspondente, além de size_option_id. Não houve publicação, pedido real ou impressão.

O banco atual exige close_time > open_time. A migração não altera essa constraint nem passa a permitir cadastrar períodos que atravessam meia-noite. O helper determinístico cobre essa condição em testes de JSON para não perder a virada caso o cadastro seja ampliado futuramente. Antes da integração, alinhar a indicação de aberto do cardápio ao fechamento exclusivo usado pelo servidor.

## Validação local

105 verificações de banco passaram (incluindo diagnósticos de problemas legados, que não significam correção desses problemas), 13 de segurança e 13 de preço/intenção. Lint dos arquivos desta etapa, TypeScript e build de produção passaram. O build precisou executar fora da restrição de filesystem que impede o SWC de resolver o caminho do projeto no Windows; não foi publicação. O teste de banco executa as migrações reais e quatro funções/triggers originais sobre schema reduzido em PGlite; não acessa Supabase, WhatsApp ou impressora. Testa rejeição de cotação alterada, ausência de escritas após rejeição, grupo/opção/regra/período inseridos após leitura, loja fechada, replay após mudança, produto de outra loja, privacidade da projeção, permissões e reaplicação. Os testes de cálculo cobrem preços adulterados, valores inválidos, opções obrigatórias/indisponíveis/duplicadas, limites, promoções, meio a meio e identidade da tentativa.

## Aplicar e conferir

1. No SQL Editor, executar o arquivo inteiro `migrations/2026100704_guard_order_catalog.sql`.
2. Executar `verify-order-catalog-readonly.sql` e trazer `catalog_verification`.
3. Esperados: missing_functions vazio; três funções com exists true, security_definer false, search_path vazio, anon_execute/authenticated_execute false e service_role_execute true.
4. Se ocorrer erro, enviar a mensagem e executar ROLLBACK se a transação estiver aberta. Não remover o preflight nem alterar permissões para liberar anon/authenticated.

A migração só cria/substitui funções e suas permissões. Não cria tabelas, modifica registros existentes ou ativa impressão. A integração do checkout será validada depois da instalação desta proteção.
