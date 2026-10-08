# Impressão local e ensaio controlado

Revisão de publicação em 08/10/2026: o lojista concluiu o assistente Windows, confirmou a calibração e criou o pedido fictício #006 pelo cardápio local; a fila registrou uma tentativa e o usuário confirmou a impressão automática. O ensaio terminou com impressão da `teste1` desligada. Evidência: `database/reference/merchant-automatic-print-verification-20261008.json`. A suíte completa passou com 243 testes e 48 verificações Windows. Entrada real após reiniciar o Windows, interrupção real de rede/impressora e período prolongado ainda não foram validados. O executável permanece um candidato local sem assinatura de distribuição.

Os fontes atuais do agente estão em `printing/windows`; `Build-Installer.ps1` gera o executável local. Pastas e arquivos de pacotes gerados não são versionados, para evitar cópias divergentes. O `.vercelignore` mantém fontes de ensaio, journals e executáveis locais fora do deploy.

Preparação da publicação e assistente Windows em 08/10/2026: [guia do restaurante](guia-do-restaurante.md), [plano de publicação](../plans/publicacao-impressao.md) e `database/reference/continuous-print-preparation-20261008.json`. Instalador `.exe` local preparado para revisão, sem assinatura/distribuição ainda; 93 verificações desta etapa e build passaram. Quatro ciclos reais preservaram uma tentativa do #004, loja desligada. Instalação interativa, entrada real no Windows e ensaio prolongado permanecem pendentes; não houve deploy ou nova comanda.

Estado atual em 08/10/2026: ensaios isolado e remoto controlado concluídos, com papel confirmado. O pedido fictício #004/R$ 14,00 percorreu checkout, fila Supabase, API Next local e agente Windows instalado; uma via e corte confirmados, sem histórico ou repetição após reiniciar. Impressão desligada ao terminar. Ver [automatic-live-test.md](automatic-live-test.md). As seções abaixo registram a sequência das etapas; publicação e operação contínua permanecem separadas.

## Estado confirmado em 07/10/2026

A etapa 2F foi aplicada e verificada no Supabase pelo usuário: `document_verification.all_passed: true`, 12 checks verdadeiros, 6 triggers válidos, 7 funções privadas invoker/search_path vazio, sem escritas indevidas e zero divergências de documentos/contadores. Não cria fila nem ativa impressão automática.

Um único recibo fictício foi enviado pela fila `EPSON TM-T20X Receipt`, driver `EPSON TM-T(203dpi) Receipt6`, USB `TMUSB001`. Usuário confirmou rolo de 80 mm. O driver informou área imprimível de aproximadamente 72,2 mm de largura. A prévia e a foto física mostram acentos, texto longo com quebras, opções, observações, endereço/complemento/bairro, frete, desconto, total R$ 32,00 e troco R$ 50,00 legíveis e alinhados. Usuário confirmou **corte automático e exatamente uma via**.

Ensaio `initial-80mm`: intenção registrada antes do spooler; chamada retornou como `spooler_submitted`; foto e confirmação do usuário registradas no journal local. Isso comprova o ensaio físico nesta máquina, não exactly once nem funcionamento de uma fila automática. Não foram lidos ou impressos pedidos reais/histórico. A fixture usa IDs e telefone fictícios, sem .env ou credenciais.

## Ferramentas do ensaio

1. `generate-test-receipt.ts`: gera texto somente da fixture validada, 80 mm/42 colunas ou 58 mm/32 colunas. Não imprime.
2. `windows/ControlledReceipt.cs`: renderiza com GDI/PrintDocument e driver existente, fonte Consolas 7,5 pt, mede linhas e rejeita conteúdo maior que a área/página. Exige uma única página e cópia, sem comandos RAW. O corte é executado pela configuração do driver.
3. `windows/test-receipt.ps1`: roda em Windows PowerShell 5.1; padrão é preview PNG. `-Send` exige fila vazia/status sem alerta, grava journal exclusivo e durável antes do envio. Journal existente recusa repetição do mesmo ensaio, qualquer que seja o estado. Uma nova via exige `TrialId` explícito e decisão humana após conferir papel/fila.

```powershell
# Gerar apenas a fixture e visualizar sem imprimir:
npx tsx printing/generate-test-receipt.ts 80
powershell.exe -NoProfile -File printing/windows/test-receipt.ps1 -PaperWidthMm 80
```

Artefatos e journal ficam em `printing/.local/`, ignorado pelo Git. Não apagar o journal para reenviar automaticamente. O script é uma ferramenta de ensaio; **não é o agente definitivo de pedidos**.

## Painel local atualizado

