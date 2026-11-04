import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import type { AMAlert, Fetcher } from './alertmanager.js'
import { AppModule } from './app.module.js'
import { credentialsFromEnv, type Credentials } from './basic-auth.js'
import { parseConfig } from './config.js'

class FakeFetcher implements Fetcher {
  calls = 0
  constructor(
    private alerts: AMAlert[] = [],
    private err?: Error,
  ) {}
  async fetch() {
    this.calls++
    if (this.err) throw this.err
    return this.alerts
  }
}

const cfg = () =>
  parseConfig(`
cache_ttl: 1m
alertmanager: { url: http://am:9093, public_url: http://am.public:9093 }
prometheus: { url: http://prom:8090 }
problems: [{ match: .*DiskSpace.*, title: Диск }]
`)

let app: INestApplication | undefined

async function start(f: Fetcher, auth?: Credentials, httpsOptions?: { cert: Buffer; key: Buffer }) {
  const dir = mkdtempSync(join(tmpdir(), 'alertboard-'))
  writeFileSync(join(dir, 'index.html'), '<html>app</html>')
  app = await NestFactory.create(AppModule.create(cfg(), f, dir, auth), { logger: false, httpsOptions })
  await app.init()
  return app.getHttpServer()
}

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('api', () => {
  it('returns enriched alerts', async () => {
    const srv = await start(
      new FakeFetcher([
        {
          fingerprint: 'f1',
          labels: { alertname: 'FS_DiskSpaceLessThan10Percentages', node: 'fs25' },
          annotations: { name: 'fs25 /mnt/st9' },
          startsAt: '2026-11-01T18:00:00Z',
          generatorURL: 'http://3f2a1c9e0b7d:9090/graph?g0.expr=up',
          status: { state: 'suppressed', silencedBy: ['s1'], inhibitedBy: null },
        },
      ]),
    )
    const r = await request(srv).get('/api/alerts').expect(200)
    expect(r.headers['cache-control']).toBe('no-store')
    expect(r.body.fetchedAt).toBeTruthy()
    expect(r.body.alerts).toEqual([
      {
        fingerprint: 'f1',
        alertname: 'FS_DiskSpaceLessThan10Percentages',
        problem: 'Диск',
        labels: { alertname: 'FS_DiskSpaceLessThan10Percentages', node: 'fs25' },
        annotations: { name: 'fs25 /mnt/st9' },
        startsAt: '2026-11-01T18:00:00Z',
        state: 'suppressed',
        silencedBy: ['s1'],
        inhibitedBy: [],
        expr: 'up',
        promLinks: [{ name: 'prom', url: 'http://prom:8090/graph?g0.expr=up' }],
      },
    ])
  })

  it('upstream error is 502 with message', async () => {
    const srv = await start(new FakeFetcher([], new Error('alertmanager: HTTP 401: Unauthorized')))
    const r = await request(srv).get('/api/alerts').expect(502)
    expect(r.body.error).toContain('401')
  })

  it('caches responses, shares concurrent fetches, does not cache errors', async () => {
    const ok = new FakeFetcher()
    let srv = await start(ok)
    await Promise.all([request(srv).get('/api/alerts'), request(srv).get('/api/alerts')])
    await request(srv).get('/api/alerts')
    expect(ok.calls).toBe(1)
    await app!.close()

    const bad = new FakeFetcher([], new Error('down'))
    srv = await start(bad)
    await request(srv).get('/api/alerts')
    await request(srv).get('/api/alerts')
    expect(bad.calls).toBe(2)
  })

  it('config exposes public url only', async () => {
    const srv = await start(new FakeFetcher())
    const r = await request(srv).get('/api/config').expect(200)
    expect(r.body.alertmanagerURL).toBe('http://am.public:9093')
    expect(r.body.groupLabel).toBe('severity')
    expect(r.body.grafana).toEqual([])
    expect(r.text).not.toContain('http://am:9093')
  })

  it('serves index.html for unknown routes', async () => {
    const srv = await start(new FakeFetcher())
    for (const p of ['/', '/some/route']) {
      const r = await request(srv).get(p).expect(200)
      expect(r.text).toContain('app')
    }
  })

  it('basic auth protects pages, static files and api', async () => {
    const srv = await start(new FakeFetcher(), { user: 'admin', password: 'p:ss' })
    for (const p of ['/', '/index.html', '/some/route', '/api/config', '/api/alerts']) {
      const r = await request(srv).get(p).expect(401)
      expect(r.headers['www-authenticate']).toContain('Basic')
    }
    await request(srv).get('/api/config').auth('admin', 'wrong').expect(401)
    await request(srv).get('/api/config').auth('other', 'p:ss').expect(401)
    await request(srv).get('/api/config').auth('admin', 'p:ss').expect(200)
    const r = await request(srv).get('/').auth('admin', 'p:ss').expect(200)
    expect(r.text).toContain('app')
  })

  it('credentials come from env and must be set together', () => {
    expect(credentialsFromEnv({})).toBeUndefined()
    expect(credentialsFromEnv({ AUTH_USER: 'a', AUTH_PASSWORD: 'b' })).toEqual({ user: 'a', password: 'b' })
    expect(() => credentialsFromEnv({ AUTH_USER: 'a' })).toThrow(/together/)
    expect(() => credentialsFromEnv({ AUTH_PASSWORD: 'b' })).toThrow(/together/)
  })

  it('serves https when certificates are given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alertboard-tls-'))
    const [crt, key] = [join(dir, 'tls.crt'), join(dir, 'tls.key')]
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', key, '-out', crt], { stdio: 'ignore' })
    const srv = await start(new FakeFetcher(), undefined, { cert: readFileSync(crt), key: readFileSync(key) })
    const r = await request(srv).get('/api/config').disableTLSCerts().expect(200)
    expect(r.request.url.startsWith('https://')).toBe(true)
  })
})
