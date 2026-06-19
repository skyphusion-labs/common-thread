FROM node:22-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    wkhtmltopdf \
    ghostscript \
    fontconfig \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY implementation ./implementation
COPY containers/pdf-worker ./containers/pdf-worker

ENV PORT=8081
ENV CONTAINER_NAME=common-thread-pdf

EXPOSE 8081

CMD ["npx", "tsx", "containers/pdf-worker/server.ts"]
