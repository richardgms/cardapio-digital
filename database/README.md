# Validação e migrações do banco

## Etapa 2A: isolamento da escrita

O inventário enviado em 07/10/2026 contém permissões de escrita anônima em produtos e horários, permissões irrestritas para usuários autenticados e regras antigas baseadas no primeiro e-mail de configuração. Políticas permissivas se combinam por OR: acrescentar uma política de dono sem remover a permissão aberta não resolve.

`migrations/2026100701_harden_store_writes.sql` remove as políticas de escrita antigas de nove tabelas, cria acesso por proprietário e barreiras restritivas de INSERT/UPDATE/DELETE. A leitura do catálogo permanece disponível para visitantes e usuários autenticados. Também impede vínculos com categoria/opções/horários de outra loja e remove privilégios de tabela inteira de clientes.

Esta etapa não altera registros, pedidos, numeração ou contagem de cupons. A migração precisa de acesso administrativo ao SQL Editor. Não rodar trechos isolados: o arquivo usa uma transação e timeouts. Falhas desfazem a migração inteira.

1. Executar o arquivo completo `migrations/2026100701_harden_store_writes.sql` no SQL Editor.
2. Se ocorrer erro, trazer a mensagem; não remover a verificação nem abrir políticas para contornar o erro. A verificação inicial exige que toda loja tenha um usuário Auth com o mesmo ID, conforme o código de cadastro existente.
3. Executar `verify-store-writes-readonly.sql` e trazer o campo `verification`. As listas de grants inesperados devem estar vazias; cada tabela deve conter a política de proprietário e três guards restritivos.
4. Validar no painel do lojista o salvamento de configuração, categorias, produto/opções, zona de entrega e horários. Conferir a leitura do cardápio sem login e o painel de superadmin, que usa ações autenticadas com `service_role`.

A migração é reaplicável. Não precisa de deploy para mudar as permissões no banco. As correções das rotas da etapa 1 só protegem a aplicação publicada quando forem incluídas no deploy.

Validação recebida em 07/10/2026: o usuário confirmou descrição de produto persistida após salvar/recarregar/reabrir, horários persistidos após alteração e recarga, e cardápio público aberto sem login em janela anônima. O print mostra produto de R$ 14 adicionado ao carrinho com subtotal e total de R$ 14. As verificações de RLS de produtos no Supabase real passaram nos 11 casos descritos abaixo. Configuração, categorias/opções, zonas e painel de superadmin ainda não têm confirmação manual nesta etapa. O caminho de sucesso validado não elimina as falhas já identificadas no tratamento de erros e nas gravações separadas.

## Limites desta etapa

- A configuração continua publicamente legível, inclusive `admin_email`, conforme a estrutura atual. A projeção pública será corrigida junto dos consumidores para preservar o funcionamento do cardápio durante a troca.
- Permissões específicas de colunas administrativas, armazenamento de imagens, escrita em pedidos e testes com sessões reais de duas lojas ainda precisam de revisão.
- O pedido antigo sem itens permanece no histórico até investigar sua origem.
- As quatro funções/triggers de pedidos e cupons foram recebidas e revisadas. A numeração bloqueia a loja, mas pode reutilizar número após exclusão; cupons precisam de reserva transacional e prevenção de uso duplicado. Detalhes em `review-order-foundation.md`.
- `orders` já está publicado no Realtime; isso não torna o checkout atual atômico. Não usar o evento de INSERT atual como gatilho de impressão.
- Os índices únicos de número por loja e idempotência já existem; preservar ambos.

## Tentativas de acesso entre lojas no Supabase real

Executar **o arquivo inteiro** `verify-store-isolation-rollback.sql` no SQL Editor administrativo. Não executar trechos isolados nem trocar `ROLLBACK` por `COMMIT`.

