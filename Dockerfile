# Portable production image for Monarch. Works on any Docker-capable host.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

# argon2 may need native build tools if a prebuilt binary is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++   && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --include=dev
COPY tsconfig.json ./
COPY src ./src
COPY app ./app
RUN npm run build && npm prune --omit=dev   && apt-get purge -y --auto-remove python3 make g++   && rm -rf /var/lib/apt/lists/*

USER node
EXPOSE 3000
CMD ["npm", "start"]