`useOrdersFeed` reconcilia por evento Realtime (proprietário), a cada 15 segundos enquanto a aba está visível, ao voltar à aba/foco e após reconectar. A leitura inicial e a retomada da assinatura reconciliam novamente. No acesso de superadmin, as ações preservam autorização e escopo de loja; polling funciona mesmo sem eventos Realtime do alvo.

Leituras travadas expiram após 10 segundos; a resposta tardia é descartada. Eventos repetidos coalescem, sem consultas paralelas da lista. Trocar filtros/página/loja descarta o estado anterior, e o cleanup impede atualizações de uma instância desmontada. Detalhes usam cabeçalho+itens numa leitura, descartam respostas A/B antigas e não reabrem após fechamento. Falhas mostram aviso/tentativa novamente e não são apresentadas como carregamento completo.

Paginação de 50 pedidos com ordenação por data/ID e contagem; filtros de tipo/período aplicados no banco, inclusive no proxy. "Hoje" e a apresentação usam São Paulo. Painel mostra estados separados de pedido e contato, meio de pagamento informado sem declarar pagamento realizado, e impressão automática ainda não ativada. Inclui complemento, bairro, sabores, opções, desconto, observações, mesa e troco. A solicitação explícita de outra via está implementada, mas permanece bloqueada pela liberação do servidor até concluir os ensaios.

Testes locais do sincronizador verificam concorrência de respostas, coalescência, falha/recuperação, descarte após fechar/trocar escopo, deadline e virada do dia. Não equivalem a ensaio visual com duas sessões nem a concorrência PostgreSQL remota. Verificação visual do painel é separada da evidência física de impressão. Navegador local conferido pelo agente: histórico com três pedidos de teste, filtro Retirada retornando somente #001, detalhes do #003 com item, complemento/bairro e estados separados. Ainda falta exercício visual de perda/reconexão, eventos simultâneos e paginação com mais de 50 pedidos.

## Fila aplicada e integração local

A etapa 3A está preparada em `database/migrations/2026100802_persistent_print_queue.sql`, com preflight, verificação e 19 testes SQL locais passando. Aplicação remota confirmada pelo usuário: todos os 11 checks verdadeiros, jobs/dispositivos/lojas ativadas zero. Contrato, execução e limites em [persistent-print-queue.md](../database/persistent-print-queue.md). A API e o agente Windows estão implementados localmente na etapa 3B, com cadastro/conexão liberados somente no processo local e ativação bloqueada. Não há cadastro real feito pelo agente nem ativação. Ver [agent-integration.md](agent-integration.md).

A migração implementa com ativação desligada, corte por loja e unicidade inicial por loja/pedido/finalidade (independente do dispositivo), geração transacional junto do documento, leases/tokens, revogação e autorização antes do envio. Configuração de fila/driver, rolo 58/80 mm, área/fonte e corte por dispositivo; não usar a largura desta Epson como padrão obrigatório para restaurantes.

Etapa 3B local: servidor de fila com escopo mínimo implementado; credencial revogável sem service_role no PC; agente com conexões HTTPS de saída, reconciliação e journal durável; resultado incerto sem retry após a fronteira de envio; reimpressão explícita com usuário, motivo, versão e histórico. Cancelamento e versão revalidados antes do envio; documento não muda de acordo com catálogo/status. Não enfileirar histórico ao ativar ou adicionar outro PC.

Segurança de Next/dependências, projeção pública/colunas administrativas/Storage e tratamento de falhas de horários continuam no inventário de riscos. Next e eslint-config-next foram atualizados localmente para 16.3.8 em 08/10/2026, conforme comunicado oficial de segurança de 30/09; 61 regressões, TypeScript, lint direcionado e build passaram. Não equivale a atualizar o site publicado. Nenhum commit, push, deploy, serviço permanente ou impressão automática foi executado.

## Ensaio integrado isolado concluído em 08/10/2026

14 testes com duas conexões PostgreSQL reais e 52 regressões afetadas passaram. Upload autenticado de imagem fictícia no Supabase validado e limpo, com escrita anônima negada e imagens existentes preservadas. Ensaio integrado usou SQL nativo, handler API HTTP real, AgentCore, driver GDI, journal e ACK; reinício não reservou outro job. Usuário confirmou exatamente uma via fictícia R$ 14,00, legível e com corte automático, acompanhada de foto. Nenhum pedido real/histórico, configuração instalada ou ativação da loja foi usado. Procedimento e limites em [integrated-test.md](integrated-test.md); ensaio não equivale a liberação em produção. A migração 04 segue bloqueada até publicar os leitores públicos validados.
