FROM node:20-slim

# Instala o Chromium e as dependências necessárias para o Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    libxshmfence1 \
    libglu1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Variáveis para o Puppeteer usar o Chromium instalado pelo apt-get
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3001

CMD ["node", "server.js"]
