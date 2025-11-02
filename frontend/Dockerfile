# syntax=docker/dockerfile:1

# ------------------------------
# Base stage: shared configuration across build stages
# ------------------------------
FROM node:20-alpine AS base

# Disable Next.js telemetry prompts and install libc compatibility layer
ENV NEXT_TELEMETRY_DISABLED=
RUN apk add --no-cache libc6-compat curl

WORKDIR /app

# ------------------------------
# Deps stage: install all dependencies with clean npm cache
# ------------------------------
FROM base AS deps

# Copy only package manifests to leverage layer caching
COPY package.json package-lock.json* ./

# Install dependencies (dev deps included for the build step)
RUN npm ci

# ------------------------------
# Builder stage: build the Next.js application
# ------------------------------
FROM base AS builder

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build production assets and prune devDependencies afterward
RUN npm run build && npm prune --omit=dev

# ------------------------------
# Runner stage: create the minimal runtime image
# ------------------------------
FROM base AS runner

ENV NODE_ENV=production

# Create an unprivileged user for security
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

WORKDIR /app

# Copy only the artifacts needed to run the production server
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER nextjs

EXPOSE 3000

# Start Next.js in production mode
CMD ["npm", "start"]
