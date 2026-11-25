FROM node:18-alpine
WORKDIR /app
# Copy package files from the backend folder
COPY backend/package*.json ./
# Install dependencies
RUN npm install
# Copy the rest of the backend code
COPY backend/ .
EXPOSE 10000
CMD ["npm", "start"]
