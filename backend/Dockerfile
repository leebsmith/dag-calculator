# The deployed image. The backend is a Python service plus one external binary:
# Typst compiles the report templates and its version must match
# app/templates/TYPST_VERSION, so the release artifact is pinned and checked
# here. Buildpacks cannot install a pinned system binary, which is why this file
# exists — Cloud Run builds it whenever `--source backend/` carries a Dockerfile.

FROM python:3.13-slim

ARG TYPST_VERSION=0.15.1
ARG TYPST_SHA256=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    TYPST_BIN=/usr/local/bin/typst

WORKDIR /app

RUN set -eux; \
    apt-get update; \
    apt-get install --no-install-recommends -y ca-certificates curl xz-utils; \
    curl -fsSL -o /tmp/typst.tar.xz \
      "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz"; \
    echo "${TYPST_SHA256}  /tmp/typst.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/typst.tar.xz -C /tmp; \
    install -m 0755 "/tmp/typst-x86_64-unknown-linux-musl/typst" /usr/local/bin/typst; \
    rm -rf /tmp/typst.tar.xz "/tmp/typst-x86_64-unknown-linux-musl"; \
    apt-get purge -y curl xz-utils; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*; \
    typst --version

COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY . .

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
