FROM ghcr.io/puppeteer/puppeteer:21.5.0

USER root
RUN apt-get update && apt-get install -y \
    libxshmfence1 \
    libglu1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Variáveis para otimizar memória no Render Free
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3001

CMD ["node", "server.js"]
