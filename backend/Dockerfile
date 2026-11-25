FROM node:20-alpine
WORKDIR /app

# 1. Copy package files first
COPY package*.json ./

# 2. Install dependencies BEFORE copying the rest of the code
RUN npm install

# 3. Copy the rest of your backend code
COPY . .

EXPOSE 10000
CMD ["npm", "start"]