"""Bounded public HTTPS page audit. No cookies, JavaScript, or account access."""
from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import time
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

USER_AGENT = "CommerceGrowthAudit/0.1 (+public-page-diagnostics)"
MAX_BYTES = 1_000_000
MAX_REDIRECTS = 2
TIMEOUT = 5
# Azure host-platform virtual endpoint is globally classified but not public content.
BLOCKED_PLATFORM_IPS = {ipaddress.ip_address("168.63.129.16")}
DNS_POOL = ThreadPoolExecutor(max_workers=2)
DNS_SLOTS = threading.BoundedSemaphore(2)


class ScanError(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code


def normalize_url(raw: str) -> str:
    if not isinstance(raw, str) or len(raw) > 2048:
        raise ScanError("invalid_url", "Provide a public HTTPS URL under 2048 characters.")
    try:
        u = urlsplit(raw.strip())
        port = u.port
    except ValueError as exc:
        raise ScanError("invalid_url", "The URL has an invalid port or host.") from exc
    if u.scheme.lower() != "https" or not u.hostname or port not in (None, 443):
        raise ScanError("invalid_url", "Only public HTTPS URLs on port 443 are supported.")
    if u.username is not None or u.password is not None or "\\" in raw or any(ord(c) < 32 for c in raw):
        raise ScanError("invalid_url", "Credentials and control characters are not allowed.")
    host = u.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        raise ScanError("private_target", "Private or local hosts cannot be scanned.")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ScanError("invalid_url", "The hostname cannot be encoded.") from exc
    if not host or len(host) > 253 or "." not in host:
        raise ScanError("invalid_url", "A public hostname is required.")
    path = u.path or "/"
    # Query strings may contain tokens or customer data; the pilot scans the
    # canonical public path and deliberately does not retain query parameters.
    return urlunsplit(("https", host, path, "", ""))


def resolve_public(host: str) -> list[str]:
    try:
        if not DNS_SLOTS.acquire(blocking=False):
            raise ScanError("dns_busy", "DNS lookup capacity is busy; try again later.")
        try:
            pending = DNS_POOL.submit(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM)
        except Exception:
            DNS_SLOTS.release()
            raise
        pending.add_done_callback(lambda _future: DNS_SLOTS.release())
        answers = pending.result(timeout=TIMEOUT)
    except (FutureTimeout, socket.timeout, TimeoutError) as exc:
        raise ScanError("timeout", "DNS lookup exceeded the request deadline.") from exc
    except OSError as exc:
        raise ScanError("dns_failed", "The hostname could not be resolved.") from exc
    addresses = sorted({entry[4][0] for entry in answers})
    def public_address(value):
        address = ipaddress.ip_address(value)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        return address.is_global and address not in BLOCKED_PLATFORM_IPS
    if not addresses or any(not public_address(ip) for ip in addresses):
        raise ScanError("private_target", "The hostname resolves to a non-public address.")
    return addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, ip: str):
        super().__init__(host, port=443, timeout=TIMEOUT, context=ssl.create_default_context())
        self.pinned_ip = ip

    def connect(self):
        # DNS is checked before each request; connect to that exact address while
        # preserving TLS SNI and hostname certificate verification.
        sock = socket.create_connection((self.pinned_ip, 443), timeout=self.timeout)
        try:
            if ipaddress.ip_address(sock.getpeername()[0]) != ipaddress.ip_address(self.pinned_ip):
                raise ScanError("peer_mismatch", "Connected address differs from the validated target.")
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


def fetch_once(url: str) -> tuple[int, dict[str, str], bytes]:
    deadline = time.monotonic() + TIMEOUT
    u = urlsplit(normalize_url(url))
    ip = resolve_public(u.hostname)[0]
    conn = PinnedHTTPSConnection(u.hostname, ip)
    def remaining():
        left = deadline - time.monotonic()
        if left <= 0: raise ScanError("timeout", "The public request exceeded its deadline.")
        return left
    try:
        conn.timeout = remaining()
        path = urlunsplit(("", "", u.path or "/", u.query, ""))
        conn.request("GET", path, headers={"Host": u.hostname, "User-Agent": USER_AGENT,
                                           "Accept": "text/html,text/plain;q=0.8", "Accept-Encoding": "identity"})
        conn.sock.settimeout(remaining())
        response = conn.getresponse()
        headers = {k.lower(): v for k, v in response.getheaders()}
        if response.length is not None and response.length > MAX_BYTES:
            raise ScanError("too_large", "The page exceeds the scan size limit.")
        chunks, size = [], 0
        while True:
            conn.sock.settimeout(remaining())
            chunk = response.read1(min(65536, MAX_BYTES + 1 - size))
            if not chunk: break
            size += len(chunk)
            if size > MAX_BYTES: raise ScanError("too_large", "The page exceeds the scan size limit.")
            chunks.append(chunk)
        body = b"".join(chunks)
        return response.status, headers, body
    except (socket.timeout, TimeoutError) as exc:
        raise ScanError("timeout", "The public request exceeded its deadline.") from exc
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        raise ScanError("fetch_failed", "The public page could not be retrieved.") from exc
    finally:
        conn.close()


