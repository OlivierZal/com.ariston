import type { Capabilities, DeviceDetails, FlowArgs } from '../../types'
import { type LoginCredentials, WheType } from '../../ariston/types'
import type AristonAPI from '../../ariston/api'
import type AristonApp from '../../app'
import { Driver } from 'homey'
import type PairSession from 'homey/lib/PairSession'

export = class NuosDriver extends Driver {
  readonly #aristonAPI: AristonAPI = (this.homey.app as AristonApp).aristonAPI

  readonly #deviceType: WheType = WheType.nuos

  readonly #flowCapabilities: (keyof Capabilities)[] = [
    'onoff.auto',
    'onoff.boost',
    'onoff.legionella',
    'onoff.preheating',
    'operation_mode',
  ]

  public async onInit(): Promise<void> {
    this.#registerRunListeners()
    return Promise.resolve()
  }

  public async onPair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        this.#applyLogin(data),
    )
    session.setHandler(
      'list_devices',
      async (): Promise<DeviceDetails[]> => this.#discoverDevices(),
    )
    return Promise.resolve()
  }

  public async onRepair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        this.#applyLogin(data),
    )
    return Promise.resolve()
  }

  async #applyLogin(data: LoginCredentials): Promise<boolean> {
    return this.#aristonAPI.applyLogin(data)
  }

  async #discoverDevices(): Promise<DeviceDetails[]> {
    try {
      return (
        (await this.#aristonAPI.plants()).data
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          .filter(({ wheType }) => wheType === this.#deviceType)
          .map(({ gw, name }): DeviceDetails => ({ data: { id: gw }, name }))
      )
    } catch (error: unknown) {
      return []
    }
  }

  #registerRunListeners(): void {
    this.#flowCapabilities.forEach((capability: keyof Capabilities) => {
      if (capability === 'operation_mode') {
        this.homey.flow
          .getConditionCard(`${capability}_condition`)
          .registerRunListener(
            (args: FlowArgs): boolean =>
              args.operation_mode ===
              args.device.getCapabilityValue(capability),
          )
      } else {
        this.homey.flow
          .getConditionCard(`${capability}_condition`)
          .registerRunListener(
            (args: FlowArgs): boolean =>
              args.device.getCapabilityValue(capability) as boolean,
          )
      }
      this.homey.flow
        .getActionCard(`${capability}_action`)
        .registerRunListener(async (args: FlowArgs): Promise<void> => {
          await args.device.triggerCapabilityListener(
            capability,
            args[capability as keyof FlowArgs],
          )
        })
    })
  }
}
