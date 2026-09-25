# Stage 1: Build TypeScript source code
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm install

# Copy tsconfig and source files
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to dist/
RUN npm run build

# Stage 2: Production runtime image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5050

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled files from builder
COPY --from=builder /app/dist ./dist

# Non-root user for security
USER node

EXPOSE 5050

CMD ["node", "dist/index.js"]
