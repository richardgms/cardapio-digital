# Piloto de impressão com instalação assistida

Decisão do operador em 08/10/2026: iniciar com instalação assistida e instalador sem assinatura, sem compra de certificado nesta fase. Esta decisão substitui a exigência de assinatura prévia para o piloto nos planos anteriores. A distribuição pública do executável e a assinatura continuam como etapas futuras.

## Versão conferida

- Arquivo: `public/printing/RMenu-Instalar.exe`.
- Assinatura Authenticode: `NotSigned`.
- SHA-256: `1EC37CFFDCB87D3C4A72C525D0F3E97BC0D3ACE29A34A6F9EE007671F8803346`.
- O hash identifica o arquivo conferido e permite comparar a cópia recebida; não substitui assinatura, reputação ou verificação de segurança.
- O executável continua excluído do Git, da publicação Vercel e do cache PWA. Compartilhar a cópia conferida diretamente com cada participante do piloto pelo canal combinado.

A ativação pelo lojista já foi validada em produção na teste1: confirmação física no assistente atualizado, confirmação no painel, desativação e reativação às 22:44:11 em 08/10/2026 (America/Sao_Paulo). O pedido fictício #016 foi posterior à ativação, teve um trabalho com uma tentativa e foi confirmado pelo operador como legível, uma via e corte automático. O modo da loja foi conferido como `self_service`. Isso valida a combinação observada Epson TM-T20X, USB e papel de 80 mm; não valida outros equipamentos.

## Acompanhamento do primeiro restaurante

1. Confirmar Windows 10/11 antes de instalar. O assistente lista as impressoras instaladas no Windows; conhecer o modelo antes de enviar o arquivo ajuda, mas não é obrigatório. Durante a instalação, conferir impressora, conexão, driver e largura real do papel. Não reutilizar a configuração da teste1 em outra loja.
2. Conferir que o arquivo compartilhado corresponde ao hash desta versão. Se recompilado, revisar e registrar o novo arquivo antes de distribuir.
3. Acompanhar a abertura. Diante de aviso do Windows, conferir a mensagem e a origem do arquivo. Se o próprio aviso oferecer uma opção de execução, a decisão depende da conferência do arquivo e do responsável pelo computador. Não desligar Defender, Smart App Control, antivírus ou políticas do computador para viabilizar o piloto. Um bloqueio sem opção de execução pode impedir esta modalidade de instalação.
4. Seguir [o guia do restaurante](../printing/guia-do-restaurante.md), com configuração exclusiva do dispositivo, um teste fictício e confirmação física antes de ativar pedidos novos.
5. Conferir uma única impressão automática de pedido fictício criado depois da ativação, início após entrada no Windows e operação com navegador fechado. O suporte acompanha o restaurante antes de ampliar o uso.

Se uma impressão ficar incerta, conferir papel e fila antes de qualquer reimpressão. Não apagar registros locais nem repetir automaticamente testes ou pedidos para tentar resolver. Instalação assistida não remove as barreiras de autorização, isolamento entre lojas e confirmação do equipamento.

## Caminho futuro sem certificado comprado

A Microsoft Store pode assinar gratuitamente um pacote MSIX após certificação, mas não assina gratuitamente um instalador EXE/MSI enviado por essa modalidade. A conta individual possui um fluxo gratuito de cadastro. O assistente atual precisa de análise de compatibilidade e adaptação antes de qualquer promessa de publicação: ele inicia PowerShell, opera em segundo plano e configura a inicialização com o Windows. Não basta renomear ou empacotar o EXE para garantir aprovação.

Referências oficiais consultadas em 08/10/2026:

- [SmartScreen e executáveis sem assinatura](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
- [Assinatura gratuita para MSIX distribuído pela Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).
- [Cadastro gratuito para desenvolvedor individual](https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer).
- [Compatibilidade de aplicativos desktop com MSIX](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare).
