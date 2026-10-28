FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm install -g tsx
COPY . .
# Build the app after source is present
# NEXT_PUBLIC_* di-inline ke bundle klien saat build -> compose mengirimnya sebagai build arg.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["npm", "start"]
