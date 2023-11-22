import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import { Duration } from 'luxon'
import type NuosDriver from './driver'
import type AristonApp from '../../app'
import addToLogs from '../../decorators/addToLogs'
import withAPI from '../../mixins/withAPI'
import type {
  CapabilityValue,
  Data,
  DeviceDetails,
  PlantData,
  Settings,
} from '../../types'

const initialData: Data['data'] = { plantData: {}, viewModel: {} }

enum Mode {
  manual = 1,
  auto = 2,
}

enum OperationMode {
  green = 0,
  comfort = 1,
  fast = 2,
  auto = 3,
}

@addToLogs('getName()')
class NuosDevice extends withAPI(Device) {
  public declare driver: NuosDriver

  public id!: string

  protected app!: AristonApp

  #data: Data['data'] = initialData

  #syncTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
    await this.setWarning(null)
    this.app = this.homey.app as AristonApp

    const { id } = this.getData() as DeviceDetails['data']
    this.id = id

    await this.handleCapabilities()
    this.registerCapabilityListeners()
    await this.sync()
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
          this.#data.plantData.on = this.getCapabilityValue('onoff') as boolean
          this.#data.viewModel.on = value as boolean
        }
        break
      case 'onoff.boost':
        this.#data.plantData.boostOn = this.getCapabilityValue(
          'onoff.boost',
        ) as boolean
        this.#data.viewModel.boostOn = value as boolean
        break
      case 'operation_mode':
        this.#data.plantData.opMode =
          OperationMode[
            this.getCapabilityValue(
              'operation_mode',
            ) as keyof typeof OperationMode
          ]
        this.#data.viewModel.opMode =
          OperationMode[value as keyof typeof OperationMode]
        break
      case 'target_temperature':
        this.#data.plantData.comfortTemp = this.getCapabilityValue(
          'target_temperature',
        ) as number
        this.#data.viewModel.comfortTemp = value as number
        break
      case 'mode':
        this.#data.plantData.mode =
          Mode[this.getCapabilityValue('mode') as keyof typeof Mode]
        this.#data.viewModel.plantMode = Mode[value as keyof typeof Mode]
        break
      default:
    }
    this.applySyncToDevice()
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

  private async sync(plantData?: PlantData | null): Promise<void> {
    await this.updateCapabilities(plantData ?? null)
    this.applySyncFromDevice()
  }

  private async updateCapabilities(plantData: PlantData | null): Promise<void> {
    const newPlantData: PlantData | null = plantData ?? (await this.plantData())
    if (!newPlantData) {
      return
    }
    const { boostOn, mode, on, opMode, comfortTemp, waterTemp } = newPlantData
    await this.setCapabilityValue('measure_temperature', waterTemp)
    await this.setCapabilityValue('mode', Mode[mode])
    await this.setCapabilityValue('onoff', on)
    await this.setCapabilityValue('onoff.boost', boostOn)
    await this.setCapabilityValue('operation_mode', OperationMode[opMode])
    await this.setCapabilityValue('target_temperature', comfortTemp)
  }

  private async plantData(post = false): Promise<PlantData | null> {
    if (post && !Object.keys(this.#data.viewModel).length) {
      return null
    }
    try {
      const { data } = await this.api<Data>({
        method: post ? 'post' : 'get',
        url: `/R2/PlantHomeSlp/${post ? 'SetData' : 'GetData'}/${this.id}`,
        params: post
          ? undefined
          : {
              fetchSettings: 'false',
              fetchTimeProg: 'false',
            },
        data: post ? this.#data : undefined,
      })
      this.#data = initialData
      return data.data.plantData as PlantData
    } catch (error: unknown) {
      return null
    }
  }

  private applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        const plantData: PlantData | null = await this.plantData(true)
        await this.sync(plantData)
      },
      Duration.fromObject({ seconds: 1 }).as('milliseconds'),
    )
  }

  private applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.sync()
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  private clearSync(): void {
    this.homey.clearTimeout(this.#syncTimeout)
  }
}

export = NuosDevice
