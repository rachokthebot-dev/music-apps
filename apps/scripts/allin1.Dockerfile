# Linux/amd64 container so natten's prebuilt legacy wheels (0.17.x) are available.
# Runs under Rosetta on Apple Silicon — fine for CPU inference.
FROM --platform=linux/amd64 python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pinned: torch 2.1 + cpu, natten 0.17.5 (last with legacy 1d/2d functional API)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.1.0 torchaudio==2.1.0
RUN pip install --no-cache-dir Cython 'numpy<2'
RUN pip install --no-cache-dir 'natten==0.14.6' -f https://shi-labs.com/natten/wheels/cpu/torch2.1.0/index.html
RUN pip install --no-cache-dir 'madmom @ git+https://github.com/CPJKU/madmom.git@main' --no-build-isolation
RUN pip install --no-cache-dir allin1

ENTRYPOINT ["allin1"]
