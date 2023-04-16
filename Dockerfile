FROM node:18-alpine AS base

FROM base AS build

WORKDIR /app

COPY ./package.json ./yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build

FROM base AS final

WORKDIR /app

COPY ./package.json ./yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=build /app/dist/ ./

CMD ["node", "index.js"]

