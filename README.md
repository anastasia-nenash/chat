# Socket-io chat with signal-protocol
____
## Запуск приложения:
- node fastmq-server
- node second-server
- node third-server
- node server

## Deploy and run in docker containers

```bash
  $ docker build -t local/fastmq_server -f Dockerfile.fastmq-server .
  $ docker run --detach \
    --publish 10.243.102.100:7500:7500 \
    --name fastmq_server \
    --restart always \
    local/fastmq_server:latest
```
```bash
  $ docker build -t local/second_server -f Dockerfile.second-server .
  $ docker run --detach \
    --env FASTMQ_HOST="10.243.102.100" \
    --publish 10.243.102.100:3002:3002 \
    --name second_server \
    --restart always \
    local/second_server:latest
```
```bash
  $ docker build -t local/third_server -f Dockerfile.third-server .
  $ docker run --detach \
    --env FASTMQ_HOST="10.243.102.100" \
    --publish 10.243.102.100:3003:3003 \
    --name third_server \
    --restart always \
    local/third_server:latest
```
