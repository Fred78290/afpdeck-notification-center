FROM node:20-alpine

LABEL version="1.0.0"
LABEL name="afpdeck-notification-center"
LABEL maintainer="Frederic Boltz <frederic.boltz@gmail.com>"

ENV AFPDECK_PUSH_URL=
ENV APICORE_BASE_URL=https://afp-apicore-prod.afp.com
ENV APICORE_CLIENT_ID=
ENV APICORE_CLIENT_SECRET=
ENV APICORE_EMAIL=
ENV APICORE_PASSWORD=
ENV APICORE_PUSH_PASSWORD=
ENV APICORE_PUSH_USERNAME=
ENV APICORE_USERNAME=
ENV DEBUG_LAMBDA=true
ENV DEBUG=false
ENV LISTEN_PORT=8080
ENV MONGODB_URL=
ENV SUBSCRIPTIONS_TABLE_NAME=afpdeck-notification-center
ENV USERPREFS_TABLENAME=afpdeck-preferences-test
ENV WEBPUSH_TABLE_NAME=afpdeck-webpush-test
ENV USE_MONGODB=true

WORKDIR /usr/src/app

COPY dist/* ./
COPY package.json ./

# to avoid security exception 
RUN npm i npm@latest -g
RUN npm install

#Security don't run with pid 1
RUN if [ "$(uname -m)" == "aarch64" ];  then \
    echo  "Build for arm64"; \
    wget https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_aarch64 -O /usr/local/bin/dumb-init; \
    chmod +x /usr/local/bin/dumb-init; \
else \
    echo  "Build for amd64"; \
    wget https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_x86_64 -O /usr/local/bin/dumb-init; \
    chmod +x /usr/local/bin/dumb-init; \
fi

CMD [ "dumb-init","npm", "start" ]
