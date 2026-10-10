# Execução da publicação

Atualização em 10/10/2026: publicação concluída pelos PRs #1 e #2, migrações 04/05
aplicadas e verificadas, e ativação pelo lojista validada na teste1. Este roteiro
preserva a sequência anterior; não reaplicar migrações nem repetir seus ensaios.
Estado atual: [publicação](publicacao-impressao.md) e
[changelog](../docs/changelog.md). A lista manual antiga não limita a ativação no
modo autônomo habilitado. Piloto assistido sem assinatura foi escolhido pelo operador:
[procedimento atual](piloto-assistido-impressao.md).

Preparado em 08/10/2026 para o PR https://github.com/richardgms/cardapio-digital/pull/1, base master e branch codex/printing-checkout-release. Este documento não executa a publicação. A impressão e o cadastro dos dispositivos não são ativados pelo merge.

## Antes da publicação

Confirmar o head atual do PR, checks aprovados e ausência de conflito. Confirmar o projeto richardgms-projects/cardapio-digital (prj_WElQReMshf36K9red4cMfyQ6fFVi). As três opções persistentes de produção foram salvas: RMENU_PRINT_AGENT_ENABLED=1, RMENU_PRINT_ACTIVATION_READY=1 e RMENU_PRINT_ACTIVATION_STORE_IDS contendo exclusivamente 099cb335-23df-4aca-b13e-3fee1e31fde9, UUID da teste1. Não acrescentar restaurante sem conferir seu equipamento e calibração.

O deployment de teste é dpl_7VXQgjWnQzHKQa6fKi6trg2Ub1e4, associado somente a teste1.rmenu.com.br; a aplicação é a mesma desde 544d499. Domínio principal, wildcard e rmmenu.vercel.app seguem no comercial dpl_ExCN964hzW812oecxeZnFZcZwu8j. Esses destinos foram conferidos após salvar as opções. A migração 2026100804 permanece sem aplicação.

## Publicação do código

Com a aprovação do operador para trocar a versão usada pelos restaurantes, retirar o draft do PR e realizar merge protegido pelo SHA do head revisado. A integração Git/Vercel fará um novo build de produção, usando as opções persistentes. Esperar Ready e conferir que o SHA Git do deployment corresponde ao merge, com aliases de produção apontando para essa versão. Se a integração não gerar o deployment esperado, investigar antes de promover outro artifact.

Conferir a landing page e os cardápios públicos sem sessão nos subdomínios soberano-burguer, teste1, nutribox, realgryl e 4corners. Conferir manifest, worker, acesso do proprietário, produtos, horários, zonas, cupom e isolamento de pedidos/configuração. O health da impressora deve continuar conectado. Verificar que os jobs antigos não receberam tentativas novas e que somente a teste1 continua habilitada. Não criar pedido real, enviar WhatsApp ou ativar outro restaurante para essas verificações.

## Fechamento da leitura privada

Somente após verificar os novos consumidores nos domínios reais, liberar a trava e aplicar database/migrations/2026100804_private_store_configuration.sql no editor SQL do Supabase. A trava exige o valor published-consumers-2026100804 em rmenu.public_read_contract_ready; deve ser colocado com SET LOCAL dentro da mesma transação da migração, depois do BEGIN. A sessão não deve manter a liberação fora da transação. Preparar esse arquivo de execução e guiar o operador somente quando os consumidores publicados tiverem sido conferidos.

Executar database/verify-private-store-configuration-readonly.sql e conferir all_passed. A consulta informa enabled_store_count e automatic_printing_activated_by_this_query=false; não é necessário desligar uma impressora calibrada para validar privacidade. Repetir a leitura pública limitada pelos consumidores publicados, confirmar que anon não lê a tabela integral e que um proprietário não lê configuração de outro restaurante. Nunca imprimir dados privados nem segredos para provar a barreira.

Uma instalação nova de Serwist e sua atualização foram testadas fisicamente no Android (#014 e #015). A migração de um PWA antigo com Workbox não foi testada fisicamente; o suporte deve orientar a atualização quando disponível e investigar clientes antigos antes de concluir a liberação comercial. Não tratar reinstalação como prova de migração.

## Recuperação

Antes de aplicar 2026100804, a versão comercial anterior ainda é compatível com as permissões do banco. Se houver falha na publicação, retornar os aliases comerciais ao deployment anterior, mantendo teste1 no deployment validado e conferindo health; preservar registros, credenciais e fila. Não apagar journals, repetir trabalhos ou usar rollback que mova inadvertidamente a teste1 para uma versão sem a API de impressão.

Depois de 2026100804, a versão antiga que fazia leitura anônima integral de store_config deixa de ser compatível. Recuperação deve manter os novos consumidores e corrigir o código, ou usar um deployment compatível já validado. Não promover o comercial antigo nem reabrir leitura privada como recuperação automática.

## Piloto

Soberano Burguer foi escolhido, e seu subdomínio cadastrado é soberano-burguer. O operador ainda conversará com o restaurante para confirmar interesse, Windows, impressora e largura do papel. A lista da Vercel continua contendo somente teste1. Instalador assinado, distribuição, instalação no equipamento do piloto e observação de um turno completo permanecem pendentes. O executável de avaliação não é distribuído pela Vercel nem pelo cache PWA.
