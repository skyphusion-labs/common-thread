FROM node:26-slim

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

# Run as the unprivileged `node` user (uid 1000, shipped by the base image)
# rather than root (#33). The server only reads its bundled code and talks out
# over the network, so a read-only rootfs at runtime is fine.
USER node

CMD ["npx", "tsx", "containers/ingest-worker/server.ts"]
