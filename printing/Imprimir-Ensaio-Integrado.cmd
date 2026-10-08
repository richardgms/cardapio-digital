@echo off
setlocal
cd /d "%~dp0.."
echo UMA comanda ficticia na EPSON TM-T20X Receipt, rolo de 80 mm.
echo Nao ativa a loja nem usa pedidos reais. Nao repetir apos envio incerto.
set /p rmenuTrialAnswer=Digite IMPRIMIR somente se estiver pronto para conferir papel e corte: 
if /i not "%rmenuTrialAnswer%"=="IMPRIMIR" exit /b 0
call npm run test:print-integrated -- --send
pause
