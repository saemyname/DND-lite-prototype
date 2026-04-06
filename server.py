#!/usr/bin/env python3
"""Local dev server with Cross-Origin Isolation headers for SharedArrayBuffer support."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f'  {self.address_string()} — {fmt % args}')

print(f'\n  D&D Lite server → http://localhost:{PORT}/splat-face-demo.html\n  Ctrl+C to stop\n')
with http.server.HTTPServer(('', PORT), Handler) as httpd:
    httpd.serve_forever()
