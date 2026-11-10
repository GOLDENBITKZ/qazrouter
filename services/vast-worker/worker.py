"""TLS-only, authenticated, no-log vLLM gateway. Only redacted prompts reach this host."""
import base64
from datetime import datetime, timezone
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import ssl
import subprocess
import tempfile
import threading
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODELS = {
    "kz-vast-qwen": "Qwen/Qwen2.5-7B-Instruct",
    "kz-vast-coder": "Qwen/Qwen2.5-Coder-7B-Instruct",
    "kz-vast-llama": "meta-llama/Llama-3.1-8B-Instruct",
}


class TLSServer(ThreadingHTTPServer):
    def __init__(self, address, handler, context):
        self.tls_context = context
        self.capacity = threading.BoundedSemaphore(32)
        super().__init__(address, handler)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return self.tls_context.wrap_socket(connection, server_side=True,
                                            do_handshake_on_connect=False), address

    def process_request(self, request, client_address):
        if not self.capacity.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.capacity.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.capacity.release()

    def handle_error(self, _request, _address):
        # HTTP/connection exceptions must never write request data to stderr.
        pass


def main():
    served_model = os.environ["SERVED_MODEL"]
    model = os.environ["MODEL_ID"]
    if MODELS.get(served_model) != model:
        raise SystemExit("Unreviewed model")
    token = os.environ.pop("WORKER_TOKEN")
    if len(token) < 32:
        raise SystemExit("Missing worker credential")
    expires = datetime.fromisoformat(os.environ["LEASE_EXPIRES_AT"].replace("Z", "+00:00"))
    if expires <= datetime.now(timezone.utc):
        raise SystemExit("Expired lease")
    secrets = tempfile.TemporaryDirectory(prefix="qzr-")
    cert_path, key_path = Path(secrets.name) / "cert.pem", Path(secrets.name) / "key.pem"
    for path, variable in [(cert_path, "TLS_CERT_B64"), (key_path, "TLS_KEY_B64")]:
        path.write_bytes(base64.b64decode(os.environ.pop(variable), validate=True))
        path.chmod(0o600)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert_path, key_path)
    # The key is loaded into memory; no secret files survive startup.
    secrets.cleanup()
    child_env = dict(os.environ, VLLM_API_KEY=token, VLLM_LOGGING_LEVEL="ERROR",
                     HF_HUB_DISABLE_TELEMETRY="1", DO_NOT_TRACK="1")
    child = subprocess.Popen([
        "vllm", "serve", model, "--served-model-name", served_model,
        "--host", "127.0.0.1", "--port", "8000", "--max-model-len", "8192",
        "--gpu-memory-utilization", "0.9", "--generation-config", "vllm",
        "--disable-log-requests", "--disable-uvicorn-access-log",
    ], env=child_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    slots = threading.BoundedSemaphore(8)

    class Gateway(BaseHTTPRequestHandler):
        server_version = "QazRouter"

        def log_message(self, *_args):
            pass

        def setup(self):
            self.request.settimeout(5)
            self.request.do_handshake()
            super().setup()
            self.connection.settimeout(50)

        def reply(self, status, payload):
            raw = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            self.forward()

        def do_POST(self):
            self.forward()

        def forward(self):
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                self.reply(401, {"error": "Unauthorized"})
                return
            if datetime.now(timezone.utc) >= expires or child.poll() is not None:
                self.reply(503, {"error": "Worker unavailable"})
                return
            if (self.command, self.path) not in [
                ("GET", "/v1/models"), ("POST", "/v1/chat/completions")
            ]:
                self.reply(404, {"error": "Not found"})
                return
            if self.headers.get("Transfer-Encoding"):
                self.reply(400, {"error": "Content-Length required"})
                return
            if not slots.acquire(blocking=False):
                self.reply(429, {"error": "Worker busy"})
                return
            try:
                body = None
                if self.command == "POST":
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 0 < size <= 1_000_000:
                        self.reply(413, {"error": "Invalid body size"})
                        return
                    raw = self.rfile.read(size)
                    if len(raw) != size:
                        raise ValueError("Incomplete body")
                    payload = json.loads(raw)
                    if not isinstance(payload, dict) or payload.get("model") != served_model or payload.get("stream") is not False:
                        self.reply(400, {"error": "Invalid model or streaming mode"})
                        return
                    body = json.dumps(payload).encode()
                request = Request("http://127.0.0.1:8000" + self.path, data=body,
                                  method=self.command, headers={
                                      "Authorization": "Bearer " + token,
                                      "Content-Type": "application/json"})
                with urlopen(request, timeout=43) as response:
                    raw = response.read(2_000_001)
                    if len(raw) > 2_000_000:
                        raise ValueError("Oversized response")
                    self.reply(200, json.loads(raw))
            except HTTPError as error:
                # vLLM validation errors can echo prompts: never forward their bodies.
                self.reply(error.code if error.code in (400, 429) else 503,
                           {"error": "Inference unavailable"})
            except (URLError, TimeoutError, OSError, ValueError):
                self.reply(503, {"error": "Inference unavailable"})
            finally:
                slots.release()

    server = TLSServer(("0.0.0.0", 8443), Gateway, context)
    server.daemon_threads = True

    def stop(*_args):
        child.terminate()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    # Refuse inference and stop compute even if the control-plane cron is delayed.
    timer = threading.Timer(max(0, (expires - datetime.now(timezone.utc)).total_seconds()), stop)
    timer.daemon = True
    timer.start()
    try:
        server.serve_forever()
    finally:
        timer.cancel()
        server.server_close()
        child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()


if __name__ == "__main__":
    main()
