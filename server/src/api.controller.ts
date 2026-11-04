import { Controller, Get, Header, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common'
import { AlertsService, type AlertsResponse } from './alerts.service.js'
import type { Config, GrafanaLink, UI } from './config.js'
import { CONFIG } from './tokens.js'

@Controller('api')
export class ApiController {
  private readonly log = new Logger(ApiController.name)

  constructor(
    @Inject(CONFIG) private readonly cfg: Config,
    @Inject(AlertsService) private readonly alerts: AlertsService,
  ) {}

  @Get('alerts')
  @Header('Cache-Control', 'no-store')
  async getAlerts(): Promise<AlertsResponse> {
    try {
      return await this.alerts.load()
    } catch (e) {
      const msg = (e as Error).message
      this.log.error(`fetch alerts: ${msg}`)
      throw new HttpException({ error: msg }, HttpStatus.BAD_GATEWAY)
    }
  }

  @Get('config')
  @Header('Cache-Control', 'no-store')
  getConfig(): UI & { alertmanagerURL: string; grafana: GrafanaLink[] } {
    return { alertmanagerURL: this.cfg.alertmanager.publicUrl, grafana: this.cfg.grafana, ...this.cfg.ui }
  }
}
