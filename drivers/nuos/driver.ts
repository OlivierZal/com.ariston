import { Driver } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type PairSession from 'homey/lib/PairSession'
import type AristonApp from '../../app'
import withAPI from '../../mixins/withAPI'
import type { DeviceDetails, LoginCredentials, Plant } from '../../types'

export = class NuosDriver extends withAPI(Driver) {
  #app!: AristonApp

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.#app = this.homey.app as AristonApp
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onPair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> => this.#app.login(data),
    )
    session.setHandler(
      'list_devices',
      async (): Promise<DeviceDetails[]> => this.discoverDevices(),
    )
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onRepair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> => this.#app.login(data),
    )
  }

  private async discoverDevices(): Promise<DeviceDetails[]> {
    try {
      const { data } = await this.api.get<Plant[]>('/api/v2/velis/plants')
      return data.map(
        ({ gw, name }): DeviceDetails => ({
          name,
          data: {
            id: gw,
          },
        }),
      )
    } catch (error: unknown) {
      return []
    }
  }
}
