FROM node:22-slim

WORKDIR /app
COPY package.json ./
COPY server.mjs ./

ENV PORT=8080
ENV INGEST_DATA_DIR=/data/ingest

RUN mkdir -p /data/ingest
VOLUME /data/ingest

EXPOSE 8080

CMD ["node", "server.mjs"]
