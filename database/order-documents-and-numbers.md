# Etapa 2F: documentos imutáveis e numeração persistente

Implementada localmente em 07/10/2026 (arquivo versionado em UTC como 2026100801). **Instalação remota confirmada pelo resultado enviado pelo usuário:** preflight válido, `document_verification.all_passed: true`, 12 checks verdadeiros, 6 triggers válidos, 7 funções invoker/search_path vazio e exclusivas de service_role, `unexpected_client_writes: []` e as quatro contagens de `data_checks` iguais a zero. O legado sem itens permanece preservado. Não cria fila, dispositivos ou trabalhos; não envia dados ao spooler. Checkout e painel publicados continuam na versão anterior.

## O que resolve

- Contador privado por loja, iniciado no maior número existente sob bloqueio das tabelas. Toda inserção, incluindo o checkout publicado legado, usa o mesmo trigger/contador. Exclusão, cancelamento e reaplicação não diminuem o contador; rollback devolve a reserva de número da transação abortada. Números antigos são preservados. Não recupera números excluídos antes da instalação, cujo histórico não existe mais. Overflow do inteiro aborta sem gerar número repetido.
- `orders.document_version=1`; o conteúdo é imutável. Ainda não há API de correção/revisão: alterações de conteúdo são rejeitadas inclusive no servidor. Uma futura revisão precisará migração e auditoria próprias, sem relaxar estes guards.
- `order_documents`: envelope privado com versão de schema/documento, nome da loja e cópia completa de cabeçalho/itens. Exclui chave da tentativa, hash e estados mutáveis. A versão 1 representa o documento, não o status operacional. Cancelamento é terminal, preserva o documento e não libera cupom automaticamente.
- Constraint trigger adiado sela pedidos do novo fluxo no fechamento da transação, após itens/cupom. Rejeita contagem, soma ou aritmética divergentes e desfaz toda a transação. Pedido histórico do novo fluxo íntegro ganha documento, **sem elegibilidade automática**. Legados sem hash continuam sem documento, inclusive o pedido incompleto conhecido.
- Cliente autenticado mantém leitura da própria loja e alteração de `status`. Perde criação/exclusão direta e edição de snapshots/itens. Grants de coluna são removidos junto dos de tabela. RLS restritiva reforça isolamento, inclusive se surgir política permissiva ampla. A ação pública de WhatsApp continua usando servidor e vínculo da tentativa.
- Exclusão de produto/zona via `ON DELETE SET NULL` permanece possível. Links vivos ficam nulos; o documento conserva IDs, nomes e valores originais. Documentos bloqueiam exclusão de pedidos selados e de suas lojas. Exclusão administrativa de loja com histórico precisará de política explícita de retenção; não contornar o bloqueio com cascade.

## Executar no SQL Editor

1. Executar inteiro `preflight-order-documents-readonly.sql`. Trazer `document_preflight`. Esperados: RPCs/trigger/unicidade verdadeiros; contagens de números inválidos/duplicados e `atomic_incomplete_or_divergent` iguais a zero. `legacy_without_items_preserved` é diagnóstico; não excluir o legado para zerá-lo.
2. Se as verificações acima estiverem corretas, executar inteiro `migrations/2026100801_order_documents_and_numbers.sql`. É transacional e reaplicável. Não executar pedaços. Pode abortar por lock timeout se houver checkout concorrente; após rollback, reaplicar o arquivo inteiro em momento mais tranquilo. Não remover locks/preflight.
3. Executar inteiro `verify-order-documents-readonly.sql`. Trazer `document_verification`, esperado `all_passed: true`, `unexpected_client_writes: []`, zero em `data_checks` e `automatic_printing_activated: false`.
4. Em caso de erro, executar `ROLLBACK;` se houver transação aberta e trazer apenas a mensagem. Não enviar credenciais nem dados de clientes.

As consultas retornam contagens/metadados. Não substituem teste com duas conexões PostgreSQL reais ou teste funcional no Supabase. O agente não dispõe nesta sessão de ferramenta SQL administrativa nem conexão PostgreSQL autorizada; as ferramentas encontradas não oferecem esse acesso. Não inferir acesso DDL a partir da chave REST.

## Contrato do recibo

`src/lib/order-receipt.ts` recebe exclusivamente o envelope JSON de `order_documents`, versão 1. Confere IDs/loja, completude, valores em centavos, dados obrigatórios, sabores e versão. Formata 32 ou 42 colunas de texto, valores alinhados, fuso America/Sao_Paulo, acentos, complemento/bairro, opções, observações, desconto/cupom/frete/total e troco. Remove controles e bidi invisível dos campos. Essas colunas são layout textual; largura física, fonte e área imprimível precisam ser medidos no driver.

