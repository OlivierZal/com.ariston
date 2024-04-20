import type { DeviceDetails, FlowArgs, ManifestDriver } from '../../types'
import { type LoginCredentials, WheType } from '../../ariston/types'
import type AristonApp from '../../app'
import { Driver } from 'homey'
import type PairSession from 'homey/lib/PairSession'

export = class NuosDriver extends Driver {
  readonly #aristonAPI = (this.homey.app as AristonApp).aristonAPI

  readonly #deviceType = WheType.nuos

  readonly #onoffCapabilities = (
    this.manifest as ManifestDriver
  ).capabilities.filter((capability) => capability.startsWith('onoff.'))

  public async onInit(): Promise<void> {
    this.#registerRunListeners()
    return Promise.resolve()
  }

  public async onPair(session: PairSession): Promise<void> {
    session.setHandler('showView', async (view) => {
      if (view === 'loading') {
        if (await this.#aristonAPI.applyLogin()) {
          await session.showView('list_devices')
          return
        }
        await session.showView('login')
      }
    })
    session.setHandler('login', async (data: LoginCredentials) =>
      this.#aristonAPI.applyLogin(data),
    )
    session.setHandler('list_devices', async () => this.#discoverDevices())
    return Promise.resolve()
  }

  public async onRepair(session: PairSession): Promise<void> {
    session.setHandler('login', async (data: LoginCredentials) =>
      this.#aristonAPI.applyLogin(data),
    )
    return Promise.resolve()
  }

  async #discoverDevices(): Promise<DeviceDetails[]> {
    try {
      return (await this.#aristonAPI.plants()).data
        .filter(({ wheType }) => wheType === this.#deviceType)
        .map(({ gw, name }) => ({ data: { id: gw }, name }))
    } catch (error) {
      return []
    }
  }

  #registerRunListeners(): void {
    this.homey.flow
      .getConditionCard('operation_mode_condition')
      .registerRunListener(
        (args: FlowArgs) =>
          args.device.getCapabilityValue('operation_mode') ===
          args.operation_mode,
      )
    this.homey.flow
      .getActionCard('operation_mode_action')
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener(
          'operation_mode',
          args.operation_mode,
        )
      })
    this.#onoffCapabilities.forEach((capability) => {
      this.homey.flow
        .getConditionCard(`${capability}_condition`)
        .registerRunListener(
          (args: FlowArgs) =>
            args.device.getCapabilityValue(capability) as boolean,
        )
      this.homey.flow
        .getActionCard(`${capability}_action`)
        .registerRunListener(async (args: FlowArgs) => {
          await args.device.triggerCapabilityListener(capability, args.onoff)
        })
    })
  }
}
