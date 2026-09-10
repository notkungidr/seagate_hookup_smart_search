# Use the official Bun base image
FROM oven/bun:1.1-alpine AS base
WORKDIR /usr/src/app

# Install dependencies in a cache-friendly way
# We only copy package.json and skip the lockfile to avoid version mismatch errors
COPY package.json ./
RUN bun install

# Copy all source files
COPY . .

# Expose the API port
EXPOSE 9090

# Command to run the application
CMD ["bun", "run", "src/index.ts"]
