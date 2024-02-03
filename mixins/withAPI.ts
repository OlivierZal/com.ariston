import type {
  GetData,
  GetSettings,
  HomeyClass,
  LoginData,
  LoginPostData,
  Plant,
  PostData,
  PostSettings,
  ReportData,
} from '../types'
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type AristonApp from '../app'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type APIClass = new (...args: any[]) => {
  readonly api: AxiosInstance
  readonly apiLogin: (
    postData: LoginPostData,
  ) => Promise<{ config: AxiosRequestConfig; data: LoginData }>
  readonly apiPlants: () => Promise<{ data: readonly Plant[] }>
  readonly apiPlantData: (
    id: string,
    postData: PostData | null,
  ) => Promise<{ data: GetData }>
  readonly apiPlantMetering: (id: string) => Promise<{ data: ReportData }>
  readonly apiPlantSettings: (
    id: string,
    settings: PostSettings,
  ) => Promise<{ data: GetSettings }>
}

const LOGIN_URL = '/R2/Account/Login'

const getAPIErrorMessage = (error: AxiosError): string => error.message

const getAPILogs = (
  object: AxiosError | AxiosResponse | InternalAxiosRequestConfig,
  message?: string,
): string => {
  const isError = axios.isAxiosError(object)
  const isResponse = Boolean(
    (!isError && 'status' in object) || (isError && 'response' in object),
  )
  const config: InternalAxiosRequestConfig = (
    isResponse || isError
      ? (object as AxiosError | AxiosResponse).config
      : object
  ) as InternalAxiosRequestConfig
  let response: AxiosResponse | null = null
  if (isResponse) {
    response = isError ? object.response ?? null : (object as AxiosResponse)
  }
  return [
    `API ${isResponse ? 'response' : 'request'}:`,
    config.method?.toUpperCase(),
    config.url,
    config.params,
    isResponse ? response?.headers : config.headers,
    response?.status,
    (isResponse ? (object as AxiosResponse) : config).data,
    message,
  ]
    .filter(
      (log: number | object | string | undefined) => typeof log !== 'undefined',
    )
    .map((log: number | object | string): number | string =>
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      typeof log === 'object' ? JSON.stringify(log, null, 2) : log,
    )
    .join('\n')
}

// eslint-disable-next-line max-lines-per-function
const withAPI = <T extends HomeyClass>(base: T): APIClass & T =>
  class WithAPI extends base {
    public readonly api: AxiosInstance = axios.create()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args)
      this.setupAxiosInterceptors()
    }

    public async apiLogin(
      postData: LoginPostData,
    ): Promise<{ config: AxiosRequestConfig; data: LoginData }> {
      return this.api.post<LoginData>(LOGIN_URL, postData)
    }

    public async apiPlants(): Promise<{ data: Plant[] }> {
      return this.api.get<Plant[]>('/api/v2/velis/plants')
    }

    public async apiPlantData(
      id: string,
      postData: PostData | null = null,
    ): Promise<{ data: GetData }> {
      return this.api<GetData>({
        method: postData ? 'post' : 'get',
        url: `/R2/PlantHomeSlp/${postData ? 'SetData' : 'GetData'}/${id}`,
        ...(postData ? { data: postData } : {}),
        ...(postData
          ? {}
          : { params: { fetchSettings: 'false', fetchTimeProg: 'false' } }),
      })
    }

    public async apiPlantSettings(
      id: string,
      settings: PostSettings,
    ): Promise<{ data: GetSettings }> {
      return this.api.post<GetSettings>(
        `/api/v2/velis/slpPlantData/${id}/PlantSettings`,
        settings,
      )
    }

    public async apiPlantMetering(id: string): Promise<{ data: ReportData }> {
      return this.api.post<ReportData>(`/R2/PlantMetering/GetData/${id}`)
    }

    private setupAxiosInterceptors(): void {
      this.api.interceptors.request.use(
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig =>
          this.handleRequest(config),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError('request', error),
      )
      this.api.interceptors.response.use(
        async (response: AxiosResponse): Promise<AxiosResponse> =>
          this.handleResponse(response),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError('response', error),
      )
    }

    private handleRequest(
      config: InternalAxiosRequestConfig,
    ): InternalAxiosRequestConfig {
      this.log(getAPILogs(config))
      return config
    }

    private async handleResponse(
      response: AxiosResponse,
    ): Promise<AxiosResponse> {
      const { config } = response
      this.log(getAPILogs(response))
      const contentType = String(response.headers['content-type'])
      const app: AristonApp = this.homey.app as AristonApp
      if (
        contentType.includes('text/html') &&
        app.retry &&
        config.url !== LOGIN_URL
      ) {
        app.handleRetry()
        const loggedIn: boolean = await app.login()
        if (loggedIn) {
          return this.api.request(config)
        }
      }
      return response
    }

    private async handleError(
      type: 'request' | 'response',
      error: AxiosError,
    ): Promise<AxiosError> {
      const errorMessage: string = getAPIErrorMessage(error)
      this.error(getAPILogs(error), errorMessage)
      await this.setErrorWarning(errorMessage)
      return Promise.reject(error)
    }

    private async setErrorWarning(warning: string | null): Promise<void> {
      if (this.setWarning) {
        await this.setWarning(warning)
      }
    }
  }

export default withAPI
