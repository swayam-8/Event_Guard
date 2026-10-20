FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY worker/package.json ./worker/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci
COPY client ./client
CMD ["npm", "--workspace", "client", "run", "dev", "--", "--host", "0.0.0.0"]
