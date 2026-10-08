# Preparação da publicação e operação contínua

Projeto confirmado por consultas somente de leitura em 08/10/2026: `richardgms-projects/cardapio-digital`, ID `prj_WElQReMshf36K9red4cMfyQ6fFVi`, domínio de produção `https://rmenu.com.br`, Node 24.x, Next.js. CLI 62.7.0 autenticada como `richardgms`. Esta pasta ainda não está vinculada; não executar link/deploy automaticamente ao receber `link_required`.

Nomes das variáveis de produção presentes: NEXT_PUBLIC_ROOT_DOMAIN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL. Valores não foram baixados nem alterados. As duas liberações RMENU_PRINT_AGENT_ENABLED e RMENU_PRINT_ACTIVATION_READY ainda não existem no ambiente remoto. Chave service_role fica somente no servidor; nunca incluída no instalador.

A comparação dos valores remotos com o ambiente local ainda não foi realizada: a revisão automática bloqueou `vercel env pull` para `.vercel/.env.production.local` por persistir segredos de produção e considerar a autorização anterior limitada aos nomes. A pasta `.vercel` foi criada com ACL protegida, mas nenhum segredo ou vínculo foi baixado. Prosseguir nessa leitura exige autorização específica do usuário; não obter os mesmos valores por outro meio para contornar o bloqueio. Build local passou com configuração local, não comprova ainda coerência dos valores remotos.

## Sequência de publicação

1. Validar esta versão local e revisar a alteração conjunta de checkout, documentos, fila, segurança e leitores públicos. Há mudanças anteriores de várias etapas ainda sem commit; não publicar seletivamente componentes que dependem das migrações aplicadas.
2. Na execução autorizada da publicação, vincular explicitamente esta pasta ao projeto existente `cardapio-digital` e escopo `richardgms-projects`; confirmar owner/ID depois. Não criar outro projeto nem sobrescrever `.env.local` com `env pull`.
3. Preparar uma implantação de revisão usando as variáveis do ambiente correspondente. Para a primeira publicação, conexão/cadastro podem usar RMENU_PRINT_AGENT_ENABLED=1, com RMENU_PRINT_ACTIVATION_READY=0. Nenhuma loja é ativada por essas flags. Configurar valores coerentes no build e no runtime. Não promover um build de preview supondo que ele usa as variáveis de produção.
4. Conferir login do lojista, seus produtos/horários, isolamento entre lojas, cardápios públicos, imagens existentes, checkout fictício na teste1, painel e health autenticado. Nenhum pedido real/histórico deve ser usado no ensaio. Uma proteção de preview deve ser usada normalmente, sem desativá-la.
5. Publicar os leitores públicos limitados e conferir os cardápios por seus domínios reais. Só então aplicar/verificar `2026100804_private_store_configuration.sql`, cuja trava exige comprovação dos consumidores publicados. Isso fecha a leitura anônima integral de store_config. Não executar 04 antes da nova versão pública; não voltar a consumidores antigos após revogar as permissões sem um plano de compatibilidade.
6. Distribuir o instalador Windows somente após assinatura digital e aceitação do assistente/startup. O `.exe` atual é um candidato local não assinado; `.vercelignore` exclui esse arquivo da publicação. O pacote não contém credenciais.
7. Após os ensaios, preparar build/runtime com RMENU_PRINT_ACTIVATION_READY=1 e ativar somente a loja autorizada com equipamento calibrado. Liberação e ativação são ações separadas. Não liberar todas as lojas de uma vez.

A `.vercelignore` preparada exclui `.env*`, testes, SQL/evidências, pacotes/journals locais, ferramentas e artefatos gerados. O download do instalador não entra no cache offline da PWA. Guia para o restaurante: `printing/guia-do-restaurante.md`.

## O que validar continuamente

Atualização da revisão: o assistente interativo e sua calibração foram concluídos pelo usuário; o monitor e o worker instalados foram encontrados em execução. O pedido fictício #006 foi criado pelo próprio lojista e impresso automaticamente com uma tentativa registrada. A impressão da teste1 foi desligada ao encerrar esse ensaio. A suíte de revisão passou com 243 testes de regressão e 48 verificações Windows. Isso ainda não substitui testes de reinício real do Windows, interrupções físicas e período prolongado.

- Agente aberto: pedidos fictícios novos aparecem na fila e são consumidos sem abrir o painel ou clicar em imprimir.
- Falta de conexão ao iniciar e no meio do uso: aguardar e retomar; não repetir envio iniciado.
- Impressora indisponível/ocupada: aguardar sem reservar outro pedido e retomar quando pronta.
- Reiniciar o agente e depois o Windows: reconciliar ACK, preservar registros e não emitir outra via.
- Entrada no mesmo usuário Windows: iniciar pelo atalho instalado, sem comandos.
- Pausar/retomar, encerrar, desativar a loja e revogar o computador: manter a autorização e a fronteira de envio corretas.
- Conferir uma impressora/rolo por restaurante, incluindo 58 mm e corte compatível com o modelo.

Já validado: ensaio real #004/R$14 com confirmação física e reinício sem repetição; quatro ciclos adicionais reais com loja desligada e uma única tentativa preservada; testes Windows de recuperação de conexão e pausa com callbacks controlados; calibração local única e falha parcial sem reenvio; instalação e atalho de inicialização em diretório isolado (sem alterar startup real).

Ainda exige operador: instalação interativa completa, teste da calibração do assistente no equipamento, entrada/reinício real do Windows, queda real de conexão/cabo e período prolongado com pedidos fictícios controlados. Os quatro ciclos não comprovam horas de operação. Nenhuma dessas confirmações foi presumida.

## Referências

- [Implantação pela CLI](https://vercel.com/docs/cli/deploy)
- [Ambientes da Vercel](https://vercel.com/docs/deployments/environments)
- [Promoção de uma implantação](https://vercel.com/docs/deployments/promoting-a-deployment)
