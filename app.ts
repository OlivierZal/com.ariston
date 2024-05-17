import { App } from 'homey'
import AristonAPI from '@olivierzal/ariston-api'
import { Settings as LuxonSettings } from 'luxon'

export = class extends App {
  public readonly aristonAPI = new AristonAPI(this.homey.settings, {
    error: (...args): void => {
      this.error(...args)
    },
    log: (...args): void => {
      this.log(...args)
    },
  })

  public override async onInit(): Promise<void> {
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.aristonAPI.applyLogin()
  }
}
