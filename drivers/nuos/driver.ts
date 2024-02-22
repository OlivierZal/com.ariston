import type { Capabilities, DeviceDetails, FlowArgs } from '../../types/types'
import { type LoginCredentials, WheType } from '../../types/AristonAPITypes'
import type AristonAPI from '../../lib/AristonAPI'
import type AristonApp from '../../app'
import { Driver } from 'homey'
import type PairSession from 'homey/lib/PairSession'

export = class NuosDriver extends Driver {
  readonly #aristonAPI: AristonAPI = (this.homey.app as AristonApp).aristonAPI

  readonly #deviceType: WheType = WheType.nuos

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.#registerRunListeners()
  }

  // eslint-disable-next-line @typescript-eslint/require-await
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
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onRepair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        this.#applyLogin(data),
    )
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.manifest.capabilities as (keyof Capabilities)[]).forEach(
      (capability: keyof Capabilities) => {
        if (capability === 'operation_mode') {
          this.homey.flow
            .getConditionCard(`${capability}_condition`)
            .registerRunListener(
              (args: FlowArgs): boolean =>
                args.operation_mode ===
                args.device.getCapabilityValue(capability),
            )
          this.homey.flow
            .getActionCard(`${capability}_action`)
            .registerRunListener(async (args: FlowArgs): Promise<void> => {
              await args.device.onCapability(capability, args.operation_mode)
            })
        } else if (capability.startsWith('onoff.')) {
          this.homey.flow
            .getConditionCard(`${capability}_condition`)
            .registerRunListener(
              (args: FlowArgs): boolean =>
                args.device.getCapabilityValue(capability) as boolean,
            )
          this.homey.flow
            .getActionCard(`${capability}_action`)
            .registerRunListener(async (args: FlowArgs): Promise<void> => {
              await args.device.onCapability(capability, args.onoff)
            })
        }
      },
    )
  }
}
