FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY packages/backend/package*.json packages/backend/
COPY packages/frontend/package*.json packages/frontend/
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w packages/frontend

FROM nginx:1.27-alpine AS runner
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
EXPOSE 80
