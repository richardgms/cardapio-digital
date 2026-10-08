# Revisão da base de pedidos e cupons — 07/10/2026

## Evidência e alcance

O usuário trouxe `order_logic` do Supabase: quatro funções e quatro triggers, todos `SECURITY INVOKER`, com proprietário `postgres`. As definições recebidas estão em `reference/order-logic-20261007.json` para comparação e testes locais; esse arquivo é uma referência, não uma migração.

Os testes usam exatamente os corpos das funções recebidas, com esquema reduzido das tabelas e dados fictícios em PostgreSQL local. Não provam concorrência entre conexões reais: PGlite usa uma única instância neste teste. Nenhum pedido ou cupom remoto foi criado, alterado ou excluído pelo agente.

## Achados e mitigação

| Achado | Consequência | Correção proposta |
| --- | --- | --- |
| O inventário mantém TRUNCATE, TRIGGER e REFERENCES para clientes nas tabelas fora da etapa 2A | Operações de tabela inteira podem escapar das regras de linha; TRIGGER permite criar triggers quando os demais requisitos de acesso também são satisfeitos | Aplicar `2026100702_revoke_unsafe_table_privileges.sql` nas 16 tabelas inventariadas. Preservar CRUD, políticas, dados e privilégios diretos de service_role |
| `set_order_number` bloqueia a configuração da loja antes de consultar MAX | Há proteção por loja no fluxo atual sob READ COMMITTED; não é um MAX sem bloqueio | Preservar essa proteção até migrar para contador persistente por loja e testar duas conexões reais. Manter índice único e ordem consistente dos locks |
| A numeração usa MAX dos pedidos existentes | Excluir o último pedido permite reutilizar seu número; reproduzido localmente | Contador persistente, iniciado sem alterar os números existentes, sem decremento em exclusão/cancelamento. Preferir preservar histórico |
| `increment_coupon_usage` só faz `usage_count + 1` | Contador aumenta atomicamente na linha, mas não valida limite, elegibilidade nem vínculo entre lojas | Validar e reservar cupom com bloqueio na mesma transação de pedido/itens. Não incrementar novamente no aplicativo |
| `coupon_usages` só tem unicidade no ID | Mesmo pedido aceita dois registros de uso e conta duas vezes; limite 1 foi ultrapassado no teste local | Unicidade por pedido e idempotência do checkout; primeiro conferir duplicatas reais. Não remover registros históricos automaticamente |
| Contador permite NULL | NULL + 1 continua NULL; reproduzido localmente | Conferir dados, definir contador não nulo/não negativo e reconciliar com regra histórica explícita |
| As FKs de uso ligam separadamente pedido e cupom | Um serviço privilegiado pode ligar pedido de A a cupom de B; reproduzido localmente. Isso não demonstra acesso de um cliente à outra loja | Verificar mesma loja na função transacional e proteção de integridade no banco |
| Deletar uso/pedido não decrementa o contador | Contagem pode divergir dos usos ainda presentes; reproduzido localmente | Definir consumo/reserva/liberação e histórico. Não zerar ou recalcular contadores apenas a partir das linhas atuais sem investigar |
| `createOrder` grava pedido, itens e uso em operações separadas | Pedido pode ficar visível sem itens; retorno idempotente não garante pedido completo; falha de uso pode ser ignorada | Uma única função de banco chamada pelo servidor; qualquer falha desfaz pedido, itens e uso. Replay confere conteúdo e estado completo |
| O checkout confia no desconto e valores dos itens recebidos | Alteração do payload pode criar desconto sem elegibilidade; checagem da soma não prova preço correto | Calcular catálogo, opções, promoção, frete e cupom no servidor; rejeitar vínculos/preços desatualizados; persistir snapshot e complemento |
| `validateCoupon` usa cliente com sessão, mas as políticas recebidas só permitem ler cupons do dono | Visitante não encontra cupom pelo caminho atual; reproduzida leitura vazia sob essa política | Prévia de cupom por ação de servidor com projeção mínima; revalidar tudo no checkout. Não abrir a tabela inteira publicamente |
| Duas funções de cupom não fixam search_path | Ambiente de resolução fica implícito | Padronizar search_path vazio e referências qualificadas na revisão coordenada dos triggers |
| Há EXECUTE para anon/authenticated nas quatro funções de trigger | Isso isoladamente não permite uma chamada normal dessas funções: PostgreSQL exige contexto de trigger | Teste local confirmou rejeição 0A000 nas quatro chamadas normais. Não relatar como RPC pública utilizável nem promover para SECURITY DEFINER |

A documentação do PostgreSQL confirma que [TRUNCATE e REFERENCES não estão sujeitos a RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), descreve os [privilégios de TRIGGER](https://www.postgresql.org/docs/current/sql-grant.html) e a duração dos [bloqueios por linha](https://www.postgresql.org/docs/current/explicit-locking.html). A análise de numeração considera funções VOLATILE e o isolamento padrão READ COMMITTED; [funções VOLATILE obtêm snapshots nas consultas executadas](https://www.postgresql.org/docs/current/xfunc-volatility.html). A criação de pedidos via ação usa service_role; não pressupor que a mesma consulta retorna todas as linhas sob outra política/isolamento.

## Parte pronta para aplicar

`2026100702_revoke_unsafe_table_privileges.sql` revoga somente TRUNCATE, TRIGGER e REFERENCES de PUBLIC, anon e authenticated nas 16 tabelas conhecidas. Confere presença, tipo e RLS antes de mudar grants e aborta se algum privilégio perigoso continuar herdado. Usa uma transação, timeouts e é reaplicável. A migração não altera os triggers nem tenta corrigir cupons parcialmente, pois o checkout atual ignoraria erros depois de já salvar pedido com desconto.

Depois, executar `verify-order-foundation-readonly.sql`. Esperados: 16 tabelas, listas de ausentes/sem RLS/privilégios inesperados vazias. O campo `coupon_data` apenas conta inconsistências possíveis; divergência de contador é um indício para investigar, não autorização para reescrever histórico.

Validação local: oito verificações da migração passaram, incluindo bloqueio de TRUNCATE com/sem CASCADE para os dois papéis nas 16 tabelas, preservação de CRUD/políticas/funções/dados, criação pelo servidor, reaplicação e rollback após falha. Seis diagnósticos reproduziram riscos da lógica atual e uma verificação confirmou que funções de trigger não são chamadas como SQL normal. Os diagnósticos passando confirmam a reprodução dos riscos, não sua correção. Migração aplicada pelo usuário no Supabase: a verificação recebida confirmou as 16 tabelas com RLS, sem privilégios indevidos, sem tabelas ausentes. Existem zero cupons e zero usos; todas as contagens de inconsistências vieram em zero.
