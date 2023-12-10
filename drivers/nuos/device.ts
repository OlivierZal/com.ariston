import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import { DateTime, Duration } from 'luxon'
import type NuosDriver from './driver'
import type AristonApp from '../../app'
import addToLogs from '../../decorators/addToLogs'
import withAPI from '../../mixins/withAPI'
import type {
  CapabilityValue,
  DeviceDetails,
  GetData,
  GetSettings,
  PostData,
  PostSettings,
  SettingValue,
  Settings,
} from '../../types'

const initialData: PostData = {
  plantData: {},
  viewModel: {},
}

enum Mode {
  auto = 1,
  manual = 2,
}

const convertToMode = (value: boolean): Mode =>
  value ? Mode.auto : Mode.manual

enum OperationMode {
  green = 0,
  comfort = 1,
  fast = 2,
  auto = 3,
}

const convertToOperationMode = (
  value: keyof typeof OperationMode,
): OperationMode => OperationMode[value]

const convertToVacationDate = (value: string): string | null => {
  const days = Number(value)
  return days > 0
    ? DateTime.now()
        .plus({
          days,
        })
        .toISODate()
    : null
}

@addToLogs('getName()')
class NuosDevice extends withAPI(Device) {
  public declare driver: NuosDriver

  public id!: string

  protected app!: AristonApp

  #data: PostData = initialData

  #settings: PostSettings = {}

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

