FROM node:20-alpine

WORKDIR /app

# Install deps separately for better layer caching
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the source
COPY . .

EXPOSE 3000

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Hot reload in dev
CMD ["npm", "run", "dev"]
