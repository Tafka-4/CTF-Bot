FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json .

RUN npm install -g typescript

RUN npm install

RUN curl -fsSL -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  && chmod +x /usr/local/bin/cloudflared

COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 3002

ENTRYPOINT ["/app/entrypoint.sh"]
