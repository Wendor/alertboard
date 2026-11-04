FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production \
    LISTEN=0.0.0.0:8080
WORKDIR /app
COPY --from=server /app/server/package.json server/
COPY --from=server /app/server/node_modules server/node_modules
COPY --from=server /app/server/dist server/dist
COPY --from=web /app/web/dist web/dist
USER node
EXPOSE 8080
ENTRYPOINT ["node", "server/dist/main.js"]
CMD ["--config", "/etc/alertboard/config.yaml"]
