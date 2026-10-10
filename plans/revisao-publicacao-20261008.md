# Revisão da versão 1.37.0

## Fechamento consolidado em 10/10/2026

Publicação dos PRs #1 e #2 concluída; migrações privadas 04 e 05 aplicadas e
verificadas. Ativação pelo lojista validada na teste1 com assistente atualizado,
confirmação física, reativação às 22:44:11 de 08/10 (São Paulo) e pedido fictício
#016, uma via legível com corte e uma tentativa registrada. A publicação conferida
é o merge `bacc3cc5ed7781f2d36256899b23ad210a4fabb2`, deployment
`dpl_6icHz7ixk15Hoe8DfGsQUcbLZcpB`, Ready, nos aliases comerciais e teste1.

Piloto assistido sem assinatura escolhido pelo operador; distribuição pública,
operação prolongada em restaurante, outros equipamentos/58 mm e migração física
de PWA antigo Workbox permanecem pendentes. Registro atual em
[docs/changelog.md](../docs/changelog.md) e
[piloto assistido](piloto-assistido-impressao.md).

## Histórico da revisão

As seções seguintes preservam evidências e pendências do momento em que foram
registradas. Não representam pendências atuais de merge ou aplicação das migrações.

Preparação final: três opções de impressão persistidas na produção da Vercel, com lista contendo somente a teste1; deployments e aliases mantidos. Contrato público válido nas cinco lojas e uma única loja habilitada, dentro do escopo. Auditoria de 149 arquivos sem segredos literais ou novos erros de lint. A verificação da migração privada foi corrigida para conferir somente as barreiras de leitura e informar separadamente a quantidade de lojas com impressão ativa, sem mudar essa ativação; 17 testes PostgreSQL/PGlite passaram, incluindo o cenário ativo. Soberano Burguer foi escolhido como piloto, mas o equipamento e o contato estão pendentes e sua ativação não foi liberada. O merge, publicação comercial e aplicação de 2026100804 continuam pendentes da etapa de publicação.

O operador esclareceu que instalou o PWA agora; o pedido #014 valida instalação nova. Foi recompilada a mesma aplicação, a partir de 0effb84, para oferecer um worker diferente na teste1 (dpl_7VXQgjWnQzHKQa6fKi6trg2Ub1e4). Os domínios comerciais e a ativação/filas permaneceram iguais; health conectado, página pública, manifest, ícones e worker aprovados. Uma primeira sondagem móvel expirou esperando o nome da loja; a inspeção seguinte encontrou HTTP 200, nome correto e nenhum erro de página, e a repetição completa passou. O operador confirmou o aviso e o recarregamento do PWA e depois confirmou o pedido #015 com uma única comanda legível e corte. O banco registrou spooler_submitted com uma tentativa; tentativas anteriores permaneceram iguais. A migração física de uma instalação antiga com Workbox continua sem teste.

Estado atual: ensaios físicos publicados #008 a #015 concluídos na teste1, incluindo inicialização após reinício do Windows e recuperação de energia da impressora/rede. Os registros detalhados estão em database/reference/published-print-operation-verification-20261008.json. A teste1 continua ativada; os domínios comerciais seguem na versão anterior, o PR continua em revisão e a migração 2026100804 não foi aplicada. As seções abaixo preservam também o histórico das etapas anteriores.

O teste do próprio lojista criou o pedido fictício #006 e imprimiu automaticamente. O banco registrou uma tentativa; a impressão da teste1 foi desligada ao terminar. Não houve novo pedido, WhatsApp enviado ou impressão durante a revisão.

Validação: 243 testes de regressão, incluindo concorrência em processos PostgreSQL independentes, e 48 verificações Windows aprovados. Build e TypeScript aprovados após as atualizações de dependências. Auditoria dos arquivos sem segredos literais nem aumento de erros de lint em relação à base; o lint completo ainda tem erros anteriores. As cinco lojas atendem ao contrato público limitado, e nenhuma ficou com impressão ligada.

O pacote gerado do Windows foi excluído do Git; os fontes canônicos ficam em printing/windows. O executável não assinado continua somente para avaliação local. A regra de .vercelignore foi restringida à pasta /printing/ da raiz: o componente src/components/admin/printing/PrintConfiguration.tsx precisa entrar na publicação. A simulação do deploy confere esse componente e a rota do agente, além da exclusão de arquivos de ambiente, SQL, testes, journals e executáveis.

## Dependências

Atualização da primeira etapa guiada: o usuário confirmou que utiliza o PWA no celular. A integração de geração foi substituída por @serwist/next e serwist 9.5.13, mantendo o manifest, os ícones, /sw.js com escopo /, a atualização por confirmação e a página sem conexão. A auditoria npm de produção agora tem zero alertas. A auditoria completa ainda tem cinco alertas altos da cadeia do eslint-config-next, todos ligados ao mesmo braces; os pacotes envolvidos estão marcados como dev no lockfile. A versão mais nova consultada do plugin de lint ainda depende de fast-glob; não foi feito downgrade nem ocultação de alertas.

