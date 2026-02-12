FROM node:22-slim

RUN useradd -m -s /bin/bash agent

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

RUN chown -R agent:agent /app
USER agent

EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
