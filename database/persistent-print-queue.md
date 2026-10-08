# Etapa 3A — fila persistente preparada, desligada

## Aplicação remota

A etapa 2F foi confirmada no Supabase. Esta etapa foi **aplicada e verificada** no Supabase pelo usuário: `all_passed=true`, 11 checks verdadeiros, zero jobs/dispositivos/lojas ativadas, impressão automática desligada. Não há conexão administrativa PostgreSQL disponível ao agente; a execução usa o SQL Editor do usuário.

1. Executar inteiro `preflight-print-queue-readonly.sql`. Esperado: documentos e trigger instalados, RLS verdadeiro, zero documentos ausentes/divergentes. `queue_already_installed=false` é normal na primeira execução. Se alguma condição divergir, interromper e trazer o resultado.
2. Executar inteiro `migrations/2026100802_persistent_print_queue.sql`. A transação instala quatro tabelas, funções, políticas e triggers. Na primeira instalação todas as lojas ficam desligadas; não cria dispositivos nem jobs, não percorre pedidos históricos. Lock timeout 5s/statement timeout 30s: se houver timeout/erro, confirmar rollback e trazer a mensagem; não executar blocos isolados.
3. Executar `verify-print-queue-readonly.sql`. Esperado na instalação: `all_passed=true`, todos os checks verdadeiros, `enabled_stores=0`, `jobs=0`, `devices=0`, `automatic_printing_activated=false`. Retorna somente metadados/contagens, sem dados de clientes, hash ou lease token.

Não chamar RPCs de cadastro/ativação manualmente no banco real nesta etapa. Não são necessárias para instalar ou verificar. Migração reaplicada preserva estados/corte/dispositivos/jobs/eventos existentes; a verificação de instalação desligada sinaliza ativações posteriores.

## Contrato e garantias

`print_settings`: ativação por loja, corte monotônico; cada reativação usa o instante atual e cancela reservas anteriores ao desativar. Cadastro de outro PC e replays do checkout não percorrem histórico. Novas lojas começam sem configuração e sem impressão; cadastrar dispositivo cria configuração desligada.

`print_devices`: vinculado à loja, fila Windows e papel 58/80 mm por dispositivo; credential_hash SHA-256 de segredo aleatório de 256 bits que será gerado no servidor. Não há segredo real nem dispositivo remoto criado nesta entrega. Configuração e credencial imutáveis; mudanças exigem revogação e novo cadastro. O PC receberá somente sua credencial, nunca service_role. Clientes Supabase não leem hash nem lease token.

`print_jobs`: impressão inicial única por **loja/pedido/finalidade**, independentemente do PC. Job nasce no mesmo commit do documento completo pelo trigger AFTER INSERT do documento; falha da fila reverte pedido, itens, documento e numeração. Só novo fluxo, documento versão 1 e pedido não cancelado posterior ao corte. Conteúdo não vem do catálogo mutável; sempre usa documento selado.

Reservas duram 60 segundos; claim atômico, token novo e dispositivo associado. Renovação só antes do vencimento e antes do envio. `begin_dispatch` revalida credencial/revogação, ativação, versão e cancelamento, bloqueia pedido/job e autoriza uma transição somente. Repetição retorna false; perda da resposta não autoriza reenviar. Claim/gestão serializam pela loja, priorizando segurança e ordem consistente de locks; `SKIP LOCKED` no job. Cancelamento bloqueia pedido e depois job, sem precisar bloquear loja. Concorrência local entre duas conexões PostgreSQL reais validada em 08/10/2026: 14 checks passaram, com sobreposição comprovada por pg_blocking_pids, dados fictícios e migrações reais. O ensaio não acessa o Supabase e não comprova concorrência no servidor remoto nem carga de produção. Procedimento em tests/postgres-runtime/README.md.

Estados: `pending → leased → dispatching → spooler_submitted`. Lease vencido em `leased` pode voltar a `pending`; após `dispatching` passa a `uncertain`, nunca retorna automaticamente à fila. Erro de renderização anterior ao dispatch pode ficar `failed`. ACK de spooler é idempotente; evidência tardia do mesmo token pode mudar `uncertain` para `spooler_submitted`. Nenhum estado significa confirmação física do papel.

Cancelamento/desativação invalidam pending/leased; dispatch iniciado fica incerto. Revogação libera apenas lease anterior ao envio e invalida a credencial; dispatch iniciado fica incerto. Não é possível garantir que cancelamento/revogação posterior à autorização de envio impeça um spool já em andamento. Essa fronteira exige journal local durável e comunicação clara ao operador, sem promessa de exactly once.

`print_events`: histórico append-only automático, sem UPDATE/DELETE, inclui transições, cadastro/revogação, ativação/desativação e cancelamento. Reimpressão é outro job, exige dono, motivo 3–240 caracteres e chave UUID; replay com a mesma chave não cria outra via e conteúdo divergente é rejeitado. RPC existe para implementação posterior do painel; não há botão/API pública de reimpressão nesta etapa.

## Acesso e validação

14 funções privadas: service_role execute, search_path vazio; somente o trigger limitado de cancelamento é SECURITY DEFINER, pois UPDATE(status) do dono não tem escrita na fila. Esse trigger deriva pedido/loja de OLD/NEW e não aceita argumentos; RPC direta é revogada. As demais funções são invoker. RLS em quatro tabelas; dono lê somente seu escopo, visitantes bloqueados, escrita de cliente bloqueada mesmo após grants/políticas permissivas posteriores. Postflight aborta por privilégios herdados indevidos, desfazendo DDL e dados.

`npm run test:print-queue`: 19 testes executam SQL real em PGlite com papéis/RLS e dados fictícios. Cobrem instalação/reaplicação, corte/histórico/replay, commit/rollback após falha, dois dispositivos em sequência, lease/renovação/token, dispatch único, ACK, incerteza, cancelamento via dono, desativação, revogação, reimpressão/auditoria, escopo e grants herdados. A suíte de banco combinada passou com 143 testes; sete testes de reconciliação do painel também passaram. Schema reduzido, sem rede/impressão; não comprova concorrência PostgreSQL entre duas conexões nem compatibilidade completa com o banco remoto.

## Ainda necessário antes de ativar

Aplicação/verificação remota concluída. API/cadastro/agente Windows/painel implementados localmente na etapa 3B (ver printing/agent-integration.md), ainda sem pareamento real, ativação ou deploy. Continuam teste de duas conexões, cadastro/importação/conexão no Windows, ensaio ponta a ponta fictício e exercício integrado de falhas/reinício. O ensaio físico já aprovado verifica driver/layout/corte/via, não o agente definitivo.

Também permanecem a atualização de segurança do Next.js e as revisões de projeções públicas/colunas administrativas/Storage que afetam o módulo. Nenhum deploy foi realizado. Antes de publicação, recomenda-se instalar a CLI oficial com `npm i -g vercel` para consultar ambiente, logs e controlar o deploy; ela não está instalada nesta máquina.
