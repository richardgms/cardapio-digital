# Etapa 2E: checkout integrado, rodada básica manual validada

A etapa 2D foi instalada no Supabase e confirmada pelo usuário: três funções existentes, SECURITY INVOKER, search_path vazio, execução somente para service_role, nenhuma função ausente.

## Resultado local

O checkout agora envia IDs/quantidades/escolhas e dados do cliente ao servidor. O servidor normaliza e calcula o hash, busca a projeção privada do catálogo, calcula promoções/opções/limites/meio a meio e chama rmenu_submit_order. Não há mais INSERT separado de orders, order_items ou coupon_usages nesta ação, nem UPDATE compensatório para cancelar pedido parcialmente gravado. Função ausente ou falha interrompe a tentativa sem retornar ao fluxo antigo.

A mensagem do WhatsApp é construída a partir do pedido e dos itens efetivamente salvos, incluindo complemento, bairro/frete, desconto/cupom e preço completo do item. Abertura do WhatsApp continua separada de envio, aceite, pagamento e impressão. Não existe aprovação obrigatória no painel.

A chave deriva de SHA-256 da intenção normalizada, com UUID das linhas do carrinho. Repetir o mesmo conteúdo conserva a chave; um novo carrinho com novas linhas recebe outra. A tentativa e o comprovante são preservados no armazenamento do navegador. Um ref impede dois cliques simultâneos na mesma instância. Se a leitura do comprovante falhar depois do commit, repetir a tentativa recupera o pedido existente. Um botão de conferência permite recuperar a intenção original, mesmo depois de a loja fechar ou de o cupom ser consumido. Carrinho com itens adicionados/alterados durante a requisição conserva essas linhas.

O aviso de pedido salvo é persistido antes de limpar os itens concluídos. Popup bloqueado mantém o comprovante e o botão de contato; o botão só registra whatsapp_opened e fecha o aviso quando consegue disparar a navegação. Isso não comprova envio de mensagem. Armazenamento bloqueado usa fallback em memória e não garante recuperação dos formulários/comprovante após fechar/recarregar a página; a chave ainda é determinística se a mesma intenção for reconstruída.

O modal de produto grava IDs das opções e dos sabores e usa o cálculo compartilhado. Meio a meio precisa cumprir as regras dos dois sabores; configuração incompatível ou ambígua é rejeitada com explicação. Carrinhos antigos resolvem nomes de opções apenas quando há correspondência única no produto; meio a meio antigo sem IDs precisa ser editado. A prévia pública de cupom retorna somente campos comerciais necessários, calcula o subtotal no servidor e confere primeira compra por histórico do telefone. A submissão revalida elegibilidade/limite no banco. A indicação de loja aberta atualiza periodicamente e usa fechamento exclusivo como o servidor.

## Evidências e limites

- 106 testes de banco passaram. Incluem diagnósticos explícitos de problemas legados, não corrigidos por essa contagem, e um teste de integração do código real do servidor com o SQL real das migrações: entrega, complemento, frete, cupom, leitura do comprovante e replay após alteração/fechamento, sem duplicar pedido/itens/uso.
- 31 testes de cálculo/checkout/tentativa e 13 de segurança passaram. Cobrem adulteração de preços, origem das escolhas, falha pós-commit, conflito de intenção, inexistência do RPC, limpeza seletiva do carrinho e reidratação em nova instância do aviso.
- TypeScript e build de produção passaram. Lint dos arquivos alterados não tem erros; permanecem dois avisos anteriores de img no modal de produto. git diff --check passou.
- No Supabase real, a verificação somente de leitura confirmou catálogo público, RPC privado de catálogo e cálculo dos dois produtos de teste1. Não criou pedidos nem usos. Comando opcional: npx tsx scripts/verify-checkout-readonly.ts teste1; as credenciais são lidas de .env.local e não aparecem na saída.
- Servidor local compilado iniciado em 127.0.0.1:3010. GET com Host teste1.localhost:3010 retornou 200. Build/leitura remota/servidor precisaram executar fora da restrição do ambiente de ferramentas; não houve publicação.
- Automação visual do navegador falhou ao inicializar (kernel assets, os error 3). Não houve teste de cliques reais, popup/Safari/PWA ou duas conexões de banco. Esses limites não são tratados como aprovação para impressão.

