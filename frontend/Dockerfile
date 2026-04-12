FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend static files
COPY . /usr/share/nginx/html/

# Remove nginx.conf from html folder (not needed there)
RUN rm -f /usr/share/nginx/html/nginx.conf \
       && rm -f /usr/share/nginx/html/Dockerfile

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
