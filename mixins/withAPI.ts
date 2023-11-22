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
import { Duration } from 'luxon'
import type AristonApp from '../app'
import { loginURL, type HomeyClass } from '../types'

type APIClass = new (...args: any[]) => {
  readonly api: AxiosInstance
}

function getAPIErrorMessage(error: AxiosError): string {
  return error.message
}

export default function withAPI<T extends HomeyClass>(base: T): APIClass & T {
  return class extends base {
    public api: AxiosInstance = axios.create()

    #retry = true

    readonly #retryTimeout!: NodeJS.Timeout

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
      if (
        contentType.includes('text/html') &&
        this.#retry &&
        config.url !== loginURL
      ) {
        this.#retry = false
        this.homey.clearTimeout(this.#retryTimeout)
        this.homey.setTimeout(
          () => {
            this.#retry = true
          },
          Duration.fromObject({ minutes: 1 }).as('milliseconds'),
        )
        const loggedIn: boolean = await (this.homey.app as AristonApp).login()
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
}