O teste escolhe duas lojas com proprietários Auth e cria dois produtos fictícios indisponíveis dentro da transação. Alterna para os papéis reais `authenticated` e `anon`, configura os UIDs da sessão de teste e tenta operações efetivas: dono altera seu produto; A não altera B; B não altera A; A não exclui, insere nem move produto para B; visitante lê, mas não insere, altera ou exclui. Não edita produtos existentes. O rollback final desfaz os dados de teste. Se detectar triggers/regras em produtos, interrompe antes de escrever para exigir revisão dos possíveis efeitos externos.

Trazer o campo `isolation_verification`: deve ter `all_passed: true`, `checks_count: 11` e todas as verificações verdadeiras. Qualquer falha gera erro; nesse caso executar `ROLLBACK;` e trazer a mensagem, sem modificar as políticas para contornar o problema. Este resultado valida RLS de produtos no banco real com papéis/UIDs simulados pelo administrador. Testes com duas sessões reais no aplicativo e tentativas nas demais tabelas permanecem verificações separadas.

O arquivo foi executado localmente contra a migração, com checagem de que os produtos e as políticas permanecem iguais depois do rollback. Resultado recebido do usuário em 07/10/2026 após execução no Supabase real: `all_passed: true`, `checks_count: 11`, todas as verificações verdadeiras. Comprovado o isolamento de produtos nas tentativas feitas, incluindo edição entre lojas nos dois sentidos, escrita permitida ao dono e bloqueio de escrita anônima. A execução usa papéis reais do banco com UIDs simulados na sessão administrativa; não representa duas sessões de login no navegador.

## Próxima revisão: funções de pedidos e cupons

Executar `inspect-order-logic-readonly.sql` no SQL Editor e trazer `order_logic`. A consulta lê somente metadados e os corpos das funções associadas aos triggers de pedidos, itens, cupons e usos de cupom; não chama as funções, não altera permissões e não retorna dados de clientes. O inventário anterior mostrou quatro triggers/funções, mas não incluiu sua implementação. Essa revisão é necessária para preservar a numeração e evitar contagem incorreta ou dupla de cupons na futura transação de checkout.

A consulta foi validada em PostgreSQL local com quatro funções e triggers fictícios e retornou as definições esperadas, sem alterar pedidos. A implementação real foi posteriormente recebida e revisada; referência em `reference/order-logic-20261007.json`. Os testes de `order-foundation.test.mjs` executam os corpos reais recebidos em tabelas reduzidas e reproduzem riscos existentes. O relatório está em `review-order-foundation.md`.

## Etapa 2B: privilégios de tabela inteira

1. Executar **o arquivo inteiro** `migrations/2026100702_revoke_unsafe_table_privileges.sql` no SQL Editor. Ele revoga somente TRUNCATE, TRIGGER e REFERENCES de PUBLIC/anon/authenticated nas 16 tabelas inventariadas. Não altera registros, CRUD, políticas de linha ou funções; preserva os grants diretos do servidor.
2. Executar `verify-order-foundation-readonly.sql` e trazer `foundation_verification`. Esperados: `tables_checked: 16` e listas `missing_tables`, `tables_without_rls` e `unexpected_client_table_privileges` vazias. A consulta também retorna apenas contagens de possíveis inconsistências de cupons, necessárias antes de criar unicidade e corrigir contadores.
3. Se ocorrer erro, trazer a mensagem; não rodar trechos isolados ou remover a validação. Se o executor deixar a transação aberta após falha, executar `ROLLBACK;`.

O relatório e as limitações estão em `review-order-foundation.md`. A migração foi aplicada pelo usuário no banco publicado. Resultado recebido: 16 tabelas, listas de ausentes/sem RLS/privilégios inesperados vazias; zero cupons e zero usos, com todas as contagens de inconsistências em zero. A validação local também cobre grants herdados e falha de schema. A proteção de cupons será feita junto com o checkout transacional; fortalecer somente o trigger agora permitiria falha de uso após o pedido com desconto já ter sido salvo.

## Etapa 2C: persistência atômica, ainda sem integração ao checkout

