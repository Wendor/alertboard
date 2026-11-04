import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { AlertmanagerClient } from './alertmanager.js'
import { AppModule } from './app.module.js'
import { credentialsFromEnv } from './basic-auth.js'
import { loadConfig, splitHostPort } from './config.js'

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: 'config.yaml' },
      listen: { type: 'string' },
      env: { type: 'string', default: '.env' },
    },
  })
  // already set environment variables win over the file
  if (existsSync(values.env!)) process.loadEnvFile(values.env)
  const cfg = loadConfig(values.config!)
  const listen = values.listen || process.env.LISTEN
  if (listen) cfg.listen = listen
  const { host, port } = splitHostPort(cfg.listen)
  const auth = credentialsFromEnv(process.env)

  const client = new AlertmanagerClient(cfg.alertmanager.url, process.env.AM_USER, process.env.AM_PASSWORD)
  const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist')
  const app = await NestFactory.create(AppModule.create(cfg, client, staticRoot, auth), { logger: ['log', 'error', 'warn'] })
  app.enableShutdownHooks()
  await app.listen(port, host)
  Logger.log(`alertboard listening on http://${cfg.listen}${auth ? ' (basic auth)' : ''}`, 'main')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
