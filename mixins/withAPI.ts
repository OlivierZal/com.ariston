/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-argument
*/
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type AristonApp from '../app'
import type { HomeyClass } from '../types'

type APIClass = new (...args: any[]) => {
  readonly api: AxiosInstance
  readonly loginURL: string
}

const getAPIErrorMessage = (error: AxiosError): string => error.message

const withAPI = <T extends HomeyClass>(base: T): APIClass & T =>
  class extends base {
    public readonly api: AxiosInstance = axios.create()

    public readonly loginURL: string = '/R2/Account/Login'

    public constructor(...args: any[]) {
      super(...args)
      this.setupAxiosInterceptors()
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
        config.url !== this.loginURL
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
