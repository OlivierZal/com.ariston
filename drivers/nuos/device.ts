import type {
  Capabilities,
  CapabilityOptionsEntries,
  DeviceDetails,
  ManifestDriver,
  PostDataCapabilities,
  SetCapabilities,
  SettingCapabilities,
  Settings,
} from '../../types'
import { DateTime, Duration } from 'luxon'
import {
  type GetData,
  type HistogramData,
  Mode,
  OperationMode,
  type PlantData,
  type PlantSettings,
  type PostData,
  type PostSettings,
} from '@olivierzal/ariston-api'
import type AristonApp from '../..'
import { Device } from 'homey'
import type NuosDriver from './driver'
import addToLogs from '../../decorators/addToLogs'

const ENERGY_REFRESH_INTERVAL = Duration.fromObject({ hours: 2 })
const ENERGY_REFRESH_HOURS = ENERGY_REFRESH_INTERVAL.as('hours')
const K_MULTIPLIER = 1000
const NUMBER_0 = 0

const POST_DATA: Record<
  Exclude<keyof PostDataCapabilities, 'onoff.auto'>,
  keyof PostData['plantData'] & keyof PostData['viewModel']
> = {
  onoff: 'on',
  'onoff.boost': 'boostOn',
  operation_mode: 'opMode',
  target_temperature: 'comfortTemp',
  vacation: 'holidayUntil',
}
const PLANT_DATA: Partial<
  Record<keyof Capabilities, keyof PostData['plantData']>
> = {
  ...POST_DATA,
  'onoff.auto': 'mode',
}
const VIEW_MODEL: Partial<
  Record<keyof Capabilities, keyof PostData['viewModel']>
> = {
  ...POST_DATA,
  'onoff.auto': 'plantMode',
}
const SETTINGS: Record<keyof SettingCapabilities, keyof PostSettings> = {
  'onoff.legionella': 'SlpAntilegionellaOnOff',
  'onoff.preheating': 'SlpPreHeatingOnOff',
}

const convertToDate = (days: number): string | null =>
  days ?
    DateTime.now()
      .plus({ days: days - Duration.fromObject({ days: 1 }).as('days') })
      .toISODate()
  : null

const getEnergyData = (
  histogramData: readonly HistogramData[],
  seriesName: HistogramData['series'],
): HistogramData | undefined =>
  histogramData
    .filter(
      ({ tab, period }) =>
        tab === 'ConsumedElectricity' && period === 'CurrentDay',
    )
    .find(({ series }) => series === seriesName)

const getEnergy = (energyData: HistogramData | undefined): number =>
  energyData ?
    energyData.items.reduce<number>(
      (acc, { y: yNumber }) => acc + yNumber,
      NUMBER_0,
    )
  : NUMBER_0

