FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Set environment for stdio transport
ENV NODE_ENV=production

# Run the server
CMD ["node", "dist/index.js"]
