import { App } from 'homey'
import AristonAPI from './lib/AristonAPI'
import { Settings as LuxonSettings } from 'luxon'

export = class AristonApp extends App {
  public readonly aristonAPI: AristonAPI = new AristonAPI(
    this.homey.settings,
    this.log.bind(this),
    this.error.bind(this),
  )

  public async onInit(): Promise<void> {
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.aristonAPI.attemptAutoLogin()
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onUninit(): Promise<void> {
    this.aristonAPI.clearLoginRefresh()
  }
}
