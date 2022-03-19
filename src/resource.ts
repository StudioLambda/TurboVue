import type { TurboQuery, TurboQueryOptions, TurboMutateValue } from 'turbo-query'
import type { Ref, DeepReadonly } from 'vue'
import { query, mutate, subscribe, forget, abort } from 'turbo-query'
import { computed, ref, watch, readonly, onUnmounted, getCurrentInstance, inject } from 'vue'

/**
 * The context key for the dependency injection (provide / inject)
 */
export const TurboVueContext = Symbol('turbo-vue-context')

/**
 * Injects the context options.
 */
export function injectTurboVue(value?: TurboVueOptions) {
  return inject<TurboVueOptions | undefined>(TurboVueContext, value)
}

/**
 * Available options for turbo vue.
 */
export interface TurboVueOptions extends TurboQueryOptions {
  /**
   * A default turbo query instance to use if any.
   */
  turbo?: TurboQuery
}

export interface TurboVueResourceActions<T> {
  /**
   * Refetches the current key.
   */
  refetch(ops?: TurboQueryOptions): Promise<T | undefined>

  /**
   * Mutates the current key.
   */
  mutate(value: TurboMutateValue<T>): void

  /**
   * Usubscribes from the current key changes.
   */
  unsubscribe(): void

  /**
   * Forgets the current key from the cache.
   */
  forget(): void

  /**
   * Aborts the current key's request if any.
   */
  abort(reason?: any): void

  /**
   * Determines if it's refetching in the background.
   */
  isRefetching: Readonly<Ref<boolean>>
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
  const contextOptions = inject<TurboVueOptions | undefined>(TurboVueContext)
  const turboQuery = options?.turbo?.query ?? contextOptions?.turbo?.query ?? query
  const turboMutate = options?.turbo?.mutate ?? contextOptions?.turbo?.mutate ?? mutate
  const turboSubscribe = options?.turbo?.subscribe ?? contextOptions?.turbo?.subscribe ?? subscribe
  const turboForget = options?.turbo?.forget ?? contextOptions?.turbo?.forget ?? forget
  const turboAbort = options?.turbo?.abort ?? contextOptions?.turbo?.abort ?? abort

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

      resource.value = await turboQuery<T>(key, {
        stale: true,
        ...options,
      })

      onCleanup(function () {
        unsubscribeMutate()
        unsubscribeRefetching()
        unsubscribeResolved()
        unsubscribeErrors()
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
    },
  ]
}
