# Node.js 22 Alpine
FROM node:22-alpine

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend source code
COPY . .

# Set default production environment variables
ENV NODE_ENV=production \
    PORT=5000

# Backend listens internally within the Docker bridge network on port 5000
EXPOSE 5000

# Start Express server
CMD ["node", "server.js"]
