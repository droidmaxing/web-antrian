FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Type-check and build must fail the image. A silent `|| true` here shipped
# broken bundles to production.
ARG NEXT_PUBLIC_APP_URL=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["npm", "start"]
