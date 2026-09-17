FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY data ./data
COPY public ./public
ARG SW_VERSION=dev
ENV APP_VERSION=$SW_VERSION
RUN mkdir -p /app/store && chown -R node:node /app/store
USER node
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
