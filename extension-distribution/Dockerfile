# Easypanel: Build Path /extension-distribution; Dockerfile: Dockerfile
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY extension.crx /usr/share/nginx/html/eden-voice/extension.crx
COPY updates.xml /usr/share/nginx/html/eden-voice/updates.xml

EXPOSE 80
