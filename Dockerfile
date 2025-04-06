FROM node:latest

WORKDIR /app

COPY package.json package-lock.json bun.lock ./

COPY /etc/letsencrypt/live/backend.zpsanglijataayu.in/privkey.pem /etc/letsencrypt/live/backend.zpsanglijataayu.in/privkey.pem

COPY /etc/letsencrypt/live/backend.zpsanglijataayu.in/privkey.pem /etc/letsencrypt/live/backend.zpsanglijataayu.in/privkey.pem

RUN npm install

COPY . /app/

EXPOSE 3000

CMD ["node","server.js"]