import { type DynamicModule, Inject, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { ServeStaticModule } from '@nestjs/serve-static'
import type { Fetcher } from './alertmanager.js'
import { AlertsService } from './alerts.service.js'
import { ApiController } from './api.controller.js'
import { basicAuth, type Credentials } from './basic-auth.js'
import type { Config } from './config.js'
import { Enricher } from './enrich.js'
import { AUTH, CONFIG, ENRICHER, FETCHER } from './tokens.js'

@Module({})
export class AppModule implements NestModule {
  constructor(@Inject(AUTH) private readonly auth: Credentials | null) {}

  configure(consumer: MiddlewareConsumer) {
    if (this.auth) consumer.apply(basicAuth(this.auth)).forRoutes('*')
  }

  static create(cfg: Config, fetcher: Fetcher, staticRoot: string, auth?: Credentials): DynamicModule {
    return {
      module: AppModule,
      imports: [ServeStaticModule.forRoot({ rootPath: staticRoot, exclude: ['/api/{*path}'] })],
      controllers: [ApiController],
      providers: [
        { provide: CONFIG, useValue: cfg },
        { provide: AUTH, useValue: auth ?? null },
        { provide: FETCHER, useValue: fetcher },
        { provide: ENRICHER, useValue: new Enricher(cfg.problems, cfg.prometheus, cfg.grafana) },
        AlertsService,
      ],
    }
  }
}