O documento não declara pagamento realizado. O recibo informa o meio escolhido e explicita que isso não confirma pagamento. A função não consulta banco, não reserva fila e não imprime. Antes de usar qualquer documento, o futuro servidor da fila terá de conferir status atual e versão novamente na reserva e antes da autorização de envio.

## Arquitetura local recomendada e evidência da Epson

Inspeção somente de leitura do Windows em 07/10/2026: fila `EPSON TM-T20X Receipt`, driver `EPSON TM-T(203dpi) Receipt6`, porta `TMUSB001`, descrição `USB`, status retornado `0`. Isso confirma a fila/driver/porta; não confirma saída de papel. `Get-PrintConfiguration` e `Win32_PrinterConfiguration` não forneceram largura, comprimento ou nome do formulário.

Recomendação: agente Windows com transporte pela fila/driver instalado (GDI/PrintDocument), evitando depender do navegador aberto. Um teste manual isolado pode usar Windows PowerShell/.NET Framework, antes de instalar um agente persistente. O agente definitivo deve usar conexões HTTPS de saída, credencial revogável de dispositivo com escopo de loja/fila e nenhum service_role no PC. Não precisa serviço externo adicional nem porta HTTP local pública.

`window.print()` exige interação/navegador e dificulta reconciliação. ESC/POS RAW dá controle de corte, mas exige validar codepage/comandos e contornar o driver; com o driver Epson já instalado, começar pela fila nativa permite renderizar caracteres como texto gráfico. O corte será configurado/testado no driver, sem enviar comandos RAW misturados a GDI. Base: [Microsoft PrintDocument](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.printdocument?view=windowsdesktop-10.0) e [WritePrinter](https://learn.microsoft.com/en-us/windows/win32/printdocs/writeprinter).

Usuário confirmou rolo de **80 mm nesta Epson de teste** em 07/10/2026. Isso não determina a largura nos restaurantes. Largura do papel (58/80 mm), fila/driver, área imprimível, fonte e política de corte devem ser configurados e calibrados por fila/dispositivo, não globalmente por loja ou pelo documento. O mesmo documento imutável pode ter layouts diferentes conforme a impressora, mantendo uma única tarefa inicial compartilhada entre os dispositivos da loja. Configuração desconhecida bloqueia envio e pede configuração/teste; não presumir 80 mm, truncar conteúdo ou imprimir para detectar largura.

Ainda falta validar área imprimível e corte no driver. O ensaio será uma única via fictícia, identificada como teste, sem banco e sem pedidos reais. A confirmação do papel exige o usuário.

## Próximas etapas e limites

Fila persistente e corte por **loja**, com unicidade inicial `(store_id,order_id,purpose)`, independente do dispositivo. Atualizar as descrições antigas que citavam unicidade/corte por dispositivo. Fila e elegibilidade devem nascer na mesma transação do documento, só para novos pedidos posteriores à ativação; backfill de documentos não cria fila. Dois PCs disputam a mesma tarefa.

Reserva/renovação exclusiva com lease e token; antes do spooler, marcar autorização de envio e registrar intenção local durável. Após essa fronteira, timeout/reinício vira `resultado incerto`, sem repetição automática. Somente a operação explícita de reimpressão, com usuário/motivo/versão/histórico, poderá gerar nova via. Entrega ao spooler não comprova papel. Não há promessa de exactly once físico.

Painel ainda precisa reconciliação automática, proteção contra respostas antigas, estados de impressão e reimpressão auditada. Projeção pública/configurações administrativas/Storage e falhas de horários seguem pendentes; tratar os riscos que interferem na ativação. Não há teste com duas conexões remotas, fila, agente instalado ou teste físico.

Next.js ainda está em 16.0.7. Consulta oficial confirmou release de segurança 16.3.8 em 30/09/2026: [release oficial](https://nextjs.org/blog/september-2026-security-release). Atualização coordenada de Next/React/ESLint/lockfile e regressões deve preceder publicação/ativação; não alterada nesta etapa. `npm audit` continua sem autorização após a recusa anterior, e não foi repetido. Vercel CLI ausente; quando preparar deploy, recomenda-se instalar `npm i -g vercel` para acesso a env/deploy/logs. Nenhum deploy é necessário para instalar esta migração.

## Validação local

Executar `npm run test:printing` (SQL real em PGlite e contrato textual); `npm run test:database` também inclui a etapa 2F. Testes não carregam `.env`, não acessam Supabase nem imprimem. Cobrem rollback no commit, isolamento, grants de coluna, reaplicação, numeração após exclusão, documentos completos/imutáveis, FK de catálogo e contrato do recibo gerado pelo SQL. A suíte anterior conserva diagnósticos legados: passar não significa sanar todos esses riscos.

Fundamento do selo adiado: [PostgreSQL CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html). PGlite usa uma conexão; validações simultâneas remotas ainda são obrigatórias antes de ativar fila.
