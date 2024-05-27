import { App } from 'homey'
import AristonAPI from '@olivierzal/ariston-api'
import { Settings as LuxonSettings } from 'luxon'

export = class AristonApp extends App {
  public readonly aristonAPI = new AristonAPI({
    language: this.homey.i18n.getLanguage(),
    logger: {
      error: (...args): void => {
        this.error(...args)
      },
      log: (...args): void => {
        this.log(...args)
      },
    },
    settingManager: this.homey.settings,
  })

  public override async onInit(): Promise<void> {
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.aristonAPI.applyLogin()
  }
}
