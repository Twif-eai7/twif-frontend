# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Lockfile is generated with npm 11 (Node 24 locally). The Node 22 image
# ships npm 10, whose `npm ci` rejects it as out of sync
# (Missing @emnapi/runtime@2.0.0-alpha.5).
RUN npm install -g npm@11.6.2 && npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
