@echo off
echo =======================================================
echo Iniciando Sistema ZappTor Intranet - WhatsApp Central
echo =======================================================
echo.
echo Verificando se o Docker esta rodando...

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] O Docker Desktop nao esta rodando!
    echo Por favor, abra o programa 'Docker Desktop' no seu computador, espere ele carregar e tente novamente.
    pause
    exit
)

echo.
echo Verificando imagens do sistema...
set precisa_carregar_backend=0
set precisa_compilar=0

docker image inspect zapping-backend:latest >nul 2>&1
if %errorlevel% neq 0 (
    set precisa_carregar_backend=1
)

if %precisa_carregar_backend%==1 (
    if exist zapping-backend.tar (
        echo [INFO] Importando imagem do Backend (zapping-backend.tar)...
        echo Isso pode levar de 1 a 2 minutos. Aguarde...
        docker load -i zapping-backend.tar
    ) else (
        echo [AVISO] zapping-backend.tar nao encontrado.
        set precisa_compilar=1
    )
)

echo.
echo Iniciando o Servidor (Backend com Proxy Reverso)...
if "%precisa_compilar%"=="1" (
    docker compose up -d --build
) else (
    docker compose up -d
)

echo.
echo =======================================================
echo [SUCESSO] O ZappTor Esta Rodando em Segundo Plano!
echo =======================================================
echo.
echo PARA ACESSAR A INTERFACE (Qualquer PC na rede):
echo 1. Descubra o IP deste Servidor (ex: 192.168.1.50)
echo 2. Abra o navegador nos clientes e digite: http://IP_DO_SERVIDOR:8080
echo.
echo (Para acessar neste proprio PC, basta abrir http://localhost:8080)
echo.

set /p escaneou="Voce precisa ver os logs do sistema para Escanear o QR Code de Login do WhatsApp? (S/N): "
if /i "%escaneou%"=="S" (
    echo.
    echo Abrindo tela de registros do Servidor do WhatsApp...
    echo (Para sair desta tela sem desligar o servidor, pressione CTRL+C)
    docker logs -f zapptor-backend
) else (
    echo Janela pode ser fechada. Bom trabalho!
    pause
)
