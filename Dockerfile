FROM node:24-alpine AS build

WORKDIR /app
ARG VITE_BASE_PATH=/game/

COPY package*.json ./
RUN npm ci

COPY index.html tsconfig.json ./
COPY src ./src
RUN npm run build -- --base=${VITE_BASE_PATH}

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV APP_BASE_PATH=/game

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["npm", "start"]
