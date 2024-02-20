export enum WheType {
  nuos = 4,
}

export enum Mode {
  auto = 1,
  manual = 2,
}

export enum OperationMode {
  green = 0,
  comfort = 1,
  fast = 2,
  auto = 3,
}

export enum Switch {
  off = 0,
  on = 1,
}

export interface APISettings {
  readonly username?: string | null
  readonly password?: string | null
  readonly expires?: string | null
}

export interface LoginPostData {
  readonly email: string
  readonly password: string
  readonly rememberMe: true
}

export interface LoginData {
  readonly ok: boolean
}

export interface Plant {
  readonly gw: string
  readonly name: string
  readonly wheType: WheType
}

interface BaseData {
  on?: boolean
  boostOn?: boolean
  comfortTemp?: number
  holidayUntil?: string | null
  opMode?: OperationMode
}

interface PostPlantData extends BaseData {
  mode?: Mode
}

interface ViewModel extends BaseData {
  plantMode?: Mode
}

export interface PostData {
  readonly plantData: PostPlantData
  readonly viewModel: ViewModel
}

export interface GetData {
  readonly data: {
    readonly plantData: Readonly<Required<PostPlantData>> & {
      readonly procReqTemp: number
      readonly waterTemp: number
    }
    readonly plantSettings?: {
      readonly antilegionellaOnOff: boolean
      readonly preHeatingOnOff: boolean
      readonly minSetpointTemp: { value: number }
      readonly maxSetpointTemp: { value: number }
    }
    readonly viewModel: Readonly<Required<ViewModel>>
  }
}

interface BasePostSettings<T> {
  readonly new: T
}

interface BasePostSettingsWithOld<T> extends BasePostSettings<T> {
  readonly old: T
}

export interface PostSettings {
  SlpAntilegionellaOnOff?: BasePostSettingsWithOld<Switch>
  SlpPreHeatingOnOff?: BasePostSettingsWithOld<Switch>
  SlpMinSetpointTemperature?: BasePostSettings<number>
  SlpMaxSetpointTemperature?: BasePostSettings<number>
}

export interface GetSettings {
  readonly success: boolean
}

export interface HistogramData {
  readonly tab: string
  readonly period: string
  readonly series: 'DhwHp' | 'DhwResistor'
  readonly items: readonly { readonly x: string; readonly y: number }[]
}

export interface ReportData {
  readonly data: {
    readonly asKwhRaw: { readonly histogramData: readonly HistogramData[] }
  }
}
