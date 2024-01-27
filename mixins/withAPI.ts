import type { HomeyClass, HomeySettings } from '../types'
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type AristonApp from '../app'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type APIClass = new (...args: any[]) => {
  readonly api: AxiosInstance
  readonly getHomeySetting: <K extends keyof HomeySettings>(
    setting: K,
  ) => HomeySettings[K]
}

const getAPIErrorMessage = (error: AxiosError): string => error.message

// eslint-disable-next-line max-lines-per-function
const withAPI = <T extends HomeyClass>(
  base: T,
): APIClass & T & { readonly loginURL: string } =>
  class WithAPI extends base {
    public static readonly loginURL: string = '/R2/Account/Login'

    public readonly api: AxiosInstance = axios.create()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args)
      this.setupAxiosInterceptors()
    }

    public getHomeySetting<K extends keyof HomeySettings>(
      setting: K,
    ): HomeySettings[K] {
      return this.homey.settings.get(setting) as HomeySettings[K]
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
      this.log(
        'Sending request:',
        config.url,
        config.method === 'post' ? config.data : '',
      )
      return config
    }

    private async handleResponse(
      response: AxiosResponse,
    ): Promise<AxiosResponse> {
      const { config } = response
      this.log('Received response:', config.url, response.data)
      const contentType = String(response.headers['content-type'])
      const app: AristonApp = this.homey.app as AristonApp
      if (
        contentType.includes('text/html') &&
        app.retry &&
        config.url !== WithAPI.loginURL
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
      this.error(`Error in ${type}:`, error.config?.url, errorMessage)
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
