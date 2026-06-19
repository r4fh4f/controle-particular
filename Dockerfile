# Imagem para deploy no EasyPanel (VPS Hostinger)
FROM node:20-bookworm-slim

# better-sqlite3 precisa compilar: ferramentas de build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
ENV DB_PATH=/app/data/controle.db
EXPOSE 3000

# /app/data DEVE ser um volume persistente (onde fica o banco)
VOLUME ["/app/data"]

CMD ["node", "server.js"]
