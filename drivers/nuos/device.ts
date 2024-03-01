import type {
  Capabilities,
  CapabilityOptionsEntries,
  DeviceDetails,
  RangeOptions,
  Settings,
  ValueOf,
} from '../../types'
import { DateTime, Duration } from 'luxon'
import {
  type GetData,
  type HistogramData,
  Mode,
  OperationMode,
  type PostData,
  type PostSettings,
  type ReportData,
  type Switch,
} from '../../ariston/types'
import type AristonAPI from '../../ariston/api'
import type AristonApp from '../../app'
import { Device } from 'homey'
import type NuosDriver from './driver'
import addToLogs from '../../decorators/addToLogs'

const DAYS_1 = 1
const ENERGY_REFRESH_HOURS = 2
const K_MULTIPLIER = 1000
const NUMBER_0 = 0
const SETTINGS: Record<string, keyof PostSettings> = {
  'onoff.legionella': 'SlpAntilegionellaOnOff',
  'onoff.preheating': 'SlpPreHeatingOnOff',
}

const convertToMode = (value: boolean): Mode =>
  value ? Mode.auto : Mode.manual

const convertToDate = (days: number): string | null =>
  days
    ? DateTime.now()
        .plus({ days: days - DAYS_1 })
        .toISODate()
    : null

const getEnergyData = (
  data: ReportData,
  seriesName: HistogramData['series'],
): HistogramData | undefined => {
  const histogramData: HistogramData[] =
    data.data.asKwhRaw.histogramData.filter(
      ({ tab, period }) =>
        tab === 'ConsumedElectricity' && period === 'CurrentDay',
    )
  return histogramData.find(({ series }) => series === seriesName)
}

const getEnergy = (energyData: HistogramData | undefined): number =>
  energyData
    ? energyData.items.reduce<number>(
        (acc, { y: yNumber }) => acc + yNumber,
        NUMBER_0,
      )
    : NUMBER_0

const getPower = (energyData: HistogramData | undefined): number => {
  const hour: number = DateTime.now().hour
  return (
    ((energyData?.items.find(({ x: xString }) => {
      const xNumber = Number(xString)
      return xNumber <= hour && hour < xNumber + ENERGY_REFRESH_HOURS
    })?.y ?? NUMBER_0) *
      K_MULTIPLIER) /
    ENERGY_REFRESH_HOURS
  )
}

@addToLogs('getName()')
class NuosDevice extends Device {
  public declare driver: NuosDriver

  #postData: PostData = { plantData: {}, viewModel: {} }

  #postSettings: PostSettings = {}

  #syncTimeout!: NodeJS.Timeout

  readonly #aristonAPI: AristonAPI = (this.homey.app as AristonApp).aristonAPI

  readonly #id: string = (this.getData() as DeviceDetails['data']).id