Nenhum commit, push, deploy ou impressão. O site publicado continua com a versão anterior. O servidor local usa o Supabase configurado em .env.local: finalizar um pedido no teste manual grava um pedido real na loja de teste.

## Primeiro pedido confirmado — 07/10/2026

O usuário apresentou o pedido 001, TESTE CHECKOUT, retirada de R$14 no painel publicado. Consulta somente de leitura, limitada à loja teste1, número 1 e esse nome de teste, confirmou o fluxo novo: request_hash válido, expected_item_count=1, um item X baco, quantidade 1, preço unitário/total R$14 e subtotal/total do pedido R$14. Estado pending e handoff_status=whatsapp_opened; isso indica registro e abertura do WhatsApp, sem comprovar envio, aceite ou pagamento. Nenhuma escrita foi feita pela verificação.

O painel publicado consegue ler esse pedido do checkout local porque usa o mesmo Supabase; a aplicação publicada continua com o checkout anterior. Comando opcional de conferência: npx tsx scripts/verify-checkout-readonly.ts teste1 1. Aviso, conteúdo visual da mensagem, limpeza do carrinho e recuperação ainda dependem de confirmação manual.

## Primeiro teste manual

1. Abrir http://teste1.localhost:3010 no Chrome. Escolher o produto de R$14, uma unidade, e continuar.
2. Escolher retirada; preencher nome identificável como TESTE CHECKOUT e um telefone válido de teste. Escolher PIX ou cartão.
3. Clicar uma vez em Enviar Pedido no WhatsApp. Conferir Pedido registrado, mensagem com produto/quantidade/valor e carrinho sem os itens concluídos. Abrir WhatsApp não confirma envio ou pagamento.
4. Abrir http://teste1.localhost:3010/admin/pedidos, entrar com a conta de lojista de teste1 e atualizar o painel. Deve haver um único pedido de R$14 com o item correspondente.
5. Fechar e reabrir o carrinho. Os itens concluídos não devem reaparecer. Se o WhatsApp foi bloqueado, usar o botão do aviso e conferir o mesmo pedido.
6. Informar se o aviso apareceu, se a mensagem/valor bateram e qual foi o número do pedido. Em erro, trazer o texto exibido; preservar a tentativa e usar Conferir tentativa anterior para recuperar antes de criar outra.

Depois do pedido simples, testar entrega/complemento se houver zona configurada, promoções/adicionais/meio a meio, cupons e recuperação de falha. A conta teste1 ainda tem dois produtos simples; os casos de catálogo complexo foram validados localmente com dados fictícios.

## Rodada direcionada após o pedido 001

Em 07/10/2026, o usuário mostrou o aviso Pedido registrado no checkout local. O envio da mensagem não é necessário para conferir a gravação, mas o conteúdo visual da mensagem não foi apresentado. A consulta de preparação confirmou mínimo zero, PIX/cartão/dinheiro habilitados e nenhuma zona de entrega ativa na loja teste1; não alterou a configuração.

Foram executados novamente 50 testes direcionados (atomic-order-persistence, order-checkout-service, checkout-attempt): todos passaram. Cobrem entrega/complemento e cupom pelo servidor/SQL real em PostgreSQL local, rollback por falha no segundo item ou no uso de cupom, falha de leitura após commit com recuperação, replay sem duplicação, conflito de conteúdo, loja fechada, catálogo alterado e persistência da tentativa/comprovante. Usam dados fictícios. Ainda não são testes de duas conexões remotas concorrentes ou cliques reais.

Correção local adicional: o detalhe do pedido no painel agora exibe complemento e bairro/região do snapshot salvo. Consultas existentes já carregavam essas colunas. A tipagem do ícone deixou de usar any. TypeScript e build passaram; lint do componente sem erros, com cinco avisos anteriores. Servidor local recompilado e reiniciado na porta 3010. Produção permanece inalterada.

