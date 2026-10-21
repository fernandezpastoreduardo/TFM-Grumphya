# Build the official Caddy release with patched Go and x/net versions.
FROM golang:1.27.3-alpine AS caddy-build
RUN apk add --no-cache git \
  && git clone --depth 1 --branch v2.11.7 https://github.com/caddyserver/caddy.git /src \
  && test "$(git -C /src rev-parse HEAD)" = 72dd0fb067f6d7826c7f79907670ba4a713bfe37
WORKDIR /src/cmd/caddy
RUN go get golang.org/x/net@v0.60.0 \
  && CGO_ENABLED=0 go build -trimpath -o /caddy .

FROM caddy:2.11.7-alpine
COPY --from=caddy-build /caddy /usr/bin/caddy
