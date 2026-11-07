# One image for the whole app: builds the React frontend, then serves it from FastAPI.
# Also used by the Render Workflow service (with a different start command).

FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The API is served from the same origin in this image.
ENV VITE_API_BASE=""
ARG VITE_AG_GRID_LICENSE_KEY=""
ENV VITE_AG_GRID_LICENSE_KEY=$VITE_AG_GRID_LICENSE_KEY
RUN npm run build

FROM python:3.13-slim
# Tesseract for the OCR-first rule (images go to Gemini vision only when OCR confidence is low).
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-hin fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist ./static
ENV PORT=8000 CLAIMCHECK_DATA_DIR=/tmp/claimcheck
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
