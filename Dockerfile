FROM node:20-slim

RUN npm install -g pnpm@8

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile --shamefully-hoist

COPY . .
RUN npm run build

EXPOSE 5000

CMD sh -c "echo 'Starting...' && ls dist/ && npm run db:push && node dist/index.cjs 2>&1"
