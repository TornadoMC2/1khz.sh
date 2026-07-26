# Deploying 1kHz.sh

Everything here is static files, so almost any host will serve the site. The
one hard requirement is the gimmick: **any subdomain must resolve to the same
files**, because `440.1khz.sh` is what makes this project itself rather than
another tone generator.

That single requirement rules out most of the obvious options.

## Why Cloudflare Workers

| Host | Wildcard `*.1khz.sh`? | Verdict |
| --- | --- | --- |
| GitHub Pages | No — custom domains are exact-match only | Serves the apex fine, breaks the whole premise |
| Cloudflare **Pages** | No — wildcard custom domains are explicitly unsupported | Same problem |
| Cloudflare **Workers** | **Yes** — Worker *routes* accept `*.1khz.sh/*` | What this repo is set up for |
| Your own nginx box | Yes — trivially | Works; see the appendix |

Two more things make Workers the path of least resistance:

- **TLS is free and automatic.** Cloudflare's Universal SSL certificate covers
  the apex *and* first-level wildcards, so `440.1khz.sh` gets a valid
  certificate with no work. (It covers one level only — `a.b.1khz.sh` would
  not be covered, but nothing here needs that.)
- **The free tier is 100,000 requests/day**, which this site will not trouble.

There is no Worker *code* in this repo. `wrangler.jsonc` declares static assets
and two routes; Cloudflare serves the files straight from its edge.

---

## One-time setup

### 1. Put the zone on Cloudflare

Add `1khz.sh` as a site in the Cloudflare dashboard and change your registrar's
nameservers to the two Cloudflare gives you. Wait for the zone to go **Active**
(usually minutes, occasionally a few hours). Nothing below works until it is.

### 2. Create the DNS records

Worker routes only fire on hostnames that have a **proxied** DNS record. There
is no origin server to point at, so use Cloudflare's documented placeholder —
the IPv6 discard address — and let the Worker intercept the request before
anything is ever dialled.

In **DNS → Records**, create exactly two:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| AAAA | `@` | `100::` | **Proxied** (orange cloud) |
| AAAA | `*` | `100::` | **Proxied** (orange cloud) |

The orange cloud is not optional. A grey-clouded (DNS-only) record bypasses
Cloudflare entirely, the Worker never runs, and visitors get a connection
error.

### 3. Deploy

From a clone of this repo:

```sh
npx wrangler login     # opens a browser, authorises your account
npx wrangler deploy
```

That uploads the site and attaches both routes declared in `wrangler.jsonc`.
Wrangler is invoked through `npx` on purpose — it is not a dependency of this
project, and nothing about the site requires Node.

### 4. Check the routes landed

**Workers & Pages → `1khz-sh` → Settings → Domains & Routes** should list:

```
1khz.sh/*
*.1khz.sh/*
```

Both are declared in `wrangler.jsonc`. They are listed separately on purpose:
a single `*1khz.sh/*` pattern would also match hostnames like `not1khz.sh`.

### 5. Verify

```sh
curl -sI https://1khz.sh/          | head -1   # 200
curl -sI https://1khz.sh/delay/    | head -1   # 200
curl -sI https://440.1khz.sh/      | head -1   # 200  ← the one that matters
curl -sI https://1khz.sh/nonsense  | head -1   # 404, serving /404.html
```

Then open `https://440.1khz.sh` in a browser: the dial should read 440 Hz and
the header should show a **Tuned** chip. If the apex works but the subdomain
does not, the wildcard DNS record is missing or not proxied.

---

## Continuous deployment

`.github/workflows/deploy.yml` deploys on every push to `master`, then
smoke-tests the live site — including a request to `440.1khz.sh`, so a broken
wildcard route fails the build rather than sitting unnoticed.

It needs two repository secrets (**Settings → Secrets and variables →
Actions**):

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | **My Profile → API Tokens → Create Token**, using the **"Edit Cloudflare Workers"** template. Scope it to the `1khz.sh` zone. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar, or `npx wrangler whoami` |

The token template grants what a deploy actually needs: *Workers Scripts: Edit*
on the account, and *Workers Routes: Edit* on the zone. Don't use a Global API
Key — it has no scoping and cannot be revoked independently.

Until both secrets exist the workflow runs and skips the publish step, so forks
and fresh clones never fail.

### What gets uploaded

The assets directory is the repo root, since there is no build step. Developer
files are kept out of the deploy by `.assetsignore` (same syntax as
`.gitignore`). **If you add a top-level file that isn't part of the site, add
it there too**, or it will be published.

---

## Troubleshooting

**A subdomain shows an SSL warning.**
Universal SSL covers one level of wildcard. `440.1khz.sh` is fine;
`x.440.1khz.sh` is not, and nothing in this project needs it. If the apex is
also failing, check **SSL/TLS → Edge Certificates** — Universal SSL can take
up to ~15 minutes to issue on a new zone.

**Error 1000: "DNS points to prohibited IP".**
The placeholder record is wrong or unproxied. It must be `AAAA` → `100::` with
the orange cloud on.

**The apex works, subdomains 404 or hang.**
Either the `*` DNS record is missing, or it is grey-clouded, or the
`*.1khz.sh/*` route did not attach. Check the Domains & Routes list from step 4.

**`/delay/` 404s but `/delay/index.html` works.**
The `html_handling` setting in `wrangler.jsonc` got changed. It should be
`auto-trailing-slash`.

**Stale content after a deploy.**
That's the service worker, not Cloudflare — it serves from cache and refreshes
in the background, so a change lands on the *second* load. Bump the `CACHE`
constant at the top of `sw.js` whenever you ship, which drops old caches on
activate. Hard-reload to check immediately.

**Everything 522/523.**
You created a normal A record pointing at a real IP instead of the placeholder,
so Cloudflare is trying to reach an origin that isn't there.

---

## Appendix: self-hosting behind nginx

Not required, but the site is deliberately easy to host yourself — it's static
files with no runtime. On any box that can accept traffic on 80/443:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name 1khz.sh *.1khz.sh;          # the wildcard is the whole trick

    root /var/www/1khz.sh;
    index index.html;

    ssl_certificate     /etc/letsencrypt/live/1khz.sh/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/1khz.sh/privkey.pem;

    # Serve /delay/ from /delay/index.html, fall through to the 404 page.
    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }
    error_page 404 /404.html;

    # Fonts and the stylesheet are safe to cache hard; HTML and the service
    # worker must not be, or deploys stop propagating.
    location /assets/fonts/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
    location = /sw.js       { add_header Cache-Control "no-cache"; }
    location ~* \.html$     { add_header Cache-Control "no-cache"; }

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/manifest+json;
    # woff2 is already compressed — don't waste CPU on it.
}

server {
    listen 80;
    listen [::]:80;
    server_name 1khz.sh *.1khz.sh;
    return 301 https://$host$request_uri;    # $host, not a literal — keep the subdomain
}
```

Two things to get right:

- **The certificate must cover the wildcard.** HTTP-01 validation cannot issue
  wildcards, so use DNS-01:
  ```sh
  certbot certonly --dns-cloudflare \
      -d '1khz.sh' -d '*.1khz.sh'
  ```
- **Redirect with `$host`, not a hard-coded domain.** Sending `440.1khz.sh` to
  `https://1khz.sh` throws away the frequency, which is the only interesting
  thing about the request.

Deploying is then just `git pull` in the web root, or an rsync step from CI.
