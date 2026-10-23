# Easypanel: Build Path /extension-distribution; Arquivo Dockerfile.
# Os certificados nao vao na imagem. Monte-os via Storage > File no Easypanel.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /usr/share/nginx/html/eden-voice /etc/nginx/certs
COPY extension.crx /usr/share/nginx/html/eden-voice/extension.crx
COPY updates.xml /usr/share/nginx/html/eden-voice/updates.xml
EXPOSE 443
