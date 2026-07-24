# AutoDJ recommender daemon — loads the derived index into memory, serves /session/next.
# Tiny: just numpy + flask (no audio libs; embedding lives in the essentia service).
FROM python:3.11-slim

RUN pip install --no-cache-dir "numpy>=1.24" flask

WORKDIR /app
COPY recommender.py /app/
EXPOSE 8001
CMD ["python", "recommender.py"]
