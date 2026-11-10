"""No GPU required: exercise the worker's actual HTTP handler and launch policy."""
import base64
from datetime import datetime, timedelta, timezone
from email.message import Message
import io
import json
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

import worker


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.token = "x" * 43
        self.expires = datetime.now(timezone.utc) + timedelta(minutes=60)
        environment = {
            "MODEL_ID": "Qwen/Qwen2.5-7B-Instruct",
            "SERVED_MODEL": "kz-vast-qwen",
            "WORKER_TOKEN": self.token,
            "LEASE_EXPIRES_AT": self.expires.isoformat(),
            "TLS_CERT_B64": base64.b64encode(b"cert").decode(),
            "TLS_KEY_B64": base64.b64encode(b"key").decode(),
        }
        self.child = MagicMock()
        self.child.poll.return_value = None
        self.server = MagicMock()
        with patch.dict(worker.os.environ, environment, clear=True), \
                patch.object(worker.subprocess, "Popen", return_value=self.child) as launch, \
                patch.object(worker, "TLSServer", return_value=self.server) as server_type, \
                patch.object(worker.ssl, "SSLContext"), \
                patch.object(worker.signal, "signal"), \
                patch.object(worker.threading, "Timer"):
            worker.main()
            self.handler_type = server_type.call_args.args[1]
            self.launch_args, self.launch_options = launch.call_args
        self.handler = object.__new__(self.handler_type)
        self.handler.command = "POST"
        self.handler.path = "/v1/chat/completions"
        self.handler.headers = Message()
        self.handler.headers["Authorization"] = "Bearer " + self.token
        self.handler.reply = MagicMock()
        self.body({"model": "kz-vast-qwen", "stream": False,
                   "messages": [{"role": "user", "content": "__KZ_PII_PERSON_1__"}]})

    def body(self, payload):
        raw = json.dumps(payload).encode()
        self.handler.rfile = io.BytesIO(raw)
        if self.handler.headers.get("Content-Length"):
            del self.handler.headers["Content-Length"]
        self.handler.headers["Content-Length"] = str(len(raw))

    def test_launch_is_loopback_only_without_logging_or_tls_secrets(self):
        args = self.launch_args[0]
        self.assertEqual(args[args.index("--host") + 1], "127.0.0.1")
        self.assertIn("--disable-log-requests", args)
        self.assertIn("--disable-uvicorn-access-log", args)
        self.assertNotIn("TLS_KEY_B64", self.launch_options["env"])
        self.assertNotIn("TLS_CERT_B64", self.launch_options["env"])
        self.assertNotIn(self.token, args)
        self.assertEqual(self.launch_options["stdout"], worker.subprocess.DEVNULL)

    def test_rejects_unauthenticated_request(self):
        del self.handler.headers["Authorization"]
        with patch.object(worker, "urlopen") as upstream:
            self.handler.forward()
            upstream.assert_not_called()
        self.assertEqual(self.handler.reply.call_args.args[0], 401)

    def test_rejects_expired_lease(self):
        with patch.object(worker, "datetime") as clock, patch.object(worker, "urlopen") as upstream:
            clock.now.return_value = self.expires + timedelta(seconds=1)
            self.handler.forward()
            upstream.assert_not_called()
        self.assertEqual(self.handler.reply.call_args.args[0], 503)

    def test_no_admin_or_metrics_endpoints(self):
        self.handler.command = "GET"
        self.handler.path = "/metrics"
        with patch.object(worker, "urlopen") as upstream:
            self.handler.forward()
            upstream.assert_not_called()
        self.assertEqual(self.handler.reply.call_args.args[0], 404)

    def test_rejects_wrong_model_streaming_and_oversized_body(self):
        for payload in [{"model": "another-model", "stream": False},
                        {"model": "kz-vast-qwen", "stream": True}]:
            self.body(payload)
            with patch.object(worker, "urlopen") as upstream:
                self.handler.forward()
                upstream.assert_not_called()
            self.assertEqual(self.handler.reply.call_args.args[0], 400)
        del self.handler.headers["Content-Length"]
        self.handler.headers["Content-Length"] = "1000001"
        self.handler.forward()
        self.assertEqual(self.handler.reply.call_args.args[0], 413)

    def test_forwards_authenticated_redacted_request_and_usage(self):
        response = {"choices": [{"message": {"content": "OK"}}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 1}}
        with patch.object(worker, "urlopen") as upstream:
            upstream.return_value.__enter__.return_value.read.return_value = json.dumps(response).encode()
            self.handler.forward()
            request = upstream.call_args.args[0]
            self.assertEqual(request.full_url, "http://127.0.0.1:8000/v1/chat/completions")
            self.assertIn("__KZ_PII_PERSON_1__", request.data.decode())
            self.assertEqual(request.get_header("Authorization"), "Bearer " + self.token)
        self.handler.reply.assert_called_once_with(200, response)

    def test_never_echoes_upstream_errors_or_prompts(self):
        error = HTTPError("http://local", 400, "sensitive prompt", {}, io.BytesIO(b"private-data"))
        with patch.object(worker, "urlopen", side_effect=error):
            self.handler.forward()
        self.handler.reply.assert_called_once_with(400, {"error": "Inference unavailable"})

    def test_no_upstream_when_child_failed(self):
        self.child.poll.return_value = 1
        with patch.object(worker, "urlopen") as upstream:
            self.handler.forward()
            upstream.assert_not_called()
        self.assertEqual(self.handler.reply.call_args.args[0], 503)


if __name__ == "__main__":
    unittest.main()
