@echo off
setlocal
cd /d "%~dp0.."
echo Ensaio ficticio local: API, fila, agente e previa. Nao envia papel.
call npm run test:print-integrated
pause