Validação dessa etapa: 232 testes passaram na execução geral, incluindo três novos testes de barreiras de cache. A inicialização do PostgreSQL temporário excedeu o limite no ambiente isolado; os 14 testes de concorrência foram repetidos isoladamente fora desse ambiente e todos passaram, totalizando 246 casos aprovados. Build final, TypeScript e lint dos arquivos de PWA alterados aprovados. Edge em perfil temporário com viewport móvel confirmou registro, manifest, ausência de rotas privadas no cache, aviso de atualização/ativação e fallback público sem conexão. Nenhum pedido foi criado durante essa conferência. A instalação em um celular físico e a migração de uma instalação existente ainda precisam de conferência; a publicação dos restaurantes permanece na versão anterior durante o ensaio guiado.

A geração usa uma lista explícita de arquivos públicos e mantém APIs, admin, auth, downloads de impressão e REST/auth/objetos privados do Supabase em NetworkOnly. Cache por navegação explícita foi desativado para não contornar essas barreiras; reconectar não recarrega automaticamente um checkout. Evidências locais ficam em printing/.local/pwa-production-audit.json, pwa-all-audit.json, pwa-build-final.log, pwa-regression-tests.log, pwa-concurrency-recheck.log e pwa-browser-verification.json. Orientação oficial da integração: https://serwist.pages.dev/docs/next/getting-started.

Histórico da revisão anterior:

A auditoria de produção inicial tinha 21 alertas, sendo um crítico. Atualizações compatíveis corrigiram protobufjs, ws e outras dependências. Workbox build e webpack plugin foram atualizados juntos para 7.4.1, na mesma versão principal, para usar o serializador corrigido. Resultado final: zero críticos e quatro alertas altos, todos da mesma cadeia next-pwa → fast-glob → micromatch → braces.

braces 3.0.3 é a versão publicada e continua sem correção para o advisory GHSA-vfj7-8cjw-p6xm. A cadeia é utilizada pela ferramenta de geração da PWA com padrões definidos no projeto; o código do aplicativo não recebe padrões de glob dos consumidores. Isso limita o cenário de exploração, mas não equivale a uma auditoria sem alertas. Não foi aplicado o downgrade principal sugerido automaticamente pelo npm. A revisão dessa dependência permanece um ponto aberto antes de declarar a publicação integralmente aprovada.

Fontes: [protobufjs](https://github.com/advisories/GHSA-xq3m-2v4x-88gg), [correção do serializador](https://github.com/yahoo/serialize-javascript/releases/tag/v7.0.5), [braces sem versão corrigida](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Implantação e limites

No ensaio publicado da teste1, a conexão HTTPS do agente foi confirmada e o login por e-mail funcionou após autorizar o callback dos subdomínios no Supabase. A checkbox continuava bloqueada pela configuração de ativação do deployment. A liberação agora exige, além das duas flags, uma lista explícita de UUIDs em RMENU_PRINT_ACTIVATION_STORE_IDS. Lista ausente ou inválida não libera lojas. Ativação e reimpressão validam essa lista contra o dono autenticado no servidor; ambas as páginas usam a mesma política. A desativação continua disponível ao dono mesmo fora da lista. Foram aprovados 36 testes direcionados de fila/API/liberação (sete novos), TypeScript e lint dos arquivos alterados; os testes usam bancos isolados e não imprimem nem ativam lojas reais. A publicação de ensaio lista somente o UUID da teste1 e atualizou apenas seu alias, mantendo o domínio principal e o wildcard na publicação comercial anterior.

PR de revisão: https://github.com/richardgms/cardapio-digital/pull/1. A primeira compilação remota detectou a exclusão do componente de impressão e falhou; a produção anterior continuou atendendo. A nova tentativa usa o ambiente de produção com --skip-domain, conexão do módulo habilitada e ativação de impressão bloqueada em build e runtime. Não promove automaticamente os domínios ou aplica SQL.

A migração 2026100804 continua bloqueada até publicar e conferir os leitores públicos nos domínios reais. A comparação de segredos locais/remotos não foi feita; não houve env pull depois da rejeição anterior. O link explícito acrescentou automaticamente um token OIDC local pela CLI; essa entrada foi removida e as demais variáveis preservadas.

A instalação interativa e a calibração foram concluídas pelo operador. Na publicação restrita da teste1, os pedidos fictícios #008 a #013 tiveram uma tentativa registrada cada. O operador confirmou a impressão com Chrome fechado, com outro celular, após reiniciar o Windows com inicialização automática do assistente, após desligar/religar a Epson e após desconectar/reconectar o cabo Ethernet do computador. Na falta de energia da Epson, o Windows aceitou o trabalho e manteve um item com erro na fila; ao religar, o operador confirmou uma via com corte e a fila ficou vazia. Após a reconexão de rede, o operador confirmou ausência de impressão durante a interrupção e uma via ao retomar; health autenticado voltou a conectado e a fila Windows ficou vazia. O estado spooler_submitted continua significando aceitação pelo Windows, não comprovação do papel. Evidência: database/reference/published-print-operation-verification-20261008.json. Os jobs anteriores mantiveram uma tentativa, e #007 não foi enfileirado. A impressão continua ativada somente na teste1 durante os ensaios. O operador também confirmou abertura do PWA pelo ícone no Android sem barra do Chrome e o pedido #014 em uma via legível com corte, com uma tentativa no banco. Teste prolongado em restaurante, outras impressoras/58 mm, atualização de PWA já instalado e assinatura/distribuição do instalador continuam pendentes. A publicação de código e a liberação comercial da impressão são etapas separadas.