    if (changedKeys.includes('min') && newSettings.min !== undefined) {
      this.#settings.SlpMinSetpointTemperature = { new: newSettings.min }
    }
    if (changedKeys.includes('max') && newSettings.max !== undefined) {
      this.#settings.SlpMaxSetpointTemperature = { new: newSettings.max }
    }
    if (Object.keys(this.#settings).length) {
      await this.updateSettings()
      await this.updateTargetTemperatureMinMax(newSettings)
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

  public async setSettings(settings: Settings): Promise<void> {
    const newSettings: Settings = Object.fromEntries(
      Object.entries(settings).filter(
        ([key, value]: [string, SettingValue]) =>
          value !== this.getSetting(key),
      ),
    )
    if (!Object.keys(newSettings).length) {
      return
    }
    await super.setSettings(newSettings)
    if (
      ['min', 'max'].some((key: string) =>
        Object.keys(newSettings).includes(key),
      )
    ) {
      await this.updateTargetTemperatureMinMax()
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
    const oldValue: CapabilityValue = this.getCapabilityValue(
      capability,
    ) as CapabilityValue
    switch (capability) {
      case 'onoff':
        if ((this.getSetting('always_on') as boolean) && !(value as boolean)) {
          await this.setWarning(this.homey.__('warnings.always_on'))
        } else {
          this.#data.plantData.on = oldValue as boolean
          this.#data.viewModel.on = value as boolean
        }
        break
      case 'onoff.auto':
        this.#data.plantData.mode = convertToMode(oldValue as boolean)
        this.#data.viewModel.plantMode = convertToMode(value as boolean)
        break
      case 'onoff.boost':
        this.#data.plantData.boostOn = oldValue as boolean
        this.#data.viewModel.boostOn = value as boolean
        break
      case 'onoff.legionella':
        this.#settings.SlpAntilegionellaOnOff = {
          old: Number(oldValue) as 0 | 1,
          new: Number(value) as 0 | 1,
        }
        break
      case 'onoff.preheating':
        this.#settings.SlpPreHeatingOnOff = {
          old: Number(oldValue) as 0 | 1,
          new: Number(value) as 0 | 1,
        }
        break
      case 'operation_mode':
        this.#data.plantData.opMode = convertToOperationMode(
          oldValue as keyof typeof OperationMode,
        )
        this.#data.viewModel.opMode = convertToOperationMode(
          value as keyof typeof OperationMode,
        )
        break
      case 'target_temperature':
        this.#data.plantData.comfortTemp = oldValue as number
        this.#data.viewModel.comfortTemp = value as number
        break
      case 'vacation':
        this.#data.plantData.holidayUntil = convertToVacationDate(
          oldValue as string,
        )
        this.#data.viewModel.holidayUntil = convertToVacationDate(
          value as string,
        )
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

  private async sync(post = false): Promise<void> {
    await this.updateCapabilities(post)
    this.applySyncFromDevice()
  }

  private async updateCapabilities(post: boolean): Promise<void> {
    const newData: GetData['data'] | null = await this.plant(post)
    if (!newData) {
      return
    }
    if (newData.plantSettings) {
      const {
        antilegionellaOnOff,
        preHeatingOnOff,
        minSetpointTemp,
        maxSetpointTemp,
      } = newData.plantSettings
      await this.setCapabilityValue('onoff.legionella', antilegionellaOnOff)
      await this.setCapabilityValue('onoff.preheating', preHeatingOnOff)
      await this.setSettings({
        min: minSetpointTemp.value,
        max: maxSetpointTemp.value,
      })
    }
    const {
      boostOn,
      comfortTemp,
      holidayUntil,
      mode,
      on,
      opMode,
      procReqTemp,
      waterTemp,
    } = newData.plantData
    await this.setCapabilityValue('measure_temperature', waterTemp)
    await this.setCapabilityValue('measure_temperature.required', procReqTemp)
    await this.setCapabilityValue('onoff', on)
    await this.setCapabilityValue('onoff.auto', (mode as Mode) === Mode.auto)
    await this.setCapabilityValue('onoff.boost', boostOn)
    await this.setCapabilityValue('operation_mode', OperationMode[opMode])
    await this.setCapabilityValue('target_temperature', comfortTemp)
    await this.setCapabilityValue(
      'vacation',
      String(
        holidayUntil !== null
          ? Math.ceil(
              Number(DateTime.fromISO(holidayUntil).diffNow('days').days),
            )
          : 0,
      ),
    )
  }

  private async plant(post = false): Promise<GetData['data'] | null> {
    if (post && !Object.keys(this.#data.viewModel).length) {
      return null
    }
    try {
      const { data } = await this.api<GetData>({
        method: post ? 'post' : 'get',
        url: `/R2/PlantHomeSlp/${post ? 'SetData' : 'GetData'}/${this.id}`,
        params: post
          ? undefined
          : {
              fetchSettings: 'true',
              fetchTimeProg: 'false',
            },
        data: post ? this.#data : undefined,
      })
      this.#data = initialData
      return data.data
    } catch (error: unknown) {
      return null
    }
  }

  private async updateSettings(): Promise<boolean> {
    if (!Object.keys(this.#settings).length) {
      return false
    }
    try {
      const { data } = await this.api.post<GetSettings>(
        `/api/v2/velis/slpPlantData/${this.id}/PlantSettings`,
        this.#settings,
      )
      const { success } = data
      if (success) {
        if (this.#settings.SlpAntilegionellaOnOff) {
          await this.setCapabilityValue(
            'onoff.legionella',
            Boolean(this.#settings.SlpAntilegionellaOnOff.new),
          )
        }
        if (this.#settings.SlpPreHeatingOnOff) {
          await this.setCapabilityValue(
            'onoff.preheating',
            Boolean(this.#settings.SlpPreHeatingOnOff.new),
          )
        }
        this.#settings = {}
      }
      return success
    } catch (error: unknown) {
      return false
    }
  }

  private applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.updateSettings()
        await this.sync(true)
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

  private async updateTargetTemperatureMinMax(
    settings: Settings = this.getSettings() as Settings,
  ): Promise<void> {
    const { min, max } = settings
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const options = this.getCapabilityOptions('target_temperature')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (min === options.min && max === options.max) {
      return
    }
    await this.setCapabilityOptions('target_temperature', {
      min,
      max,
    })
    await this.setWarning(this.homey.__('warnings.settings'))
  }
}

export = NuosDevice