const getPower = (energyData: HistogramData | undefined): number => {
  const { hour } = DateTime.now()
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

  #syncTimeout!: NodeJS.Timeout

  readonly #aristonAPI = (this.homey.app as AristonApp).aristonAPI

  readonly #convertToData: Record<
    keyof PostDataCapabilities,
    (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => PostData['plantData'][keyof PostData['plantData']]
  > = {
    onoff: ((value: boolean) => value) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => boolean,
    'onoff.auto': ((value: boolean) => (value ? Mode.auto : Mode.manual)) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => Mode,
    'onoff.boost': ((value: boolean) => value) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => boolean,
    operation_mode: ((value: keyof typeof OperationMode) =>
      OperationMode[value]) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => OperationMode,
    target_temperature: ((value: number) => value) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => number,
    vacation: ((value: number) => convertToDate(value)) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => string | null,
  }

  readonly #convertToSettings: Record<
    keyof SettingCapabilities,
    (value: SettingCapabilities[keyof SettingCapabilities]) => number
  > = {
    'onoff.legionella': (value: boolean) => Number(value),
    'onoff.preheating': (value: boolean) => Number(value),
  }

  readonly #convertToViewModel: Record<
    keyof PostDataCapabilities,
    (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => PostData['viewModel'][keyof PostData['viewModel']]
  > = {
    ...this.#convertToData,
    onoff: ((value: boolean) => this.getSetting('always_on') || value) as (
      value: PostDataCapabilities[keyof PostDataCapabilities],
    ) => boolean,
  }

  readonly #diff = new Map<
    keyof SetCapabilities,
    {
      initialValue: SetCapabilities[keyof SetCapabilities]
      value: SetCapabilities[keyof SetCapabilities]
    }
  >()

  readonly #id = (this.getData() as DeviceDetails['data']).id

  public override async addCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      await super.addCapability(capability)
    }
  }

  public override getCapabilityOptions<
    K extends keyof CapabilityOptionsEntries,
  >(capability: K): CapabilityOptionsEntries[K] {
    return super.getCapabilityOptions(capability) as CapabilityOptionsEntries[K]
  }

  public override getCapabilityValue<K extends keyof Capabilities>(
    capability: K,
  ): Capabilities[K] {
    return super.getCapabilityValue(capability) as Capabilities[K]
  }

  public override getSetting<K extends keyof Settings>(
    setting: K,
  ): NonNullable<Settings[K]> {
    return super.getSetting(setting) as NonNullable<Settings[K]>
  }

  public override onDeleted(): void {
    this.homey.clearTimeout(this.#syncTimeout)
  }

  public override async onInit(): Promise<void> {
    await this.setWarning(null)
    await this.#handleCapabilities()
    this.#registerCapabilityListeners()
    await this.#syncDevice()
    await this.#report()
    const now = DateTime.now()
    this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#report()
        this.homey.setInterval(async (): Promise<void> => {
          await this.#report()
        }, ENERGY_REFRESH_INTERVAL.as('milliseconds'))
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

  public override async onSettings({
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
      await this.triggerCapabilityListener('onoff', true)
    }
    const postSettings: PostSettings = {}
    if (changedKeys.includes('min') && typeof newSettings.min !== 'undefined') {
      postSettings.SlpMinSetpointTemperature = { new: newSettings.min }
    }
    if (changedKeys.includes('max') && typeof newSettings.max !== 'undefined') {
      postSettings.SlpMaxSetpointTemperature = { new: newSettings.max }
    }
    if (
      (await this.#setSettingsToDevice(postSettings)) &&
      changedKeys.some((key) => ['min', 'max'].includes(key))
    ) {
      await this.#setTargetTemperatureMinMax(newSettings)
    }
  }

  public override async onUninit(): Promise<void> {
    this.onDeleted()
    return Promise.resolve()
  }

  public override async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  public override async setCapabilityOptions<
    K extends keyof CapabilityOptionsEntries,
  >(capability: K, options: CapabilityOptionsEntries[K]): Promise<void> {
    await super.setCapabilityOptions(capability, options)
  }

  public override async setCapabilityValue<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    this.log('Capability', capability, 'is', value)
    if (value !== this.getCapabilityValue(capability)) {
      await super.setCapabilityValue(capability, value)
    }
  }

  public override async setSettings(settings: Settings): Promise<void> {
    const newSettings = Object.fromEntries(
      Object.entries(settings).filter(
        ([key, value]) => value !== this.getSetting(key as keyof Settings),
      ),
    )
    if (Object.keys(newSettings).length) {
      await super.setSettings(newSettings)
      if (
        ['min', 'max'].some((key) => Object.keys(newSettings).includes(key))
      ) {
        await this.#setTargetTemperatureMinMax()
      }
    }
  }

  public override async setWarning(warning: string | null): Promise<void> {
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  #applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#syncDevice()
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  #applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#setSettingsToDevice(this.#buildPostSettings())
        await this.#syncDevice(this.#buildPostData())
      },
      Duration.fromObject({ seconds: 1 }).as('milliseconds'),
    )
  }

  #buildPlantData(): PostData['plantData'] {
    return Object.fromEntries(
      Array.from(this.#diff.entries())
        .filter(([capability]) => Object.keys(PLANT_DATA).includes(capability))
        .map(([capability, diff]) => [
          PLANT_DATA[capability],
          this.#convertToData[capability as keyof PostDataCapabilities](
            diff.initialValue,
          ),
        ]),
    ) as PostData['plantData']
  }

  #buildPostData(): PostData {
    this.#setAlwaysOnWarning()
    return {
      plantData: this.#buildPlantData(),
      viewModel: this.#buildViewModel(),
    }
  }

  #buildPostSettings(): PostSettings {
    return Object.fromEntries(
      Array.from(this.#diff.entries())
        .filter(([capability]) => Object.keys(SETTINGS).includes(capability))
        .map(([capability, diff]) => {
          this.#diff.delete(capability)
          return [
            SETTINGS[capability as keyof SettingCapabilities],
            {
              new: this.#convertToSettings[
                capability as keyof SettingCapabilities
              ](diff.value as boolean),
              old: this.#convertToSettings[
                capability as keyof SettingCapabilities
              ](diff.initialValue as boolean),
            },
          ]
        }),
    )
  }

  #buildViewModel(): PostData['viewModel'] {
    return Object.fromEntries(
      Array.from(this.#diff.entries())
        .filter(([capability]) => Object.keys(VIEW_MODEL).includes(capability))
        .map(([capability, diff]) => {
          this.#diff.delete(capability)
          return [
            VIEW_MODEL[capability],
            this.#convertToViewModel[capability as keyof PostDataCapabilities](
              diff.value,
            ),
          ]
        }),
    ) as PostData['viewModel']
  }

  async #getErrors(): Promise<void> {
    const { errorType, errorText } = (await this.#aristonAPI.errors(this.#id))
      .data.data
    await this.setCapabilityValue('alarm_generic', Boolean(errorType))
    await this.setCapabilityValue('error_status', errorText)
    if (errorType) {
      await this.setWarning(errorText)
    }
  }

  async #handleCapabilities(): Promise<void> {
    const requiredCapabilities = (this.driver.manifest as ManifestDriver)
      .capabilities as string[]
    await requiredCapabilities.reduce<Promise<void>>(
      async (acc, capability) => {
        await acc
        return this.addCapability(capability)
      },
      Promise.resolve(),
    )
    await this.getCapabilities()
      .filter((capability) => !requiredCapabilities.includes(capability))
      .reduce<Promise<void>>(async (acc, capability) => {
        await acc
        await this.removeCapability(capability)
      }, Promise.resolve())
  }

  #onCapability<K extends keyof SetCapabilities>(
    capability: K,
    value: SetCapabilities[K],
  ): void {
    if (this.#diff.has(capability)) {
      const diff = this.#diff.get(capability)
      if (value === diff?.initialValue) {
        this.#diff.delete(capability)
      } else if (diff) {
        diff.value = value
      }
      return
    }
    this.#diff.set(capability, {
      initialValue: this.getCapabilityValue(capability),
      value,
    })
  }

  #registerCapabilityListeners<K extends keyof SetCapabilities>(): void {
    ;(
      (this.driver.manifest as ManifestDriver).capabilities.filter(
        (capability) =>
          !capability.startsWith('measure') && !capability.startsWith('meter'),
      ) as K[]
    ).forEach((capability) => {
      this.registerCapabilityListener(
        capability,
        (value: SetCapabilities[K]) => {
          this.homey.clearTimeout(this.#syncTimeout)
          this.#onCapability(capability, value)
          this.#applySyncToDevice()
        },
      )
    })
  }

  async #report(): Promise<void> {
    try {
      const { histogramData } = (await this.#aristonAPI.report(this.#id)).data
        .data.asKwhRaw
      const energyHpData = getEnergyData(histogramData, 'DhwHp')
      const energyResistorData = getEnergyData(histogramData, 'DhwResistor')
      await this.#setPowerValues(
        getPower(energyHpData),
        getPower(energyResistorData),
      )
      await this.#setEnergyValues(
        getEnergy(energyHpData),
        getEnergy(energyResistorData),
      )
    } catch (error) {
      await this.setWarning(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  #setAlwaysOnWarning(): void {
    if (
      this.getSetting('always_on') &&
      this.#diff.get('onoff')?.value === false
    ) {
      this.setWarning(this.homey.__('warnings.always_on')).catch(
        (error: unknown) => {
          this.error(error instanceof Error ? error.message : String(error))
        },
      )
    }
  }

  async #setCapabilities(plantData: PlantData): Promise<void> {
    await this.setCapabilityValue('measure_temperature', plantData.waterTemp)
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
        plantData.holidayUntil === null ?
          NUMBER_0
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

  async #setOrGetData(postData?: PostData): Promise<void> {
    let data: GetData<null> | GetData<PlantSettings> | null = null
    if (postData) {
      if (Object.keys(postData.viewModel).length) {
        ;({ data } = await this.#aristonAPI.setData(this.#id, postData))
      }
    } else {
      ;({ data } = await this.#aristonAPI.get(this.#id))
    }
    if (typeof data?.ok !== 'undefined' && data.ok) {
      await this.#setCapabilities(data.data.plantData)
      await this.#setSettingsFromDevice(data.data.plantSettings)
    }
  }

  async #setPowerValues(powerHp: number, powerResistor: number): Promise<void> {
    await this.setCapabilityValue('measure_power', powerHp + powerResistor)
    await this.setCapabilityValue('measure_power.hp', powerHp)
    await this.setCapabilityValue('measure_power.resistor', powerResistor)
  }

  async #setSettingCapabilities(postSettings: PostSettings): Promise<void> {
    if (postSettings.SlpAntilegionellaOnOff) {
      await this.setCapabilityValue(
        'onoff.legionella',
        Boolean(postSettings.SlpAntilegionellaOnOff.new),
      )
    }
    if (postSettings.SlpPreHeatingOnOff) {
      await this.setCapabilityValue(
        'onoff.preheating',
        Boolean(postSettings.SlpPreHeatingOnOff.new),
      )
    }
  }

  async #setSettingsFromDevice(
    plantSettings: PlantSettings | null,
  ): Promise<void> {
    if (plantSettings) {
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
  }

  async #setSettingsToDevice(postSettings: PostSettings): Promise<boolean> {
    if (Object.keys(postSettings).length) {
      try {
        const { success: isSuccess } = (
          await this.#aristonAPI.setSettings(this.#id, postSettings)
        ).data
        if (isSuccess) {
          await this.#setSettingCapabilities(postSettings)
        }
        return isSuccess
      } catch (error) {
        await this.setWarning(
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    return false
  }

  async #setTargetTemperatureMinMax(
    { min, max }: Settings = this.getSettings() as Settings,
  ): Promise<void> {
    const options = this.getCapabilityOptions('target_temperature')
    if (min !== options.min || max !== options.max) {
      await this.setCapabilityOptions('target_temperature', {
        ...options,
        ...(typeof min === 'undefined' ? {} : { min }),
        ...(typeof max === 'undefined' ? {} : { max }),
      })
      await this.setWarning(this.homey.__('warnings.settings'))
    }
  }

  async #syncDevice(postData?: PostData): Promise<void> {
    try {
      await this.#setOrGetData(postData)
    } catch (error) {
      await this.setWarning(
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      await this.#getErrors()
      this.#applySyncFromDevice()
    }
  }
}

export = NuosDevice