### Entrega confirmada no banco — pedido 002

O usuário apresentou o painel publicado com pedido 002, TESTE CHECKOUT, Delivery, R$19, preservando o pedido 001 de retirada. SELECT somente de leitura limitado à loja teste1 e pedido 2 confirmou fluxo novo (hash válido/contagem esperada), um item X baco de R$14, frete R$5, zona Teste, total R$19 e endereço/complemento de teste preenchidos e persistidos. Status pending, handoff whatsapp_opened. A escolha de manter o nome TESTE CHECKOUT não invalida o teste. Nenhuma escrita realizada pela conferência.

Entrega/frete e persistência do complemento foram confirmados no Supabase real. O print não mostra detalhe do pedido, conteúdo da mensagem nem carrinho após recarregar; a exibição do complemento acrescentada localmente continua sem confirmação visual. O painel mostrado é produção, ainda anterior à correção local. Recuperação após falha passou nos testes locais, não foi demonstrada no navegador ou em duas conexões remotas.

### Login local: ajuste de redirecionamento pendente

O usuário relatou que o link de login por e-mail abre produção, impedindo conferir o painel local. Revisão do código confirmou que login-client envia emailRedirectTo = window.location.origin + /auth/callback e o callback navega para /admin no mesmo domínio. Não há URL de produção fixa nesse fluxo. A lista de URLs autorizadas e o template remoto do Supabase não foram inspecionados; falta de autorização do callback local é a hipótese principal, não diagnóstico remoto confirmado.

Manter o login por magic link. No Supabase, Authentication > URL Configuration > Redirect URLs, adicionar exatamente http://teste1.localhost:3010/auth/callback, preservando Site URL e URLs de produção. Solicitar um link NOVO a partir de http://teste1.localhost:3010/admin/login e abri-lo no mesmo navegador/contexto que iniciou a solicitação (PKCE). Se continuar voltando para produção, conferir o template Magic Link quanto a URL fixa/SiteURL antes de alterar. Não pedir ao usuário tokens ou links de autenticação completos. Não desligar confirmação de e-mail: o link é o mecanismo de login sem senha.

O agente não dispõe de acesso ao painel/configuração Auth via ferramenta e a automação visual falha; o ajuste remoto precisa ser feito pelo usuário. Não houve alteração de auth, bypass, geração de sessão/token ou envio de e-mail pelo agente.

### Detalhe local confirmado visualmente — pedido 002

O usuário apresentou captura em http://teste1.localhost:3010/admin/pedidos com detalhe 002: complemento preenchido visível, Bairro / Região Teste, 1 X baco R$14, subtotal R$14, frete R$5 e total R$19. Confirmados acesso ao painel local e renderização da correção. A captura não comprova qual ajuste remoto de Auth foi aplicado nem o percurso completo do link por e-mail; não afirmar configuração remota inspecionada ou confirmação desativada. Carrinho após recarregar e mensagem preparada ainda não foram confirmados visualmente. Recuperação de falha passou automaticamente, teste visual adicional permanece opcional.

### Mensagem e carrinho confirmados — pedido 003

O usuário apresentou o aviso Pedido registrado, o carrinho vazio no cardápio local e o texto preparado para WhatsApp do pedido 003: uma unidade de Teste R$15, zona Teste, endereço e complemento preenchidos, PIX, frete R$5 e total R$20. SELECT somente de leitura limitado à loja teste1 e pedido 3 confirmou hash do novo fluxo, expected_item_count=1/actual=1, o mesmo produto/preço, frete/bairro/endereço/complemento e total da mensagem. Estado pending e handoff whatsapp_opened; envio da mensagem não foi comprovado e não é necessário para registro. Nenhuma escrita realizada pelo agente.

A rodada manual básica do checkout está validada: registro e aviso, retirada, entrega/frete/complemento, detalhe local, conteúdo da mensagem e carrinho vazio. A captura mostra o resultado vazio, não o evento de recarga em si. Recuperação de falha pós-commit e replay passaram nos testes automáticos; o exercício visual de rede indisponível, duas conexões concorrentes, catálogos complexos no ambiente real e impressão física continuam fora desta evidência. Esses limites não impedem preparar o módulo em etapas, mas não autorizam considerar a impressão automática validada.

