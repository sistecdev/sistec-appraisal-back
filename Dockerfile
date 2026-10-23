# Production Dockerfile for SISTec Appraisal Backend (Node.js)
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY --chown=node:node . .

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=5100

# Run container as non-root user for security
USER node

# Expose backend API port
EXPOSE 5100

# Start API service
CMD ["node", "src/server.js"]
