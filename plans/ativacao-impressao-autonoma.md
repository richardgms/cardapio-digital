# Ativação da impressão pelo restaurante

Estado consolidado em 10/10/2026: migrações 04 e 05 verificadas, PR #2 integrado,
servidor publicado e flag autônoma habilitada. Na teste1, assistente atualizado,
confirmação física e ativação pelo dono foram validados com o pedido fictício #016,
uma via legível com corte e uma tentativa. A publicação não ativa novas lojas.
Veja [changelog](../docs/changelog.md) e [operação](../docs/operacao-impressao.md).

O dono pode configurar o computador, enviar uma comanda fictícia no assistente,
confirmar o papel e ativar somente pedidos novos no próprio painel. Não precisa
liberação individual por UUID no modo autônomo publicado e habilitado.
Nenhuma migração ou publicação ativa lojas automaticamente.

## Barreiras implementadas

| Risco | Mitigação | Limite prático |
| --- | --- | --- |
| Marcar a caixa sem testar | Ação do servidor exige prova registrada para dispositivo autenticado e conectado nos últimos cinco minutos | A conferência física é declaração humana; o servidor não vê o papel |
| Fila ou papel diferentes | Prova vinculada à credencial, loja, fila e largura de 58/80 mm | Troca de equipamento exige novo cadastro e teste; aparecer no Windows não garante compatibilidade |
| Outra loja acessar ou ativar | Identidade do proprietário obtida da sessão; RPCs e prova privadas, RLS habilitada e forçada | Credencial do computador deve continuar protegida por DPAPI |
| Dois testes ou ativações simultâneos | Mutex e journal local antes do envio; transições SQL e bloqueio da loja; ativação repetida preserva corte | Resposta incerta após autorização exige suporte; não reenviar nem apagar journal |
| Internet cair depois de imprimir | Registro local preservado; conclusão repete somente reconhecimento, nunca envio físico | A pessoa precisa conferir papel e fila antes de confirmar |
| Computador adicional imprimir sem testar | Lojas autônomas exigem prova no claim e no início do dispatch para cada dispositivo | Revogar o dispositivo perdido no painel |
| Interromper uma instalação existente | Coluna nova começa em `managed`; não altera enabled, cutoff, jobs ou credenciais | Instalações anteriores continuam no fluxo já validado até migração voluntária |
| Assistente antigo afirmar prova nova | Servidor emite desafio e só aceita a sequência solicitada pelo agente autenticado | Cliente anterior não registra a nova prova; precisa atualizar assistente |
| Publicação incompleta | Flag `RMENU_PRINT_SELF_SERVICE` ausente por padrão; ativação falha fechada se RPC/prova indisponíveis | Manter flag desligada até banco, servidor e assistente validados |
| Instalação insegura ou sem suporte | Instalador não assinado excluído de Git, Vercel e cache PWA; piloto acompanhado pelo suporte | Epson USB/80 mm validada em Windows; outros equipamentos, macOS/Linux e distribuição pública pendentes |

## Publicação em ordem

Etapas 1 a 7 concluídas na teste1. A sequência fica como referência histórica de
implantação, sem necessidade de reaplicar as migrações ou repetir o pedido #016.

1. A migração anterior `2026100804_private_store_configuration.sql` foi aplicada
   pelo operador e verificada: quatro checks verdadeiros, `all_passed=true`, uma
   loja ativa e nenhuma ativação pela consulta. Depois da aplicação, seis domínios
   passaram no ensaio público/PWA sem login e o health do agente instalado confirmou
   conexão, sem reservar ou imprimir. Evidência local:
   `printing/.local/private-config-publication-verification.json`.
   A composição das migrações 04 e 05 também passou nos testes SQL/API e no ensaio
   integrado de HTTP, agente Windows e PostgreSQL nativo.
2. Revisar e aplicar `2026100805_print_self_service.sql` no SQL Editor; é transacional
   e aditiva. Executar `verify-print-self-service-readonly.sql`: todos os checks devem
   ser verdadeiros. Manter a flag nova desligada.
3. Publicar o código revisado; manter as flags existentes e a lista manual anterior.
4. Atualizar o assistente no computador de teste: pausar o RMenu Impressão e esperar
   a tentativa corrente terminar antes de instalar. Não revogar a credencial, remover
   configuração ou apagar journals para repetir teste. Não alterar a instalação real
   durante testes automatizados.
5. Habilitar `RMENU_PRINT_SELF_SERVICE=1` apenas no ambiente de ensaio primeiro;
   exige também `RMENU_PRINT_AGENT_ENABLED=1` e `RMENU_PRINT_ACTIVATION_READY=1`.
   Em seguida habilitar em produção quando banco, código e assistente estiverem
   preparados. Habilitar a flag permite o fluxo; não ativa impressão de nenhuma loja.
6. No assistente atualizado: conferir conexão, imprimir uma via fictícia, conferir
   legibilidade/largura/corte, marcar confirmação e concluir. Conferir no painel
   “Teste de impressão confirmado” e “Computador conectado”.
7. Ativar pedidos novos e criar apenas um pedido fictício autorizado. Confirmar
   uma via, corte e um único job/tentativa. Não reenfileirar pedidos antigos.
8. Acompanhar instalação no primeiro restaurante conforme
   [piloto assistido](piloto-assistido-impressao.md), com executável sem assinatura
   nesta fase e instruções claras. Validar a impressora e observar um turno completo.
   Distribuição pública e assinatura permanecem futuras. Impressão não confirma pagamento.

## Recuperação

Desativar impressão permanece disponível mesmo quando a conferência estiver indisponível.
Desligar a flag devolve a regra de liberação manual para novas ativações; não apaga
provas ou ativações já existentes. Conservar a migração 05 e as barreiras de claim e
dispatch: reinstalar o SQL antigo removeria essas proteções. Uma atualização do
servidor não reinicia o agente Windows instalado.

Se o teste ficar incerto antes de enviar ou expirar, conferir fila e papel e solicitar
suporte para nova configuração. Nunca usar remoção de journal como solução. Uma falha
física de impressora continua possível; não há garantia de ausência absoluta de falhas.

## Evidências locais

- Testes SQL/API: `tests/print-self-service.test.mjs`.
- Ações autenticadas e flags: `tests/print-activation.test.mjs`.
- Assistente sem rede/papel: `printing/windows/Test-SelfService.ps1`.
- HTTP real, agente Windows e PostgreSQL nativo, 80/58 mm, concorrência com bloqueios
  observados e revogação: `tests/print-self-service-integration.mjs`.
- Evidências, credenciais fictícias e executável sem assinatura ficam ignorados em
  `printing/.local` e `public/printing`; não são publicados automaticamente.
