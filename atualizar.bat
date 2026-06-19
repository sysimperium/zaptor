@echo off
chcp 437 >nul
title Zapptor - Atualizador
cd /d "%~dp0"

echo.
echo  ==========================================
echo     ZAPPTOR - ATUALIZACAO DO SISTEMA
echo  ==========================================
echo.
echo  Pasta: %~dp0
echo  Iniciando... aguarde.
echo.

docker info >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Docker nao esta rodando!
    echo  Abra o Docker Desktop e tente novamente.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0zapping-backend.tar" (
    echo  [ERRO] zapping-backend.tar nao encontrado!
    echo  Coloque o arquivo na mesma pasta do bat.
    echo.
    pause
    exit /b 1
)

REM === LIMPEZA COMPLETA ===
echo  [1/3] Removendo todos os containers nas portas 3001 e 8080...

REM Para e remove por nome
docker stop zapptor-backend >nul 2>&1
docker stop zapptor-frontend >nul 2>&1
docker rm -f zapptor-backend >nul 2>&1
docker rm -f zapptor-frontend >nul 2>&1

REM Busca qualquer container na porta 3001 e remove (via arquivo temp)
docker ps -q --filter "publish=3001" > "%TEMP%\zapptor_kill.tmp" 2>nul
for /f "usebackq" %%i in ("%TEMP%\zapptor_kill.tmp") do (
    echo  Removendo container na porta 3001: %%i
    docker rm -f %%i >nul 2>&1
)
del "%TEMP%\zapptor_kill.tmp" >nul 2>&1

REM Busca qualquer container na porta 8080 e remove (via arquivo temp)
docker ps -q --filter "publish=8080" > "%TEMP%\zapptor_kill.tmp" 2>nul
for /f "usebackq" %%i in ("%TEMP%\zapptor_kill.tmp") do (
    echo  Removendo container na porta 8080: %%i
    docker rm -f %%i >nul 2>&1
)
del "%TEMP%\zapptor_kill.tmp" >nul 2>&1

echo        OK.
echo.

echo  Aguardando liberacao das portas...
timeout /t 5 /nobreak >nul
echo.

echo  [2/3] Verificando rede Docker...
docker network create zapptor-net >nul 2>&1
echo        OK.
echo.

echo  [3/3] Carregando backend - pode demorar varios minutos...
docker load -i "%~dp0zapping-backend.tar"
if errorlevel 1 (
    echo  [ERRO] Falha ao carregar zapping-backend.tar
    pause
    exit /b 1
)
echo.

echo  Iniciando Zapptor (Backend + Proxy Reverso)...

docker run -d --name zapptor-backend --network zapptor-net -p 3001:3001 -p 8080:3001 -e FRONTEND_URL=https://zapping-frontend.vercel.app -v "%~dp0backend\.wwebjs_auth:/app/.wwebjs_auth" --restart unless-stopped zapping-backend:latest

if errorlevel 1 (
    echo.
    echo  [ERRO] Falha ao iniciar o backend!
    echo  Containers rodando atualmente:
    docker ps
    echo.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo     ATUALIZACAO CONCLUIDA COM SUCESSO!
echo     Acesse: http://localhost:8080
echo  ==========================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:8080
pause
