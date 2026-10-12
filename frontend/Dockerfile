# Build stage: SDK and build dependencies stay here
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json ./
COPY angular.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

# Runtime stage: serve only the compiled static files
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY --from=build /app/dist/frontend/browser/ /usr/share/nginx/html/

EXPOSE 8080
