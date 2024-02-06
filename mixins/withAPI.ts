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
import APICallRequestData from '../lib/APICallRequestData'
import APICallResponseData from '../lib/APICallResponseData'
import type AristonApp from '../app'
import createAPICallErrorData from '../lib/APICallErrorData'

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

// eslint-disable-next-line max-lines-per-function
const withAPI = <T extends HomeyClass>(base: T): APIClass & T =>
  class WithAPI extends base {
    public readonly api: AxiosInstance = axios.create()

    public readonly app: AristonApp = this.homey.app as AristonApp

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
        method: postData ? 'POST' : 'GET',
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
          this.handleError(error),
      )
      this.api.interceptors.response.use(
        async (response: AxiosResponse): Promise<AxiosResponse> =>
          this.handleResponse(response),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError(error),
      )
    }

    private handleRequest(
      config: InternalAxiosRequestConfig,
    ): InternalAxiosRequestConfig {
      this.log(new APICallRequestData(config))
      return config
    }

    private async handleResponse(
      response: AxiosResponse,
    ): Promise<AxiosResponse> {
      this.log(new APICallResponseData(response))
      if (
        // @ts-expect-error: `axios` is partially typed
        response.headers.hasContentType('application/json') === false &&
        this.app.retry &&
        response.config.url !== LOGIN_URL
      ) {
        this.app.handleRetry()
        if (await this.app.login()) {
          return this.api.request(response.config)
        }
      }
      return response
    }

    private async handleError(error: AxiosError): Promise<AxiosError> {
      const apiCallErrorData = createAPICallErrorData(error)
      this.error(apiCallErrorData)
      if (
        error.response?.status === axios.HttpStatusCode.MethodNotAllowed &&
        this.app.retry &&
        error.config?.url !== LOGIN_URL
      ) {
        this.app.handleRetry()
        if ((await this.app.login()) && error.config) {
          return this.api.request(error.config)
        }
      }
      await this.setErrorWarning(apiCallErrorData.errorMessage)
      return Promise.reject(error)
    }

    private async setErrorWarning(warning: string | null): Promise<void> {
      if (this.setWarning) {
        await this.setWarning(warning)
      }
    }
  }

export default withAPI
