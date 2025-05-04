#!/bin/sh
set -e

# Запускаем Serf в фоне
serf agent \
  -bind=0.0.0.0:7946 \
  -rpc-addr=127.0.0.1:7373 \
  -encrypt="${SERF_KEY}" &
SERF_PID=$!

# \
#  -join="${JOIN:=serf1:7946}"

# Запускаем основное приложение

npm run dev "$@"

# При остановке контейнера останавливаем Serf
kill $SERF_PID
