import type { TurboQuery, TurboQueryOptions, TurboMutateValue } from 'turbo-query'
import type { Ref, DeepReadonly, InjectionKey } from 'vue'
import { query, mutate, subscribe, forget, abort } from 'turbo-query'
import { computed, ref, watch, readonly, onUnmounted, getCurrentInstance, inject } from 'vue'

/**
 * The context key for the dependency injection (provide / inject)
 */
export const injectionKey = Symbol('turbo-vue-context') as InjectionKey<TurboVueOptions>

/**
 * Injects the context options.
 */
export function injectTurboVue(value?: TurboVueOptions) {
  return inject(injectionKey, value)
}

/**
 * Available options for turbo vue.
 */
export interface TurboVueOptions extends TurboQueryOptions {
  /**
   * A default turbo query instance to use if any.
   */
  readonly turbo?: TurboQuery

  /**
   * Determines if it should refetch keys when
   * the window regains focus. You can also
   * set the desired `focusInterval`.
   */
  readonly refetchOnFocus?: boolean

  /**
   * Determines if it should refetch keys when
   * the window regains focus.
   */
  readonly refetchOnConnect?: boolean

  /**
   * Determines a throttle interval for the
   * `refetchOnFocus`. Defaults to 5000 ms.
   */
  readonly focusInterval?: number

  /**
   * Clears the resource signal by setting it to
   * undefined when the key is forgotten from the cache.
   */
  readonly clearOnForget?: boolean
}

export interface TurboVueResourceActions<T> {
  /**
   * Refetches the current key.
   */
  readonly refetch: (ops?: TurboQueryOptions) => Promise<T | undefined>

  /**
   * Mutates the current key.
   */
  readonly mutate: (value: TurboMutateValue<T>) => void

  /**
   * Usubscribes from the current key changes.
   */
  readonly unsubscribe: () => void

  /**
   * Forgets the current key from the cache.
   */
  readonly forget: () => void

  /**
   * Aborts the current key's request if any.
   */
  readonly abort: (reason?: any) => void

  /**
   * Determines if it's refetching in the background.
   */
  readonly isRefetching: Readonly<Ref<boolean>>

  /**
   * Determines the date of the last window focus.
   * Useful to calculate how many time is left
   * for the next available focus refetching.
   */
  readonly lastFocus: Readonly<Ref<Date>>
}

export type TurboVueResource<T> = [
  /**
   * The resulting resource.
   */
  Readonly<Ref<DeepReadonly<T> | undefined>>,

  /**
   * Available actions on that resource.
   */
  TurboVueResourceActions<T>
]

/**
 * Determines how a vue key looks like.
 */
export type TurboVueKey = () => string | false | null

/**
 * Creates a new turbo resource with the given key and options.
 */
