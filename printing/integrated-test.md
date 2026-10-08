# Ensaio integrado isolado

Em 08/10/2026, passaram 14 testes de concorrência com duas conexões PostgreSQL nativas e 52 regressões de fila/API/documentos/recibos. O upload autenticado real da imagem fictícia também passou: API pública HTTP 200, sobrescrita e exclusão por visitante negadas, arquivo de teste removido (info retornou 404), produtos/imagens existentes preservados e impressão da loja desligada. O Storage não expõe owner_id nos endpoints list/info utilizados; não houve leitura direta dessa coluna no banco remoto. A API de remoção anônima retornou sucesso sem remover linhas, por isso o teste confirmou que o objeto continuava existindo.

## Prévia integrada concluída

`npm run test:print-integrated` passou em 08/10/2026. Inicia PostgreSQL 18.4 novo e uma API HTTP real em porta temporária de 127.0.0.1, aplica SQL real de pedidos/documentos/fila e cria somente dados fictícios. O handler real da API é usado com adaptador SQL local, papel service_role e segredo descartável. Não carrega .env, acessa Supabase, altera a configuração do agente instalado ou muda flags do aplicativo.

O Windows executa AgentCore.psm1 real, valida protocolo/job/dispositivo/checksum, gera prévia GDI com AgentReceipt.cs e a fila Epson existente, registra journal durável e confirma ACK pela API HTTP. No modo padrão o callback de spooler é simulado; o estado spooler_submitted existe apenas no banco fictício e não indica envio de papel. Uma segunda execução do consumidor confirmou ausência de job e não repetiu o callback. Ambos os servidores são encerrados no finally.

Evidência: `printing/.local/postgres-concurrency-RniUFw/integration-verification.json`; prévia `receipt-preview.png` no mesmo diretório. Asserção inicial do runner esperava spooler_submitted como retorno do Core; o Core retorna acknowledged quando confirma o ACK. Corrigida somente a expectativa do harness, e a execução final passou.

Clique em Ensaio-Integrado-Sem-Imprimir.cmd para repetir somente a prévia. Requer as dependências de teste descritas em tests/postgres-runtime/README.md e a Epson instalada; não exige pareamento novo nem credencial real.

## Envio físico separado

`npm run test:print-integrated -- --send` ou Imprimir-Ensaio-Integrado.cmd executa uma única comanda fictícia por driver GDI na fila EPSON TM-T20X Receipt, 80 mm. O CMD exige digitar IMPRIMIR. Antes do callback, o Core exige fila vazia/status normal, renova o lease, registra intenção e autorização duráveis e só então chama SendOnce. O conteúdo vem do documento selado no banco isolado e começa com TESTE FICTICIO - SEM PEDIDO REAL.

O runner também cria exclusivamente `printing/.local/integrated-physical-80mm.json` com fsync antes de iniciar o consumidor físico. Um arquivo já existente bloqueia nova execução, qualquer que seja seu estado. Não apagar esse arquivo nem o journal para reenviar. Falha após a intenção exige conferir papel/fila; outra via precisa de decisão humana e ensaio próprio. Nenhum pedido real/histórico é usado ou enfileirado. Largura 80 mm limita esta fixture/Epson; não altera o suporte 58/80 mm por dispositivo do produto.

O operador precisa confirmar legibilidade, exatamente uma via e corte automático. Submissão ao spooler e ACK não comprovam papel. Envio físico executado uma única vez em 08/10/2026 após o usuário confirmar presença junto da Epson/rolo 80 mm. O Core registrou dispatch_intent, dispatch_authorized, spooler_submitted e acknowledged; banco fictício ficou spooler_submitted/attempts=1 e o segundo consumidor não recebeu job. Servidores encerrados. Evidência em printing/.local/postgres-concurrency-LlVJkG/integration-verification.json e marcador integrado global preservado. Usuário confirmou explicitamente: “Sim: legível, uma via e corte automático”. Foto recebida corresponde ao recibo fictício #003, total R$ 14,00, horário 09:05:24; preservada em receipt-photo-confirmed.jpg no diretório da execução. Report e marcador atualizados com physical_paper_confirmed/paper_confirmed=true. Journal operacional permanece acknowledged; marcador continua existente e bloqueia repetição. Ensaio físico isolado concluído, sem ativação da fila real.

## Ensaio posterior da fila real

O usuário autorizou depois um ensaio separado no Supabase, com o agente instalado e pedido fictício #004 de R$ 14,00. As verificações de software passaram, sem histórico enfileirado nem repetição após reiniciar o agente; impressão desligada ao terminar. Ver [automatic-live-test.md](automatic-live-test.md) e o relatório local para a confirmação física e os limites. O ensaio isolado acima e seus marcadores permanecem preservados.

## Limites

O ensaio usa o handler API, o Core e o renderer reais, mas um harness de transporte/configuração; não inicia Run-Agent.ps1 com a configuração de produção. DPAPI, ACL, credencial instalada e health real já foram validados separadamente. Este ensaio não comprova concorrência remota/carga, gateway PostgREST do Supabase durante impressão, hardware 58 mm, recibos extensos ou reinício do Windows no meio do spool. Os testes automatizados de journal/falhas cobrem essas transições simuladas. Migração 04/publicação e liberação geral continuam separadas; a fila real permanece desligada.
