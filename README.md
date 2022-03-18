# Turbo Vue

> Lightweight asynchronous data management for vue

**Documentation is in progress**. To know more check the `src/` folder. It contains enough readable information to get you started.

```
npm i turbo-vue
```

```vue
<script lang="ts" setup>
import { createTurboResource } from './resource'

const props = defineProps<{
  id: number
}>()

interface Post {
  id: number
  title: string
  body: string
}

const [post, { isRefetching, refetch, mutate }] = await createTurboResource<Post>(
  () => `https://jsonplaceholder.typicode.com/posts/${props.id}`
)
</script>

<template>
  <div>
    <h2>{{ post?.title }}</h2>
    <p>{{ post?.body }}</p>
    <button @click="() => refetch({ fresh: true })" :disabled="isRefetching">
      {{ isRefetching ? 'Refetching...' : 'Refetch' }}
    </button>
    <button @click="() => mutate((current) => ({ ...current!, title: 'Random title here' }))">
      Force title change
    </button>
  </div>
</template>
```
