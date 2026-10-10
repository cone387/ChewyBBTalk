FROM node:20-alpine AS builder

WORKDIR /app/frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
ENV NGINX_CLIENT_MAX_BODY_SIZE=513M
ENV NGINX_ENVSUBST_FILTER=^NGINX_CLIENT_MAX_BODY_SIZE$
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 4010

CMD ["nginx", "-g", "daemon off;"]