def fetch_following_redirects(url: str, fetch=fetch_once, allowed=None) -> tuple[str, int, dict[str, str], bytes]:
    current = normalize_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        if allowed is not None and not allowed(current):
            raise ScanError("robots_disallowed", "The site does not permit this scan.")
        status, headers, body = fetch(current)
        if status not in (301, 302, 303, 307, 308):
            return current, status, headers, body
        location = headers.get("location")
        if not location:
            raise ScanError("redirect_failed", "A redirect had no destination.")
        next_url = normalize_url(urljoin(current, location))
        if urlsplit(next_url).hostname != urlsplit(url).hostname:
            raise ScanError("cross_domain_redirect", "Cross-domain redirects require a separate scan.")
        current = next_url
    raise ScanError("too_many_redirects", "The page redirects too many times.")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.h1: list[str] = []
        self.meta_description = ""
        self.forms = 0
        self.password_inputs = 0
        self.ctas: list[str] = []
        self._capture: str | None = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title": self._capture = "title"
        elif tag == "h1": self._capture = "h1"
        elif tag in ("button", "a"): self._capture = tag
        elif tag == "form": self.forms += 1
        elif tag == "input" and attrs.get("type", "").lower() == "password": self.password_inputs += 1
        elif tag == "meta" and attrs.get("name", "").lower() == "description":
            self.meta_description = attrs.get("content", "").strip()[:500]
        if tag == "input" and attrs.get("type", "").lower() in ("submit", "button"):
            self.ctas.append((attrs.get("value") or "")[:80])

    def handle_endtag(self, tag):
        if tag == self._capture: self._capture = None

    def handle_data(self, data):
        value = " ".join(data.split())
        if not value: return
        if self._capture == "title": self.title = (self.title + " " + value).strip()[:300]
        elif self._capture == "h1": self.h1.append(value[:300])
        elif self._capture in ("button", "a") and len(self.ctas) < 50: self.ctas.append(value[:80])


def fetch_public_html(url: str, fetch=fetch_once) -> tuple[str, str, bytes]:
    initial = normalize_url(url)
    host = urlsplit(initial).hostname
    robots_url = f"https://{host}/robots.txt"
    try:
        _, robots_status, _, robots_body = fetch_following_redirects(robots_url, fetch)
    except ScanError as exc:
        if exc.code == "private_target":
            raise
        raise ScanError("robots_unavailable", "Robots rules could not be checked; scan stopped.") from exc
    if robots_status != 200:
        raise ScanError("robots_unavailable", "Robots rules are not available for a safe scan.")
    robots = RobotFileParser()
    robots.parse(robots_body.decode("utf-8", errors="replace").splitlines())
    if not robots.can_fetch(USER_AGENT, initial):
        raise ScanError("robots_disallowed", "The site does not permit this scan.")
    final_url, status, headers, body = fetch_following_redirects(
        initial, fetch, allowed=lambda destination: robots.can_fetch(USER_AGENT, destination))
    if status in (401, 403):
        raise ScanError("restricted_content", "The page requires access; only public content is supported.")
    if status != 200:
        raise ScanError("http_status", f"The page returned HTTP {status}.")
    if "text/html" not in headers.get("content-type", "").lower():
        raise ScanError("not_html", "The destination did not return HTML.")
    return initial, final_url, body


def audit(url: str, fetch=fetch_once) -> dict:
    initial, final_url, body = fetch_public_html(url, fetch)
    page = PageParser()
    page.feed(body.decode("utf-8", errors="replace"))
    findings = []
    def add(rule, severity, title, evidence, confidence="medium"):
        findings.append({"rule_code": rule, "severity": severity, "title": title,
                         "evidence_url": final_url, "evidence_excerpt": evidence[:300],
                         "confidence": confidence, "limitations": "Public HTML only; not a measured conversion rate."})
    if not page.title: add("missing_title", "medium", "Page title is missing", "No <title> text found", "high")
    if not page.h1: add("missing_h1", "low", "Main heading is missing", "No <h1> text found", "high")
    if not page.meta_description: add("missing_description", "low", "Page description is missing", "No meta description found", "high")
    if page.password_inputs:
        add("password_field_present", "info", "A password field appears on this page",
            "Password input detected; verify whether registration is required before inquiry or checkout", "high")
    visible_ctas = [c for c in page.ctas if any(k in c.lower() for k in ("buy", "cart", "quote", "contact", "inquir", "shop", "購買", "詢價", "聯絡", "加入購物車"))]
    if not visible_ctas:
        add("cta_not_found", "info", "No common commerce CTA found in static HTML",
            "Buttons may be rendered by JavaScript or use different wording", "low")
    return {"requested_url": initial, "final_url": final_url,
            "page": {"title": page.title, "headings": page.h1[:5], "description": page.meta_description,
                     "forms": page.forms, "cta_samples": page.ctas[:12]},
            "findings": findings,
            "limitations": ["No ad, GA4, CRM, or order data connected.",
                            "No JavaScript rendering or mobile screenshot; static HTML only.",
                            "Findings are observable clues, not proven causes of abandonment."]}