### Teste manual 1: carrinho e pedido já concluído

1. No cardápio local, fechar o aviso e recarregar a página.
2. Abrir o carrinho: deve estar vazio. O comprovante pode continuar disponível até ser dispensado; isso não cria pedido.
3. Atualizar o painel e conferir que o teste anterior continua como pedido 001. Recarregar, abrir o aviso ou abrir o WhatsApp não devem criar outro pedido.

### Teste manual 2: entrega com complemento

1. Entrar com a conta teste1 no painel local http://teste1.localhost:3010/admin/pedidos. No menu Zonas de Entrega, clicar Nova Zona.
2. Cadastrar Nome do Bairro Teste, taxa 5,00, salvar e conferir que está ativo. Essa configuração e o pedido serão gravados no Supabase real da loja de teste.
3. Recarregar http://teste1.localhost:3010 e adicionar uma unidade do produto de R$14.
4. Selecionar Entrega; nome TESTE ENTREGA; telefone válido de teste; Bairro Teste; Endereço Completo Rua Teste, 123; Complemento Apto 42, bloco B.
5. Escolher cartão ou PIX. Sem cupom, conferir item R$14 + frete R$5 = total R$19. Finalizar uma vez.
6. Conferir aviso Pedido registrado. Na mensagem preparada para WhatsApp, conferir endereço, complemento, bairro, frete e total. Não é necessário enviar a mensagem.
7. No painel LOCAL, atualizar, abrir o novo pedido e conferir item, total, complemento e bairro. O painel publicado não contém a correção visual local.
8. Informar o número do pedido. O agente pode confirmar pedido/itens/endereço/frete/complemento com SELECT limitado à loja e aos nomes de teste: npx tsx scripts/verify-checkout-readonly.ts teste1 NUMERO.

### Teste manual opcional 3: falha de conexão antes do envio

Esse teste verifica a recuperação na interface; o caso de commit concluído e resposta perdida já passou nos testes automáticos.

1. Usar Chrome com o cardápio local aberto. Montar outro pedido de retirada de uma unidade de R$14; nome TESTE RECUPERACAO, telefone de teste e cartão. Chegar à última etapa antes de finalizar.
2. Abrir DevTools (F12), aba Network/Rede; no seletor de velocidade, mudar para Offline. Não desligar o computador nem parar o servidor local.
3. Clicar para finalizar e aguardar o erro. O carrinho deve conservar o item e a tentativa; essa requisição bloqueada não deve criar pedido.
4. Mudar imediatamente de Offline para No throttling/Sem limitação. Manter produto, dados e pagamento iguais.
5. Recarregar, reabrir o carrinho e procurar Conferir tentativa anterior na etapa de pagamento. Clicar uma vez; a tentativa deve concluir com um único pedido. Se não houver esse botão, informar a tela/erro antes de criar uma nova tentativa.
6. Conferir número, item e total no painel. Recarregar novamente: item concluído não deve voltar ao carrinho e não deve aparecer outro pedido.
7. Informar número e eventual mensagem de erro. Nenhum teste manual precisa enviar mensagem ou acionar impressão.

Depois desses testes, avançar no módulo em etapas: definir contrato do recibo e reserva da fila, revisar autorização/snapshots/numeração que afetam impressão, painel atualizado e teste físico controlado na Epson. A ativação automática ainda exige isolamento, exclusividade, reinício/reconexão e tratamento do resultado incerto após envio ao spooler. Não considerar a bateria local como comprovação de concorrência remota ou impressão física.

Próximas etapas da base: revisão das consultas públicas/colunas administrativas e Storage, proteção/versionamento dos snapshots e numeração monotônica. Atualização automática do painel, fila de impressão, deduplicação e serviço local da Epson seguem pendentes. Não acionar impressão a partir do evento legado de orders nem imprimir pedidos antigos automaticamente.