A migração `migrations/2026100703_atomic_order_persistence.sql` acrescenta complemento/hash/contagem de itens, integridade de cupons e função transacional restrita ao servidor. Pedido, itens e uso são uma única operação; falha desfaz tudo. **A aplicação atual ainda não chama a função.** A integração será feita depois de validar cálculo de catálogo e intenção da tentativa no servidor.

Executar o arquivo inteiro da migração, depois `verify-atomic-order-persistence-readonly.sql`, e trazer `persistence_verification`. O escopo, contrato, critérios esperados e limitações estão em `atomic-order-persistence.md`. A migração não reescreve números/pedidos antigos nem libera impressão. O preflight aborta em histórico inconsistente, sem limpar dados automaticamente.

## Teste local em PostgreSQL

Etapa 2C confirmada pelo usuário no Supabase: instalação e permissões esperadas. Preparada a etapa 2D para rejeitar alterações do catálogo entre a cotação e a gravação: `migrations/2026100704_guard_order_catalog.sql`, seguida de `verify-order-catalog-readonly.sql`. Detalhes, contrato e limitações em [order-catalog-guard.md](order-catalog-guard.md). Checkout e impressão continuam sem integração às funções novas.

Os testes executam a migração real em PostgreSQL em memória (PGlite), com esquema reduzido e lojas fictícias. Não carregam `.env`, não acessam Supabase e não alteram o banco remoto. Validam permissões SQL; não simulam todo o catálogo. A suite de base de pedidos executa as quatro funções/triggers reais recebidos sobre tabelas reduzidas e distingue diagnósticos de falhas existentes de verificações da migração. Não testa concorrência entre conexões reais.

Instalação isolada do runtime de teste, sem alterar dependências do aplicativo:

```powershell
npm install --prefix docs/sql-test-runtime --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8
npm run test:database
npm run test:checkout
```

O diretório `docs/sql-test-runtime` é local e ignorado pelo Git. A opção `--no-audit` evita a consulta que continua pendente de autorização; o download instala apenas a ferramenta de teste escolhida.

## Referências

Atualização: etapas 2C e 2D confirmadas no Supabase. A versão local da etapa 2E já conecta o checkout ao wrapper privado, calcula os preços no servidor, preserva tentativa/comprovante e usa snapshots na mensagem. Ver [validação do checkout](../plans/validacao-checkout.md). As descrições acima registram o escopo das migrações; o site publicado ainda não recebeu a integração.

- [PostgreSQL: combinação de políticas permissivas e restritivas](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase: RLS e grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PGlite: PostgreSQL local em memória](https://pglite.dev/docs/)


## Documentos e fila

Etapa 2F aplicada e verificada no Supabase: documentos/numeração, conteúdo imutável e grants mínimos. Ver [order-documents-and-numbers.md](order-documents-and-numbers.md).

Etapa 3A aplicada e verificada no Supabase pelo usuário (all_passed true, 11 checks verdadeiros, zero jobs/dispositivos/lojas ativadas): [persistent-print-queue.md](persistent-print-queue.md) traz a migração 2026100802 e seus preflight/verificação. Instala desligada, sem dispositivos/jobs/histórico. Dezenove testes SQL locais passaram. Integração API/agente/painel implementada localmente na etapa 3B; cadastro/importação/conexão confirmados pelo usuário, com health autenticado sem reserva ou impressão. Não ativar manualmente.

Pareamento/importação Windows e health confirmados pelo usuário em 08/10/2026. Revisão antes da ativação: [public-and-storage-review.md](public-and-storage-review.md), com `preflight-public-and-storage-readonly.sql` somente de leitura. Next atualizado localmente para 16.3.8; site publicado ainda usa a versão anterior. Migração 2026100803 aplicada e verificada pelo usuário em 08/10/2026 (dez checks verdadeiros; impressão desligada). Conferência somente de leitura pela API preservou cardápio/imagens de teste1 e negou logs a visitantes. Migração 2026100804 permanece bloqueada até publicar e conferir os consumidores públicos limitados.
