# Dockerfile
FROM node:20

# Устанавливаем утилиты для загрузки и распаковки
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget unzip \
 && rm -rf /var/lib/apt/lists/*

# Версия Serf (можно прокинуть через --build-arg)
ARG SERF_VERSION=0.8.1

# Скачиваем, проверяем (SHA256SUMS можно раскомментировать проверку), распаковываем и ставим serf в /usr/local/bin
RUN wget https://releases.hashicorp.com/serf/${SERF_VERSION}/serf_${SERF_VERSION}_linux_amd64.zip \
 && wget https://releases.hashicorp.com/serf/${SERF_VERSION}/serf_${SERF_VERSION}_SHA256SUMS \
 # (опционально) проверка SHA256:
 # && grep serf_${SERF_VERSION}_linux_amd64.zip serf_${SERF_VERSION}_SHA256SUMS | sha256sum -c - \
 && unzip serf_${SERF_VERSION}_linux_amd64.zip \
 && mv serf /usr/local/bin/ \
 && chmod +x /usr/local/bin/serf \
 && rm serf_${SERF_VERSION}_linux_amd64.zip serf_${SERF_VERSION}_SHA256SUMS

# Перейдём в рабочую директорию вашего сервиса
WORKDIR /packages/service-registry

# Копируем скрипт в контейнер
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Делаем его точкой входа
#ENTRYPOINT ["entrypoint.sh"]

CMD []

# CMD не задаём — в docker-compose мы уже пишем `command: npm run dev`
