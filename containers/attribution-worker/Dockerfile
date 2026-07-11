FROM node:26-slim

WORKDIR /app

# Install dependencies (shared implementation + container runtime).
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY implementation ./implementation
# The whole containers dir is copied so the attribution server can reuse the
# ingest container's R2 S3 adapter (containers/ingest-worker/r2-bucket.ts)
# without duplicating it.
COPY containers ./containers

ENV PORT=8082
ENV CONTAINER_NAME=common-thread-attribution

EXPOSE 8082

# Run as the unprivileged `node` user (uid 1000, shipped by the base image)
# rather than root (#33). The executor reads its bundled code, reaches MySQL and
# R2, and calls the AI Gateway; a read-only rootfs at runtime is fine.
USER node

CMD ["npx", "tsx", "containers/attribution-worker/server.ts"]
