FROM nginx:alpine
# Copy our static website files into Nginx default serve folder
COPY . /usr/share/nginx/html
EXPOSE 80
