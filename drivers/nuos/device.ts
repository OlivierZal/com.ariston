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

const dataMapping: Record<string, string> = {
  onoff: 'on',
  measure_temperature: 'waterTemp',
  target_temperature: 'comfortTemp',
}

export = class NuosDevice extends withAPI(Device) {
  public declare driver: NuosDriver

  public id!: string

  protected app!: AristonApp

  #syncTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
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

  private async onCapability(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    this.clearSync()
    await this.plantData({ [dataMapping[capability]]: value })
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
      const { on, waterTemp, comfortTemp } = data
      await this.setCapabilityValue('target_temperature', comfortTemp)
      await this.setCapabilityValue('measure_temperature', waterTemp)
      await this.setCapabilityValue('onoff', on)
    } catch (error: unknown) {
      // Logged by `withAPI`
    }
  }

  private async plantData(
    postData?: Record<string, CapabilityValue>,
  ): Promise<PlantData | null> {
    try {
      const { data } = await this.api<PlantData>({
        method: postData ? 'post' : 'get',
        url: `/velis/slpPlantData/${this.id}`,
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
