# Etapa 2C: persistência atômica de pedidos

Atualização: etapas 2C e 2D confirmadas no Supabase. A nova versão local da etapa 2E usa a persistência por meio de rmenu_submit_order; o site publicado continua na versão anterior. Ver [validação do checkout](../plans/validacao-checkout.md). Os limites de integridade/versionamento descritos aqui continuam relevantes antes da impressão.

## Escopo

`2026100703_atomic_order_persistence.sql` prepara o banco para a próxima integração. Instala uma função de persistência acessível somente ao servidor e regras de integridade de cupons. **A aplicação publicada ainda não chama a função.** O checkout existente continua separado até implementar cálculo/validação do catálogo e conectar a ação de servidor à função. Ainda não há fila nem impressão habilitada.

O usuário confirmou a etapa 2B no Supabase: 16 tabelas com RLS, nenhuma tabela ausente e nenhum privilégio de tabela inteira indevido nos clientes; zero cupons e usos, com todas as contagens de inconsistências em zero.

Etapa 2C também confirmada pelo usuário: persistence_verification apresentou as três colunas, cinco constraints validadas, RPC invoker com search_path vazio, execução bloqueada a anon/authenticated e autorizada a service_role, contador não nulo e ambos os triggers esperados ativos. Próxima preparação em [order-catalog-guard.md](order-catalog-guard.md), antes da integração pública.

## Alterações no banco

- `orders.address_complement`: complemento, nulo nos pedidos antigos.
- `orders.request_hash`: SHA-256 da intenção normalizada da tentativa, nulo nos pedidos antigos.
- `orders.expected_item_count`: quantidade de linhas esperadas, nula nos pedidos antigos.
- Unicidade de uso de cupom por pedido, contador não nulo/não negativo e limite não negativo.
- Trigger de integridade para impedir ligação de cupom e pedido de lojas diferentes, inclusive fora da nova função.
- Contagem permanece no trigger `increment_coupon_usage`; a função não faz um segundo incremento. Os dois triggers de cupom passam a fixar search_path vazio e continuam SECURITY INVOKER.
- Nenhum número de pedido é reescrito. O trigger e o índice de numeração existentes são preservados. A reutilização após exclusão ainda precisa da futura mudança para contador persistente.

A migração usa uma transação e timeouts. O preflight interrompe se encontrar histórico duplicado, ligação entre lojas, contador inválido ou divergência de contador; não remove usos nem recalcula histórico. É reaplicável.

## Contrato do servidor

`public.rmenu_create_order_atomic(p_payload jsonb, p_request_hash text)` é SECURITY INVOKER, com search_path vazio, EXECUTE somente para service_role. Visitantes e lojistas não podem chamá-la diretamente. A chave administrativa permanece no servidor.

`p_payload` contém loja, chave UUID da tentativa, dados do cliente/entrega/pagamento, total esperado, código de cupom opcional e `items`. Os itens contêm os snapshots já calculados e validados pelo servidor: produto, nome, quantidade, preço unitário, total, opções selecionadas, observações e meio a meio. Os dois sabores de meio a meio precisam incluir `product_id` junto do snapshot. Na integração, conservar os nomes atuais das opções (`group`, `option`, `price`) e acrescentar IDs para validar origem e regras.

`p_request_hash` deve ser calculado pelo servidor sobre a **intenção normalizada** do cliente (IDs, escolhas, quantidades e dados do pedido). Não confiar em hash fornecido pelo navegador. Não incluir apenas dados de catálogo que possam mudar durante uma repetição. A função confia nesse contrato do chamador privilegiado: ela não recalcula o hash nem deriva preços de opções/meio a meio a partir do catálogo.

É obrigatório implementar cálculo do catálogo, disponibilidade, promoções, regras de opções/tamanho/substituição/meio a meio e funcionamento da loja antes de ativar esse contrato na ação pública. O mínimo, meios de pagamento, mesa, zona/frete, elegibilidade/desconto/limite de cupom e aritmética dos snapshots já são conferidos no banco. O servidor também deve gerar WhatsApp/painel/comanda a partir do snapshot efetivamente registrado.

## Comportamento

A função bloqueia a loja antes de consultar a tentativa, preservando o bloqueio de numeração existente. Uma tentativa existente exige mesmo hash, quantidade de itens completa e estado não cancelado; pedidos legados sem hash não são tratados como replay seguro. O replay retorna o pedido original e não depende de o cupom ainda estar disponível. A chave de uma nova tentativa deve mudar quando o conteúdo muda e persistir durante timeout/recarregamento.

Para pedido novo, a função calcula a soma dos snapshots, resolve frete/nome da zona no banco, revalida cupom e o bloqueia antes de testar seu limite. Primeira compra considera pedido registrado anterior não cancelado do mesmo telefone normalizado na loja, inclusive pending; isso acompanha o fluxo sem aceite obrigatório no painel. Falha ao gravar qualquer item ou uso desfaz tudo. Repetição não acrescenta itens nem conta outro uso. A serialização por loja também protege primeira compra dentro desse fluxo.

O pedido continua `pending` e o sinal de navegação `pending_handoff`: registro não confirma envio de WhatsApp, aceite, pagamento ou impressão. Complemento e snapshots ficam disponíveis para os futuros consumidores.

O uso de cupom é consumido no registro bem-sucedido. Cancelamento posterior não libera automaticamente esse uso nesta etapa. A política de liberação e a preservação do histórico precisam de implementação coordenada; não excluir usos para manipular o contador. A aritmética e a reserva da função não protegem chamadas legadas que continuam fazendo escritas separadas.

## Validação

As 22 verificações desta etapa passaram localmente; lint do arquivo de testes também passou. As verificações das etapas anteriores também passaram na execução combinada. Testes locais executam o SQL real recebido e a migração em PostgreSQL em memória, com tabelas reduzidas e dados fictícios. Cobrem RPC privado/invoker, complemento, zona de outra loja, gravação completa, falha no segundo item e no uso, replay sem duplicação, conflito de hash, pedido cancelado/incompleto/legado, limite e regras de cupom, percentual/teto/frete grátis, integridade fora do RPC, números não finitos, meio a meio, mesa/pagamento, preservação de legado, preflight e rollback de schema. Não são testes com duas conexões reais nem com o carrinho publicado.

Pedidos existentes ainda podem ser alterados pelo dono conforme permissões atuais. Contagem de itens detecta falta de linhas, mas não é proteção completa contra edição de snapshot. Proteger colunas e introduzir versão do pedido/reimpressão faz parte das próximas etapas. Não usar os eventos atuais de orders como gatilho de impressão.

## Aplicação e verificação

1. Executar o arquivo inteiro `migrations/2026100703_atomic_order_persistence.sql` no SQL Editor.
2. Executar `verify-atomic-order-persistence-readonly.sql` e trazer `persistence_verification`.
3. Esperados: três colunas, cinco constraints validadas e nenhuma ausente; RPC existente, `rpc_security_definer: false`, search_path vazio, EXECUTE false para anon/authenticated e true para service_role; contador não nulo, trigger de mesma loja e trigger original de numeração ativos.
4. Se ocorrer erro, trazer a mensagem. Não remover o preflight; executar `ROLLBACK;` se a transação tiver ficado aberta após erro.

A verificação confirma instalação e permissões, não a integração do checkout nem concorrência em produção. Depois da confirmação, implementar e validar o servidor/carrinho antes de testar pedidos reais e impressão.
