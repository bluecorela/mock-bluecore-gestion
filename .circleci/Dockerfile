FROM nginx:stable-alpine

COPY .circleci/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/bluecore/browser/ /usr/share/nginx/html/

EXPOSE 80
