FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV SKLAD_DATA_DIR=/app/data

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["npm", "run", "start"]
