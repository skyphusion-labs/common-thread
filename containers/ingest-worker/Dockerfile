FROM node:22-slim

WORKDIR /app

# Install dependencies (shared implementation + container runtime).
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY implementation ./implementation
COPY containers/ingest-worker ./containers/ingest-worker

ENV PORT=8080
ENV CONTAINER_NAME=common-thread-ingest

EXPOSE 8080

CMD ["npx", "tsx", "containers/ingest-worker/server.ts"]
