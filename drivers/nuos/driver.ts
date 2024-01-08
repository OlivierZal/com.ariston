import { Driver } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type PairSession from 'homey/lib/PairSession'
import type AristonApp from '../../app'
import withAPI from '../../mixins/withAPI'
import type {
  Capabilities,
  DeviceDetails,
  FlowArgs,
  LoginCredentials,
  Plant,
} from '../../types'

export = class NuosDriver extends withAPI(Driver) {
  readonly #app: AristonApp = this.homey.app as AristonApp

  readonly #deviceType = 4

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.registerFlowListeners()
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
      return data
        .filter(({ wheType }) => wheType === this.#deviceType)
        .map(({ gw, name }): DeviceDetails => ({ name, data: { id: gw } }))
    } catch (error: unknown) {
      return []
    }
  }

  private registerFlowListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.manifest.capabilities as (keyof Capabilities)[]).forEach(
      (capability: keyof Capabilities): void => {
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
              await args.device.triggerCapabilityListener(
                capability,
                args.operation_mode,
              )
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
              await args.device.triggerCapabilityListener(
                capability,
                args.onoff,
              )
            })
        }
      },
    )
  }
}
