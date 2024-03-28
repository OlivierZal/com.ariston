import { App } from 'homey'
import AristonAPI from './ariston/api'
import { Settings as LuxonSettings } from 'luxon'

export = class AristonApp extends App {
  public readonly aristonAPI = new AristonAPI(
    this.homey.settings,
    this.log.bind(this),
    this.error.bind(this),
  )

  public async onInit(): Promise<void> {
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.aristonAPI.applyLogin()
  }
}
