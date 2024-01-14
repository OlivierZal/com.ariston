/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-argument
*/
import type { SimpleClass } from 'homey'

const EMPTY_FUNCTION_PARENS = '()'

const addToLogs = <T extends new (...args: any[]) => SimpleClass>(
  ...logs: string[]
) =>
  function actualDecorator(target: T, context: ClassDecoratorContext<T>): T {
    class LogsDecorator extends target {
      public error(...args: any[]): void {
        this.commonLog('error', ...args)
      }

      public log(...args: any[]): void {
        this.commonLog('log', ...args)
      }

      private commonLog(logType: 'error' | 'log', ...args: any[]): void {
        super[logType](
          ...logs.flatMap((log: string): [any, '-'] => {
            if (log.endsWith(EMPTY_FUNCTION_PARENS)) {
              const funcName: string = log.slice(
                0,
                -EMPTY_FUNCTION_PARENS.length,
              )
              if ('funcName' in this) {
                const func: (...funcArgs: any[]) => any = this[
                  funcName as keyof this
                ] as (...funcArgs: any[]) => any
                if (!func.length) {
                  return [func.call(this), '-']
                }
              }
            }
            return log in this ? [this[log as keyof this], '-'] : [log, '-']
          }),
          ...args,
        )
      }
    }

    Object.defineProperty(LogsDecorator, 'name', { value: context.name })

    return LogsDecorator
  }

export default addToLogs
