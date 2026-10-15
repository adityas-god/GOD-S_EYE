# Stage 1: Build Frontend SPA application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and config
COPY . .

# Build production Vite SPA bundle into /app/dist
RUN npm run build

# Stage 2: Serve with lightweight Nginx Alpine
FROM nginx:alpine AS runner

# Remove default nginx configurations and default welcome page
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom Nginx reverse proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
