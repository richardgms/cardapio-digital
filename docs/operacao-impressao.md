# Impressão de pedidos: operação e instalação

Atualizado em 10/10/2026, com base na publicação e nos ensaios concluídos em 08/10.
Histórico completo: [changelog](changelog.md).

## O que está disponível

O lojista cadastra seu computador e impressora em **Impressão**, importa a configuração
exclusiva no assistente Windows, confere a conexão e imprime uma comanda fictícia.
Depois de conferir o papel, confirma no assistente e conclui. O painel apresenta
o teste confirmado e o computador conectado; o proprietário pode ativar somente
pedidos novos. Não precisa pedir uma liberação individual ao suporte para essa ativação.

Cada restaurante começa desligado. Publicar código ou aplicar migrações não ativa
impressão. Cada computador precisa de sua própria credencial e teste. Não reutilizar
a configuração da teste1 ou de outro restaurante.

## Instalação assistida

Nesta fase, o suporte acompanha a instalação do executável sem assinatura no
Windows 10/11. O instalador lista as impressoras instaladas no Windows; saber o
modelo antes de enviar o arquivo ajuda o suporte, mas não é um requisito obrigatório.
Driver, largura real do papel, legibilidade, uma via e corte precisam ser conferidos
no computador que será usado. A Epson TM-T20X USB/80 mm foi validada fisicamente;
selecionar 58 mm no assistente não significa que essa largura já foi validada em campo.

O Windows pode apresentar aviso ou bloquear a abertura do instalador. Conferir origem
e arquivo com o suporte, sem desligar Defender, antivírus ou políticas do computador.
O executável não é oferecido automaticamente no deploy nem no PWA. Siga o
[guia do restaurante](../printing/guia-do-restaurante.md) e o
[plano de instalação assistida](../plans/piloto-assistido-impressao.md).

## Uso diário e falhas

- Manter computador ligado, usuário Windows conectado e impressora pronta. O agente
  pode iniciar ao entrar no Windows e funciona com o navegador fechado.
- **Pausar neste computador** interrompe o agente local. **Desativar impressão** no
  painel interrompe a geração automática de novos trabalhos da loja.
- Rede indisponível, suspensão do computador ou impressora sem papel podem atrasar
  a operação. Após recuperar, conferir papel, fila do Windows e painel antes de pedir
  outra via. Não apagar journals nem repetir automaticamente um envio incerto.
- `spooler_submitted` informa que o Windows aceitou o trabalho; não comprova que o
  papel saiu. Impressão e forma de pagamento informada não confirmam pagamento.
- Troca de computador, fila ou largura exige cadastro e teste da nova configuração.
  Revogar no painel a credencial de um dispositivo perdido.

## Validação concluída e pendente

Na teste1, foram conferidos impressão automática, navegador fechado, outro celular,
reinício do Windows, recuperação de rede e impressora, instalação nova e atualização
do PWA Android, e ativação pelo lojista após teste físico. Uma única via e corte
foram confirmados pelo operador; os trabalhos correspondentes tiveram uma tentativa.

Ainda faltam operação prolongada no primeiro restaurante, outros equipamentos e
58 mm, agentes para macOS/Linux, migração física de PWA antigo Workbox e distribuição
pública do instalador. Nenhum desses itens deve ser anunciado como validado.
