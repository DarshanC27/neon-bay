"""Serve NEON BAY to phones/tablets on the same Wi-Fi.

    python serve_mobile.py          # then open the printed http://<your-pc-ip>:8004 on your iPhone (Safari)

Only devices on your local network can reach it. Stop with Ctrl+C.
Windows may ask to allow Python through the firewall the first time: allow it on *Private* networks.
"""
import functools, http.server, os, socket, socketserver

PORT = 8004
ROOT = os.path.dirname(os.path.abspath(__file__))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no traffic is sent; picks the interface used for the LAN
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
        ip = lan_ip()
        print(f"\n  NEON BAY mobile server running\n\n  On your iPhone (same Wi-Fi), open Safari at:\n\n      http://{ip}:{PORT}\n")
        print("  Then tap Share -> 'Add to Home Screen' to install it as a full-screen app.\n  Ctrl+C to stop.\n")
        httpd.serve_forever()
