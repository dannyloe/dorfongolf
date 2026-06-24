FROM node:22-slim

RUN npm install -g pnpm

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN npm run build

EXPOSE 5000

CMD sh -c "npm run db:push && npm start"
