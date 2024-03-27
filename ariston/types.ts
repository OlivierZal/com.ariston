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

enum Switch {
  off = 0,
  on = 1,
}

export interface LoginCredentials {
  readonly password: string
  readonly username: string
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
  boostOn?: boolean
  comfortTemp?: number
  holidayUntil?: string | null
  on?: boolean
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
    readonly plantSettings?: {
      readonly antilegionellaOnOff: boolean
      readonly maxSetpointTemp: { value: number }
      readonly minSetpointTemp: { value: number }
      readonly preHeatingOnOff: boolean
    }
    readonly plantData: Readonly<Required<PostPlantData>> & {
      readonly procReqTemp: number
      readonly waterTemp: number
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
  SlpMaxSetpointTemperature?: BasePostSettings<number>
  SlpMinSetpointTemperature?: BasePostSettings<number>
  SlpPreHeatingOnOff?: BasePostSettingsWithOld<Switch>
}

export interface GetSettings {
  readonly success: boolean
}

export interface HistogramData {
  readonly items: readonly { readonly x: string; readonly y: number }[]
  readonly period: string
  readonly series: 'DhwHp' | 'DhwResistor'
  readonly tab: string
}

export interface ReportData {
  readonly data: {
    readonly asKwhRaw: { readonly histogramData: readonly HistogramData[] }
  }
}
