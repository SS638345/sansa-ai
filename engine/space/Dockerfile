FROM python:3.11-slim
RUN apt-get update && apt-get install -y git libsndfile1 ffmpeg
RUN git clone --depth 1 https://github.com/SS638345/sansa-ai /src
WORKDIR /src/engine
RUN pip install --no-cache-dir -r requirements.txt
ENV HF_HOME=/tmp/hf
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
