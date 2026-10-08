# Revisão da versão 1.37.0

O teste do próprio lojista criou o pedido fictício #006 e imprimiu automaticamente. O banco registrou uma tentativa; a impressão da teste1 foi desligada ao terminar. Não houve novo pedido, WhatsApp enviado ou impressão durante a revisão.

Validação: 243 testes de regressão, incluindo concorrência em processos PostgreSQL independentes, e 48 verificações Windows aprovados. Build e TypeScript aprovados após as atualizações de dependências. Auditoria dos arquivos sem segredos literais nem aumento de erros de lint em relação à base; o lint completo ainda tem erros anteriores. As cinco lojas atendem ao contrato público limitado, e nenhuma ficou com impressão ligada.

O pacote gerado do Windows foi excluído do Git; os fontes canônicos ficam em printing/windows. O executável não assinado continua somente para avaliação local. A regra de .vercelignore foi restringida à pasta /printing/ da raiz: o componente src/components/admin/printing/PrintConfiguration.tsx precisa entrar na publicação. A simulação do deploy confere esse componente e a rota do agente, além da exclusão de arquivos de ambiente, SQL, testes, journals e executáveis.

## Dependências

A auditoria de produção inicial tinha 21 alertas, sendo um crítico. Atualizações compatíveis corrigiram protobufjs, ws e outras dependências. Workbox build e webpack plugin foram atualizados juntos para 7.4.1, na mesma versão principal, para usar o serializador corrigido. Resultado final: zero críticos e quatro alertas altos, todos da mesma cadeia next-pwa → fast-glob → micromatch → braces.

braces 3.0.3 é a versão publicada e continua sem correção para o advisory GHSA-vfj7-8cjw-p6xm. A cadeia é utilizada pela ferramenta de geração da PWA com padrões definidos no projeto; o código do aplicativo não recebe padrões de glob dos consumidores. Isso limita o cenário de exploração, mas não equivale a uma auditoria sem alertas. Não foi aplicado o downgrade principal sugerido automaticamente pelo npm. A revisão dessa dependência permanece um ponto aberto antes de declarar a publicação integralmente aprovada.

Fontes: [protobufjs](https://github.com/advisories/GHSA-xq3m-2v4x-88gg), [correção do serializador](https://github.com/yahoo/serialize-javascript/releases/tag/v7.0.5), [braces sem versão corrigida](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Implantação e limites

PR de revisão: https://github.com/richardgms/cardapio-digital/pull/1. A primeira compilação remota detectou a exclusão do componente de impressão e falhou; a produção anterior continuou atendendo. A nova tentativa usa o ambiente de produção com --skip-domain, conexão do módulo habilitada e ativação de impressão bloqueada em build e runtime. Não promove automaticamente os domínios ou aplica SQL.

A migração 2026100804 continua bloqueada até publicar e conferir os leitores públicos nos domínios reais. A comparação de segredos locais/remotos não foi feita; não houve env pull depois da rejeição anterior. O link explícito acrescentou automaticamente um token OIDC local pela CLI; essa entrada foi removida e as demais variáveis preservadas.

A instalação interativa e a calibração foram concluídas pelo operador. Reinício real do Windows, interrupção física de rede/impressora, teste prolongado e validação de outras impressoras/58 mm continuam pendentes. A publicação de código e a liberação comercial da impressão são etapas separadas.
