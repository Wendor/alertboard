# alertboard

**English** · [Русский](README.ru.md)

A read-only web page for active Alertmanager alerts: two-level grouping, a timeline of alert start times to spot cascades, search, saved views, links to Prometheus, Grafana Explore and to creating a silence. Desktop and mobile layouts, light and dark themes, Russian and English UI.

The page never changes anything in Alertmanager: silences are created in Alertmanager's own UI via a prefilled link.

## Build and run

Requires Node 22+. Backend is NestJS (`server/`), frontend is Vue 3 (`web/`); the backend serves the built `web/dist`.

```bash
cp config.example.yaml config.yaml   # set addresses and problem categories
cp .env.example .env                 # Alertmanager login and password
make build
node server/dist/main.js --config config.yaml
# http://127.0.0.1:8080
```

Flags: `--config` (default `config.yaml`), `--listen` (overrides `LISTEN` and `listen` from the config), `--env` (default `.env` in the working directory, skipped if missing).

Environment variables: `AM_USER`, `AM_PASSWORD`, `LISTEN`, `AUTH_USER`, `AUTH_PASSWORD`. They can be set in `.env` or in the environment; variables already set in the environment take precedence over the file. Alertmanager credentials are never sent to the browser.

Development: `make dev` starts the backend (restarted on changes in `server/src`) and Vite with hot reload. Vite proxies `/api` to the backend address: `LISTEN`, then `listen` from the config. Another config or env file: `make dev CONFIG=other.yaml ENV_FILE=.env.local`, same for `make run`.

Tests: `make test`.

## Docker

```bash
cp config.example.yaml config.yaml
docker build -t alertboard .
docker run -d -p 8080:8080 \
  -e AM_USER=... -e AM_PASSWORD=... \
  -v "$PWD/config.yaml:/etc/alertboard/config.yaml:ro" \
  alertboard
```

Or `docker compose up -d` with the bundled `docker-compose.yml`; credentials are taken from `.env` next to it. Note that `docker run --env-file` passes values literally, quotes included, so don't quote values in a file used that way. The image sets `LISTEN=0.0.0.0:8080`, so `listen` from the config is not used inside the container. Prebuilt `linux/amd64` and `linux/arm64` images are published to `ghcr.io/wendor/alertboard`: a `v*` tag publishes `X.Y.Z`, `X.Y` and `latest`, every push to the default branch publishes `edge` and `sha-<commit>`.

## Authentication

Set `AUTH_USER` and `AUTH_PASSWORD` to require HTTP basic auth for the whole UI and API; both must be set, otherwise the server refuses to start. Without them the page is open, so keep it on localhost or a trusted network (the bundled `docker-compose.yml` publishes the port on `127.0.0.1` only). Basic auth sends the password with every request, so serve it over HTTPS (see below, or behind a reverse proxy) when it leaves a trusted network.

## HTTPS

Set `tls.cert` and `tls.key` in the config to serve HTTPS instead of HTTP on the same `listen` address. Relative paths are resolved against the config file's directory; the certificate file should contain the intermediate chain. Both must be set, and the server refuses to start if a file cannot be read. Certificates are read at startup, so restart the server after renewing them. In Docker, mount the certificates next to the config (see the comment in `docker-compose.yml`). `make dev` follows the config: Vite proxies `/api` to the HTTPS backend and accepts a self-signed certificate.

## Configuration

All fields are described in `config.example.yaml`. The main ones:

- `alertmanager.url` — where the backend reads `/api/v2/alerts` from; `public_url` — address used for silence links in the browser.
- `prometheus.url` / `name` — the main Prometheus for links (the link is called `prom` by default), `prometheus.extra` — additional ones shown next to it. The host of the alert's `generatorURL` is replaced with each of them, keeping path and query. This helps when Prometheus has no `--web.external-url` and alerts carry an internal address such as a container id. Without `prometheus.url` the link is left as in the alert. Like the Grafana links below, the expression in these links is narrowed to the alert's hosts.
- `grafana` — links to Grafana Explore with the alert expression (taken from `generatorURL`); the range starts an hour before the alert, clamped to the last 6–24 hours. Requires `url` and `datasource` (uid of a Prometheus datasource, visible in the Explore URL), `org_id` defaults to 1. No dashboard needed. The query is narrowed to the alert's host (a row's link: to all hosts of the row): a matcher on the label the host is taken from (`ui.host_labels`, e.g. `node="db04"`) is added to every metric selector of the expression, so Prometheus loads only those series. When the host is not taken from `instance` and every alert has one, the result is also cut down to the alerts' own instances, so a host running several targets (e.g. two mysqld) shows only the alerting ones. Without a host label, or when the alerts of a row take their host from different labels, the expression is left as is.
- `problems` — regexes over `alertname` (anchored), the first match gives the problem title. Without a match the problem is called by its `alertname`.
- `ui.groups` — order and titles of `ui.group_label` values (default label `severity`). Alerts without the label go to "no group".
- `ui.stale_after` — age after which an alert is considered stale and moved to a collapsed section; `ui.fresh_within` — age below which it is highlighted.
- `ui.host_labels` — labels used as the alert's host, first non-empty wins (default `[instance]`).
- `ui.group_by_labels` — extra "group by" options by arbitrary labels: `{label, title}`.
- `ui.search_skip_labels` — labels ignored by free-text search; useful for service labels with long value lists that match almost any word. `label=…` filters still work on them.
- `ui.links` — extra per-alert links, `{{label}}` is replaced by the label value.
- `ui.views` — default views.

## Languages

The UI is available in Russian and English. The language defaults to the browser's, the `RU`/`EN` switch is in the header and the choice is remembered in the browser.

Config texts (`problems[].title`, `ui.groups[].title`, `ui.group_by_labels[].title`, `ui.links[].name`, `ui.views[].name`) can be a plain string or a map `{ru: …, en: …}`. Without a translation for the current language, English is used, then any. The first translation in the map is a stable key: hidden problems and saved views refer to it, so better not to change it.

## Search

Space-separated terms, all must match:

- `text` — substring of `alertname`, problem title, annotations, label values except `ui.search_skip_labels` (case-insensitive);
- `label=value`, `label!=value`, `label=~regex`, `label!~regex` — as in PromQL, regexes are anchored;
- quotes for spaces: `mountpoint="mount point /"`.

## Views

A view is a search query, grouping, section order, hidden groups and problems, showing silenced alerts, the stale threshold and the timeline scale. Sections are reordered with the ↑ ↓ arrows in their headers (shown on hover; `section_order` sets the order of a view from the config). Changes are marked with a dot on the tab, "save" writes them into the view. Views are stored in the browser's `localStorage`; while it holds any, views from the config are not applied. The current state, including the selected timeline range, is kept in the page URL, so it can be shared as a link.

## License

[MIT](LICENSE)