  public async addCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      await super.addCapability(capability)
    }
  }

  public getCapabilityOptions<K extends keyof CapabilityOptionsEntries>(
    capability: K,
  ): CapabilityOptionsEntries[K] {
    return super.getCapabilityOptions(capability) as CapabilityOptionsEntries[K]
  }

  public getCapabilityValue<K extends keyof Capabilities>(
    capability: K,
  ): Capabilities[K] {
    return super.getCapabilityValue(capability) as Capabilities[K]
  }

  public getSetting<K extends keyof Settings>(
    setting: K,
  ): NonNullable<Settings[K]> {
    return super.getSetting(setting) as NonNullable<Settings[K]>
  }

  public async onCapability<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    this.homey.clearTimeout(this.#syncTimeout)
    const oldValue: Capabilities[K] = this.getCapabilityValue(capability)
    switch (capability) {
      case 'onoff':
        if (this.getSetting('always_on') && !(value as boolean)) {
          await this.setWarning(this.homey.__('warnings.always_on'))
        } else {
          this.#postData.plantData.on = oldValue as boolean
          this.#postData.viewModel.on = value as boolean
        }
        break
      case 'onoff.auto':
        this.#postData.plantData.mode = convertToMode(oldValue as boolean)
        this.#postData.viewModel.plantMode = convertToMode(value as boolean)
        break
      case 'onoff.boost':
        this.#postData.plantData.boostOn = oldValue as boolean
        this.#postData.viewModel.boostOn = value as boolean
        break
      case 'onoff.legionella':
      case 'onoff.preheating':
        this.#postSettings[SETTINGS[capability]] = {
          new: Number(value) as Switch,
          old: Number(oldValue) as Switch,
        }
        break
      case 'operation_mode':
        this.#postData.plantData.opMode =
          OperationMode[oldValue as keyof typeof OperationMode]
        this.#postData.viewModel.opMode =
          OperationMode[value as keyof typeof OperationMode]
        break
      case 'target_temperature':
        this.#postData.plantData.comfortTemp = oldValue as number
        this.#postData.viewModel.comfortTemp = value as number
        break
      case 'vacation':
        this.#postData.plantData.holidayUntil = convertToDate(Number(oldValue))
        this.#postData.viewModel.holidayUntil = convertToDate(Number(value))
        break
      default:
    }
    this.#applySyncToDevice()
  }

  public onDeleted(): void {
    this.homey.clearTimeout(this.#syncTimeout)
  }

  public async onInit(): Promise<void> {
    await this.setWarning(null)
    await this.#handleCapabilities()
    this.#registerCapabilityListeners()
    await this.#sync()
    await this.#plantMetering()
    const now: DateTime = DateTime.now()
    this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#plantMetering()
        this.homey.setInterval(
          async (): Promise<void> => {
            await this.#plantMetering()
          },
          Duration.fromObject({ hours: ENERGY_REFRESH_HOURS }).as(
            'milliseconds',
          ),
        )
      },
      now
        .plus({
          hours: now.hour % ENERGY_REFRESH_HOURS || ENERGY_REFRESH_HOURS,
        })
        .set({ millisecond: 0, minute: 1, second: 0 })
        .diffNow()
        .as('milliseconds'),
    )
  }

  public async onSettings({
    changedKeys,
    newSettings,
  }: {
    changedKeys: string[]
    newSettings: Settings
  }): Promise<void> {
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      !this.getCapabilityValue('onoff')
    ) {
      await this.onCapability('onoff', true)
    }
    if (changedKeys.includes('min') && typeof newSettings.min !== 'undefined') {
      this.#postSettings.SlpMinSetpointTemperature = { new: newSettings.min }
    }
    if (changedKeys.includes('max') && typeof newSettings.max !== 'undefined') {
      this.#postSettings.SlpMaxSetpointTemperature = { new: newSettings.max }
    }
    if (
      (await this.#plantSettings()) &&
      changedKeys.some((key: string) => ['min', 'max'].includes(key))
    ) {
      await this.#updateTargetTemperatureMinMax(newSettings)
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onUninit(): Promise<void> {
    this.onDeleted()
  }

  public async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  public async setCapabilityOptions<K extends keyof CapabilityOptionsEntries>(
    capability: K,
    options: CapabilityOptionsEntries[K],
  ): Promise<void> {
    await super.setCapabilityOptions(capability, options)
  }

  public async setCapabilityValue<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    this.log('Capability', capability, 'is', value)
    if (value !== this.getCapabilityValue(capability)) {
      await super.setCapabilityValue(capability, value)
    }
  }

  public async setSettings(settings: Settings): Promise<void> {
    const newSettings: Settings = Object.fromEntries(
      Object.entries(settings).filter(
        ([key, value]: [string, ValueOf<Settings>]) =>
          value !== this.getSetting(key as keyof Settings),
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
      await this.#updateTargetTemperatureMinMax()
    }
  }

  public async setWarning(warning: string | null): Promise<void> {
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  #applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#sync()
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  #applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#plantSettings()
        await this.#sync(true)
      },
      Duration.fromObject({ seconds: 1 }).as('milliseconds'),
    )
  }

  async #handleCapabilities(): Promise<void> {
    const requiredCapabilities: string[] =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.driver.manifest.capabilities as string[]
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

  async #plantData(post = false): Promise<GetData['data'] | null> {
    if (!post || Object.keys(this.#postData.viewModel).length) {
      try {
        const { data } = (
          await this.#aristonAPI.plantData(
            this.#id,
            post ? this.#postData : null,
          )
        ).data
        if (post) {
          this.#postData = { plantData: {}, viewModel: {} }
        }
        return data
      } catch (error: unknown) {
        // Error handling is delegated to the interceptor
      }
    }
    return null
  }

  async #plantMetering(): Promise<void> {
    try {
      const { data } = await this.#aristonAPI.plantMetering(this.#id)
      const energyHpData: HistogramData | undefined = getEnergyData(
        data,
        'DhwHp',
      )
      const energyResistorData: HistogramData | undefined = getEnergyData(
        data,
        'DhwResistor',
      )
      await this.#setPowerValues(
        getPower(energyHpData),
        getPower(energyResistorData),
      )
      await this.#setEnergyValues(
        getEnergy(energyHpData),
        getEnergy(energyResistorData),
      )
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  async #plantSettings(): Promise<boolean> {
    if (Object.keys(this.#postSettings).length) {
      try {
        const { success } = (
          await this.#aristonAPI.plantSettings(this.#id, this.#postSettings)
        ).data
        if (success) {
          await this.#setSettingCapabilityValues()
          this.#postSettings = {}
        }
        return success
      } catch (error: unknown) {
        // Error handling is delegated to the interceptor
      }
    }
    return false
  }

  #registerCapabilityListeners<K extends keyof Capabilities>(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.driver.manifest.capabilities as K[]).forEach((capability: K) => {
      this.registerCapabilityListener(
        capability,
        async (value: Capabilities[K]): Promise<void> => {
          await this.onCapability(capability, value)
        },
      )
    })
  }

  async #setDataValues(plantData: GetData['data']['plantData']): Promise<void> {
    await this.setCapabilityValue('measure_temperature', plantData.waterTemp)
    await this.setCapabilityValue(
      'measure_temperature.required',
      plantData.procReqTemp,
    )
    await this.setCapabilityValue('onoff', plantData.on)
    await this.setCapabilityValue('onoff.auto', plantData.mode === Mode.auto)
    await this.setCapabilityValue('onoff.boost', plantData.boostOn)
    await this.setCapabilityValue(
      'operation_mode',
      OperationMode[plantData.opMode] as keyof typeof OperationMode,
    )
    await this.setCapabilityValue('target_temperature', plantData.comfortTemp)
    await this.setCapabilityValue(
      'vacation',
      String(
        plantData.holidayUntil === null
          ? NUMBER_0
          : Math.ceil(
              DateTime.fromISO(plantData.holidayUntil)
                .plus({ days: 1 })
                .diffNow('days').days,
            ),
      ),
    )
  }

  async #setEnergyValues(
    energyHp: number,
    energyResistor: number,
  ): Promise<void> {
    await this.setCapabilityValue('meter_power', energyHp + energyResistor)
    await this.setCapabilityValue('meter_power.hp', energyHp)
    await this.setCapabilityValue('meter_power.resistor', energyResistor)
  }

  async #setPowerValues(powerHp: number, powerResistor: number): Promise<void> {
    await this.setCapabilityValue('measure_power', powerHp + powerResistor)
    await this.setCapabilityValue('measure_power.hp', powerHp)
    await this.setCapabilityValue('measure_power.resistor', powerResistor)
  }

  async #setSettingCapabilityValues(): Promise<void> {
    if (this.#postSettings.SlpAntilegionellaOnOff) {
      await this.setCapabilityValue(
        'onoff.legionella',
        Boolean(this.#postSettings.SlpAntilegionellaOnOff.new),
      )
    }
    if (this.#postSettings.SlpPreHeatingOnOff) {
      await this.setCapabilityValue(
        'onoff.preheating',
        Boolean(this.#postSettings.SlpPreHeatingOnOff.new),
      )
    }
  }

  async #setSettingValues(
    plantSettings: GetData['data']['plantSettings'],
  ): Promise<void> {
    if (!plantSettings) {
      return
    }
    await this.setCapabilityValue(
      'onoff.legionella',
      plantSettings.antilegionellaOnOff,
    )
    await this.setCapabilityValue(
      'onoff.preheating',
      plantSettings.preHeatingOnOff,
    )
    await this.setSettings({
      max: plantSettings.maxSetpointTemp.value,
      min: plantSettings.minSetpointTemp.value,
    })
  }

  async #sync(post = false): Promise<void> {
    await this.#updateCapabilities(post)
    this.#applySyncFromDevice()
  }

  async #updateCapabilities(post: boolean): Promise<void> {
    const data: GetData['data'] | null = await this.#plantData(post)
    if (!data) {
      return
    }
    await this.#setSettingValues(data.plantSettings)
    await this.#setDataValues(data.plantData)
  }

  async #updateTargetTemperatureMinMax(
    settings: Settings = this.getSettings() as Settings,
  ): Promise<void> {
    const { min, max } = settings
    const options: RangeOptions =
      this.getCapabilityOptions('target_temperature')
    if (min === options.min && max === options.max) {
      return
    }
    await this.setCapabilityOptions('target_temperature', {
      ...options,
      ...(typeof max === 'undefined' ? {} : { max }),
      ...(typeof min === 'undefined' ? {} : { min }),
    })
    await this.setWarning(this.homey.__('warnings.settings'))
  }
}

export = NuosDevice
