FROM mcr.microsoft.com/playwright:v1.62.1-noble

USER root
RUN apt-get update && apt-get install -y --no-install-recommends supervisor x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY lib/crm-excellent-staff.ts lib/crm-top-customers.ts ./lib/
COPY scripts/amis-webhook-worker.mjs scripts/crm-excellent-staff-read.mjs scripts/crm-top-customers-read.mjs scripts/crm-excellent-staff-sync.mjs scripts/crm-top-customers-sync.mjs ./scripts/
COPY scripts/lib/ ./scripts/lib/
COPY deploy/crm-worker/ ./deploy/crm-worker/
RUN mkdir -p /var/lib/amis-crm/profile /app/data /tmp/amis-worker \
    && chown -R pwuser:pwuser /var/lib/amis-crm /app/data /tmp/amis-worker \
    && chmod 700 /var/lib/amis-crm/profile \
    && sed -i 's/\r$//' /app/deploy/crm-worker/boot.sh

ENV NODE_ENV=production DISPLAY=:99 \
    AMIS_CRM_BROWSER_PROFILE=/var/lib/amis-crm/profile \
    AMIS_CRM_BROWSER_ENDPOINT=http://127.0.0.1:9223 \
    AMIS_CRM_BROWSER_AUTOSTART=false \
    AMIS_WORKER_HEALTH_FILE=/tmp/amis-worker/health.json \
    AMIS_WORKER_REFRESH_SECONDS=300
USER pwuser
STOPSIGNAL SIGTERM
CMD ["flock", "--no-fork", "--nonblock", "/var/lib/amis-crm/container.lock", "/bin/sh", "/app/deploy/crm-worker/boot.sh"]
