FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY packages/backend/package*.json packages/backend/
COPY packages/frontend/package*.json packages/frontend/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run db:generate -w packages/backend
RUN npm run build -w packages/backend

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
COPY packages/backend/package*.json packages/backend/
COPY packages/frontend/package*.json packages/frontend/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=build /app/packages/backend/src ./packages/backend/src
COPY --from=build /app/.env.example ./.env.example

EXPOSE 3001
CMD ["node", "packages/backend/dist/server.js"]
