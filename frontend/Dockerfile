FROM m.daocloud.io/docker.io/node:20-alpine AS builder

WORKDIR /app

# 配置 npm 使用国内镜像源
RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install

COPY . .

# 生成 PWA 图标（占位符）
RUN chmod +x generate-icons.sh && ./generate-icons.sh

# Build
RUN npm run build

# Production stage
FROM m.daocloud.io/docker.io/nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4010

CMD ["nginx", "-g", "daemon off;"]
