@echo off
chcp 437 >nul
title Zapptor - Exportar Imagens para o Cliente
cd /d "%~dp0"

echo.
echo  ==========================================
echo     ZAPPTOR - EXPORTACAO DE IMAGENS DOCKER
echo  ==========================================
echo.
echo  Pasta: %~dp0
echo  Verificando se o Docker esta rodando...
echo.

docker info >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Docker nao esta rodando!
    echo  Abra o Docker Desktop e tente novamente.
    echo.
    pause
    exit /b 1
)

echo  [1/2] Reconstruindo a imagem local (Backend)...
echo  Aguarde, isso pode demorar alguns minutos...
echo.

docker compose build

if errorlevel 1 (
    echo.
    echo  [ERRO] Falha ao construir as imagens do Docker!
    echo.
    pause
    exit /b 1
)

echo.
echo        OK - Imagem construida com sucesso.
echo.

echo  [2/2] Exportando Imagem do Backend para zapping-backend.tar...
echo  Aguarde...
echo.
if exist "zapping-backend.tar" del /f "zapping-backend.tar"
docker save -o zapping-backend.tar zapping-backend:latest

if errorlevel 1 (
    echo.
    echo  [ERRO] Falha ao exportar zapping-backend.tar!
    echo.
    pause
    exit /b 1
)

echo.
echo        OK - Backend exportado.
echo.

echo  ======================================================
echo     EXPORTACAO CONCLUIDA COM SUCESSO!
echo  ======================================================
echo.
echo  Arquivo gerado na pasta:
echo   - zapping-backend.tar
echo.
echo  Basta copiar este arquivo e os scripts (.bat)
echo  para o computador do cliente e rodar o "atualizar.bat" la!
echo.
pause
