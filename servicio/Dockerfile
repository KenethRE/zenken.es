# Imagen oficial de Playwright (trae Chromium y sus dependencias)
FROM mcr.microsoft.com/playwright/python:v1.65.2-noble
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt playwright==1.65.2
COPY app.py extractor.py ./
ENV HORARIO_DATOS=/datos PYTHONUNBUFFERED=1
RUN useradd -m -u 10001 horario && mkdir -p /datos && chown horario /datos
USER horario
EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090", "--proxy-headers", "--forwarded-allow-ips", "*"]
