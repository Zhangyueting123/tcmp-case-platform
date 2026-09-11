FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
ENV NODE_ENV=production
RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]
CMD ["sh", "-c", "node dist/seed.js || true && node dist/main.js"]
