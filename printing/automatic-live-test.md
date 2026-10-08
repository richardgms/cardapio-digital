# Ensaio da impressão automática no Supabase

Concluído: o usuário confirmou explicitamente “Sim: legível, uma via e corte automático” para o pedido fictício #004. A confirmação está preservada no relatório do ensaio. A impressão terminou desligada.

Em 08/10/2026, o usuário autorizou uma nova comanda fictícia pela fila real da loja `teste1`. A preparação confirmou agente instalado/credencial DPAPI, health no aplicativo Next local, Epson TM-T20X disponível, rolo 80 mm, fila Windows vazia, um dispositivo ativo, zero jobs e impressão desligada.

O ensaio `node --import tsx tests/print-automatic-live.mjs --send` passou nas verificações de software. Ativou temporariamente somente `teste1` pela RPC privada existente, com service_role no servidor de teste; não liberou a ativação geral no painel nem alterou `.env.local`. Criou o pedido fictício **#004, R$ 14,00**, pelo serviço real `submitCheckout`, com cálculo do catálogo e persistência pelo PostgREST/Supabase. Não abriu nem enviou WhatsApp e não alterou produtos.

A transação criou automaticamente um único job inicial. A ativação excluiu os três pedidos históricos. O `Run-Agent.ps1` real consumiu a API Next local com a configuração instalada e credencial protegida, em um único ciclo e limitado ao UUID do pedido fictício. Enviou pela fila Epson e terminou com `spooler_submitted`, uma tentativa. Uma segunda execução do agente reconciliou os journals e não enviou outra via. O journal contém `dispatch_intent`, `dispatch_authorized`, `spooler_submitted`, `acknowledged`; eventos remotos: `pending`, `leased`, `dispatching`, `spooler_submitted`.

O `finally` desligou a impressão e uma consulta posterior confirmou `enabled=false`. A fila Windows terminou vazia. O painel recebeu o pedido pela atualização automática e mostrou “Via inicial: Enviado ao spooler; papel não confirmado”. A confirmação física do operador fica no relatório; submissão/ACK não substituem a conferência do papel.

Evidências locais sem credenciais:

- `printing/.local/automatic-live-preflight.json`
- `printing/.local/automatic-live-verification.json`
- `printing/.local/automatic-live-panel.png`
- `printing/.local/automatic-live-80mm.json`, marcador que bloqueia novo envio; preservar.

O pedido/documento/job e o journal instalado permanecem como auditoria do ensaio. Nunca apagar marcadores ou journals para repetir papel. O runner tem escopo fixo nesta primeira fixture e não serve para novas lojas ou para ativação permanente.

Foram reexecutadas as 23 verificações Windows sem spool e o lint do novo runner. O parâmetro opcional `-ExpectedOrderId` exige `-Send -Once` e bloqueia despacho de outro pedido/reimpressão antes do Core. Um job divergente não é finalizado pelo agente; sua reserva expira. O ZIP contém a versão atual do agente, sem scripts de ensaio remoto ou segredos.

Limites: o ensaio validou ciclos únicos do agente, não operação contínua de longa duração, inicialização com Windows, queda física durante spool ou hardware 58 mm. O pedido foi criado pelo serviço do checkout via CLI, não por navegação nova do cliente no navegador. Não houve publicação Vercel, alteração de flags do processo Next nem aplicação da migração 2026100804. A ativação geral permanece bloqueada; liberação contínua exige publicação/configuração coerente e validação na máquina do restaurante.

A CLI Vercel instalada foi confirmada em versão 62.7.0, com `vercel whoami` retornando `richardgms`. Não é necessário instalar ou fazer login novamente. A publicação é uma etapa separada.
