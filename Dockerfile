FROM node:20-alpine

# Install psql client and docker CLI
RUN apk add --no-cache postgresql-client docker-cli

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Set default command
CMD ["npm", "run", "import"]
