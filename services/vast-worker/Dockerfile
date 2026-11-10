# Supply a reviewed, digest-pinned vLLM image when building. No floating production images.
ARG VLLM_IMAGE
FROM ${VLLM_IMAGE}
COPY worker.py /opt/qazrouter/worker.py
EXPOSE 8443
ENTRYPOINT ["python3", "/opt/qazrouter/worker.py"]
