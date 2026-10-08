# Concorrência da fila em PostgreSQL nativo

Dependências de teste separadas do aplicativo. Este runtime é para Windows x64; não instala serviço nem cria usuário Windows. Os executáveis vêm do pacote [embedded-postgres](https://github.com/leinelissen/embedded-postgres), versão fixada no lockfile. A distribuição Windows inspecionada não contém symlinks; a instalação usa `--ignore-scripts`.

```powershell
npm ci --prefix tests/postgres-runtime --ignore-scripts --no-audit --no-fund
npm run test:print-concurrency
```

O runner inicia um cluster novo em `printing/.local/postgres-concurrency-*`, acessível somente por `127.0.0.1`, em uma porta temporária. Usa autenticação trust nesse cluster fictício local. Não aceita URL de banco, não carrega `.env`, não acessa Supabase e não envia papel. Ao terminar, fecha as conexões e encerra o servidor, preservando logs/dados fictícios ignorados pelo Git para diagnóstico.

A fixture compartilhada recebe um adaptador `pg`; os testes anteriores continuam usando PGlite por padrão. Aplica as migrações reais 2026100703, 2026100801 e 2026100802 sobre o schema reduzido. A numeração/checkout usa as funções de referência existentes. As duas sessões operacionais têm papel `service_role`; a terceira sessão administrativa apenas prepara a fixture e observa os locks.

Cada disputa mantém a transação A aberta, inicia a operação B e exige que `pg_blocking_pids` comprove B bloqueada por A antes do commit. Os 14 checks cobrem conexões distintas, reserva exclusiva, dois jobs, replay concorrente de checkout, numeração, dispatch único, recuperação de lease, resultado incerto, ACK idempotente, cancelamento nos dois sentidos, desativação, revogação e reimpressão auditada.

Resultado de 08/10/2026: 14/14 passaram em PostgreSQL 18.4; servidor encerrado. Evidência desta execução: `printing/.local/postgres-concurrency-oy7nzd/verification.json`. As 52 regressões afetadas também passaram (fila 19, API 10, documentos/recibos 23), além do lint dos testes.

A primeira tentativa não conectou por restrição TCP do sandbox; o servidor foi encerrado. Após liberar a execução local, a checagem de endereço precisou usar `host(inet_server_addr())`, pois o cast para text inclui `/32`. A execução final passou. Esses ajustes foram no ambiente de teste, sem mudança no SQL da fila.

Esta evidência comprova concorrência local entre conexões PostgreSQL reais com as migrações testadas. Não equivale a uma execução concorrente no servidor Supabase, nem cobre o schema completo de produção, upload real do Storage, API HTTP/Windows em conjunto ou confirmação física. O ensaio integrado fictício continua pendente; impressão real permanece desligada.
