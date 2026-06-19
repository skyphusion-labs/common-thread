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

# Run as the unprivileged `node` user (uid 1000, shipped by the base image)
# rather than root (#33). wkhtmltopdf + ghostscript run fine non-root; they
# write only under os.tmpdir() (/tmp), provided as a writable tmpfs at runtime.
USER node

CMD ["npx", "tsx", "containers/pdf-worker/server.ts"]