export async function createTurboResource<T = any>(
  key: TurboVueKey,
  options?: TurboVueOptions
): Promise<TurboVueResource<T>> {
  const contextOptions = inject(injectionKey)
  const turboQuery = options?.turbo?.query ?? contextOptions?.turbo?.query ?? query
  const turboMutate = options?.turbo?.mutate ?? contextOptions?.turbo?.mutate ?? mutate
  const turboSubscribe = options?.turbo?.subscribe ?? contextOptions?.turbo?.subscribe ?? subscribe
  const turboForget = options?.turbo?.forget ?? contextOptions?.turbo?.forget ?? forget
  const turboAbort = options?.turbo?.abort ?? contextOptions?.turbo?.abort ?? abort
  const refetchOnFocus = options?.refetchOnFocus ?? contextOptions?.refetchOnFocus ?? true
  const refetchOnConnect = options?.refetchOnConnect ?? contextOptions?.refetchOnConnect ?? true
  const focusInterval = options?.focusInterval ?? contextOptions?.focusInterval ?? 5000
  const clearOnForget = options?.clearOnForget ?? contextOptions?.clearOnForget ?? false

  /**
   * Key computation
   */
  const computedKey = computed(function () {
    try {
      return key()
    } catch {
      return null
    }
  })

  /**
   * The resulting resource.
   */
  const resource = ref<T | undefined>()

  /**
   * The resulting resource.
   */
  const error = ref<unknown>()

  /**
   * Determines if it's refetching in the background.
   */
  const isRefetching = ref<boolean>(false)

  /**
   * We force a throw if there's an error.
   * This needs to be in a watcher for onCaptureError
   * to be able to capture it.
   */
  watch(error, function (e) {
    if (e !== undefined) throw e
  })

  /**
   * Initially resolve the key if needed.
   */
  if (computedKey.value) {
    resource.value = await turboQuery<T>(computedKey.value, {
      stale: true,
      ...options,
    })
  }

  /**
   * Refetches the current key.
   */
  async function refetch(ops?: TurboQueryOptions): Promise<T | undefined> {
    if (!computedKey.value) return
    return await turboQuery<T>(computedKey.value, { stale: false, ...options, ...ops })
  }

  /**
   * Mutates the current key.
   */
  function localMutate(item: TurboMutateValue<T>): void {
    if (!computedKey.value) return
    turboMutate(computedKey.value, item)
  }

  /**
   * Forgets the current key from the cache.
   */
  function localForget(): void {
    if (!computedKey.value) return
    turboForget(computedKey.value)
  }

  /**
   * Aborts the current key's request if any.
   */
  function localAbort(reason?: any): void {
    if (!computedKey.value) return
    turboAbort(computedKey.value, reason)
  }

  const lastFocus = ref<Date>(new Date())

  /**
   * The onFocus function handler.
   */
  function onFocus(listener: () => void): () => void {
    if (refetchOnFocus && typeof window !== 'undefined') {
      const rawHandler = () => {
        const last = lastFocus.value
        const now = new Date()

        if (now.getTime() - last.getTime() > focusInterval) {
          lastFocus.value = new Date()
          listener()
        }
      }
      window.addEventListener('focus', rawHandler)
      return () => window.removeEventListener('focus', rawHandler)
    }
    return () => {}
  }

  /**
   * The onConnect function handler.
   */
  function onConnect(listener: () => void): () => void {
    if (refetchOnConnect && typeof window !== 'undefined') {
      window.addEventListener('online', listener)
      return () => window.removeEventListener('online', listener)
    }
    return () => {}
  }

  /**
   * Usubscribes from the current key changes.
   */
  const unsubscribe = watch(
    computedKey,
    async function (key, _old, onCleanup) {
      isRefetching.value = false
      if (!key) return

      const unsubscribeMutate = turboSubscribe<T>(key, 'mutated', function (item) {
        resource.value = item
      })

      const unsubscribeRefetching = turboSubscribe<T>(key, 'refetching', function () {
        isRefetching.value = true
      })

      const unsubscribeResolved = turboSubscribe<T>(key, 'resolved', function (item) {
        isRefetching.value = false
        resource.value = item
      })

      const unsubscribeErrors = turboSubscribe<unknown>(key, 'error', function (e) {
        isRefetching.value = false
        error.value = e
      })

      const unsubscribeForgotten = turboSubscribe<T>(key, 'forgotten', function () {
        if (clearOnForget) resource.value = undefined
      })

      /**
       * Subscribe to focus changes if needed.
       */
      const unsubscribeFocusRefetch = onFocus(function () {
        refetch()
      })

      /**
       * Subscribe to network connect changes if needed.
       */
      const unsubscribeConnectRefetch = onConnect(function () {
        refetch()
      })

      resource.value = await turboQuery<T>(key, {
        stale: true,
        ...options,
      })

      onCleanup(function () {
        unsubscribeMutate()
        unsubscribeRefetching()
        unsubscribeResolved()
        unsubscribeErrors()
        unsubscribeForgotten()
        unsubscribeFocusRefetch()
        unsubscribeConnectRefetch()
      })
    },
    { immediate: true }
  )

  // Unmount automatically if we're inside a component.
  if (getCurrentInstance()) onUnmounted(() => unsubscribe())

  return [
    readonly(resource),
    {
      refetch,
      mutate: localMutate,
      forget: localForget,
      abort: localAbort,
      unsubscribe,
      isRefetching: readonly(isRefetching),
      lastFocus: readonly(lastFocus),
    },
  ]
}
