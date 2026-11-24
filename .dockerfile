FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
