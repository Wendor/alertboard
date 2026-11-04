import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export interface Credentials {
  user: string
  password: string
}

// Both AUTH_USER and AUTH_PASSWORD enable auth; only one of them is a config mistake.
export function credentialsFromEnv(env: NodeJS.ProcessEnv): Credentials | undefined {
  const user = env.AUTH_USER ?? ''
  const password = env.AUTH_PASSWORD ?? ''
  if (!user && !password) return undefined
  if (!user || !password) throw new Error('AUTH_USER and AUTH_PASSWORD must be set together')
  return { user, password }
}

const digest = (s: string) => createHash('sha256').update(s).digest()
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

export function basicAuth(creds: Credentials) {
  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ')
    if (scheme?.toLowerCase() === 'basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      const i = decoded.indexOf(':')
      // evaluate both comparisons to keep timing independent of which part is wrong
      const userOk = same(decoded.slice(0, i), creds.user)
      const passOk = same(decoded.slice(i + 1), creds.password)
      if (i >= 0 && userOk && passOk) return next()
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="alertboard", charset="UTF-8"')
    res.status(401).json({ error: 'authentication required' })
  }
}
