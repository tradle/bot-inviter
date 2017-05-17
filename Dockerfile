FROM mhart/alpine-node:6.5.0

# Create app directory
RUN mkdir -p /opt/app
WORKDIR /opt/app

# Install app dependencies
ADD package.json /opt/app/
ADD .npmrc /root/.npmrc

RUN mkdir /root/.ssh/
ADD repo-key /root/.ssh/id_rsa
RUN chmod 700 /root/.ssh/id_rsa

RUN apk add --no-cache --virtual build-dependencies git openssh && \
  rm -rf /var/cache/apk/* && \
  ssh-keyscan -t rsa github.com > /root/.ssh/known_hosts && \
  git config --global credential.helper 'cache' && \
  git config --global github.user mvayngrib && \
  git config --global url.ssh://git@github.com/.insteadOf https://github.com/ && \
  npm install && \
  npm cache clean && \
  apk del build-dependencies && \
  rm -rf /tmp/*

# Bundle app source
ADD . /opt/app

RUN rm -f /root/.npmrc /root/.ssh/id_rsa
