FROM node:10.15.1-jessie

RUN npm install -g nodemon
RUN wget https://github.com/Kitware/CMake/releases/download/v3.13.4/cmake-3.13.4-Linux-x86_64.sh -O /tmp/cmake.sh \
    && chmod +x /tmp/cmake.sh \
    && /tmp/cmake.sh --skip-license --prefix=/usr
RUN apt -y update && apt -y install libgtk2.0 libgtk2.0-dev pkg-config
RUN npm i -g opencv4nodejs --unsafe-perm
RUN printf "#!/bin/bash\n\
    export NODE_PATH=/usr/local/lib/node_modules\n\
    cd /source && npm install && npm run start" > /usr/bin/start.sh && chmod +x /usr/bin/start.sh

VOLUME /source

CMD /usr/bin/start.sh