import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type NuosDriver from './driver'
import type AristonApp from '../../app'
import withAPI from '../../mixins/withAPI'
import type {
  CapabilityValue,
  DeviceDetails,
  PlantData,
  Settings,
} from '../../types'

enum OperationMode {
  green = 0,
  comfort = 1,
  fast = 2,
  auto = 3,
}

export = class NuosDevice extends withAPI(Device) {
  public declare driver: NuosDriver

  public id!: string

  protected app!: AristonApp

  #syncTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
    await this.setWarning(null)
    this.app = this.homey.app as AristonApp

    const { id } = this.getData() as DeviceDetails['data']
    this.id = id

    await this.handleCapabilities()
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  public async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: Settings
    changedKeys: string[]
  }): Promise<void> {
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      !(this.getCapabilityValue('onoff') as boolean)
    ) {
      await this.triggerCapabilityListener('onoff', true)
    }
  }

  public onDeleted(): void {
    this.clearSync()
  }

  public async addCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      return
    }
    try {
      await super.addCapability(capability)
      this.log('Adding capability', capability)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  public async removeCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      return
    }
    try {
      await super.removeCapability(capability)
      this.log('Removing capability', capability)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  public async setCapabilityValue(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    if (
      !this.hasCapability(capability) ||
      value === this.getCapabilityValue(capability)
    ) {
      return
    }
    try {
      await super.setCapabilityValue(capability, value)
      this.log('Capability', capability, 'is', value)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  public async setWarning(warning: string | null): Promise<void> {
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  private async onCapability(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    this.clearSync()
    switch (capability) {
      case 'onoff':
        if ((this.getSetting('always_on') as boolean) && !(value as boolean)) {
          await this.setWarning(this.homey.__('warnings.always_on'))
        } else {
          await this.plantData({
            // @ts-expect-error: `on` is not a valid key
            data: { plantData: { on: value as boolean } },
          })
        }
        break
      case 'operation_mode':
        await this.plantData({
          data: {
            // @ts-expect-error: `on` is not a valid key
            plantData: {
              opMode: OperationMode[value as keyof typeof OperationMode],
            },
          },
        })
        break
      case 'target_temperature':
        await this.plantData({
          // @ts-expect-error: `on` is not a valid key
          data: { plantData: { comfortTemp: value as number } },
        })
        break
      default:
    }
  }

  private async handleCapabilities(): Promise<void> {
    const requiredCapabilities: string[] = this.driver.manifest
      .capabilities as string[] // eslint-disable-line @typescript-eslint/no-unsafe-member-access
    await requiredCapabilities.reduce<Promise<void>>(
      async (acc, capability: string) => {
        await acc
        return this.addCapability(capability)
      },
      Promise.resolve(),
    )
    await this.getCapabilities()
      .filter(
        (capability: string) => !requiredCapabilities.includes(capability),
      )
      .reduce<Promise<void>>(async (acc, capability: string) => {
        await acc
        await this.removeCapability(capability)
      }, Promise.resolve())
  }

  private registerCapabilityListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.driver.manifest.capabilities as string[]).forEach(
      (capability: string): void => {
        this.registerCapabilityListener(
          capability,
          async (value: CapabilityValue): Promise<void> => {
            await this.onCapability(capability, value)
          },
        )
      },
    )
  }

  private async syncFromDevice(): Promise<void> {
    await this.updateCapabilities()
    this.applySyncFromDevice()
  }

  private async updateCapabilities(): Promise<void> {
    try {
      const data: PlantData | null = await this.plantData()
      if (!data) {
        return
      }
      const { on, opMode, comfortTemp, waterTemp } = data.data.plantData
      await this.setCapabilityValue('measure_temperature', waterTemp)
      await this.setCapabilityValue('onoff', on)
      await this.setCapabilityValue('operation_mode', OperationMode[opMode])
      await this.setCapabilityValue('target_temperature', comfortTemp)
    } catch (error: unknown) {
      // Logged by `withAPI`
    }
  }

  private async plantData(
    postData?: Partial<PlantData>,
  ): Promise<PlantData | null> {
    try {
      const method: 'get' | 'post' = postData ? 'post' : 'get'
      const methodPath: 'GetData' | 'SetData' = postData ? 'SetData' : 'GetData'
      const url: URL = new URL(
        `/R2/PlantHomeSlp/${methodPath}/${this.id}`,
        this.api.defaults.baseURL,
      )
      if (!postData) {
        url.search = new URLSearchParams({
          fetchSettings: 'true',
          fetchTimeProg: 'false',
        }).toString()
      }
      const { data } = await this.api<PlantData>({
        method,
        url: url.toString(),
        data: postData,
      })
      return data
    } catch (error: unknown) {
      return null
    }
  }

  private applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncFromDevice()
    }, 60000)
    this.log('Next sync in 1 minute')
  }

  private clearSync(): void {
    this.homey.clearTimeout(this.#syncTimeout)
    this.log('Sync has been paused')
  }
}
