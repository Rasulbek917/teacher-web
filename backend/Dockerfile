# ---- build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

COPY package*.json ./
# prisma CLI va seed uchun dev bog'liqliklar ham kerak
RUN npm ci
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY tsconfig.json nest-cli.json ./
RUN npx prisma generate

ENV NODE_ENV=production

RUN mkdir -p /app/uploads
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
