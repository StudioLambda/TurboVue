<script lang="ts" setup>
import { Suspense, ref, onErrorCaptured } from 'vue'
import Post from './Post.vue'

const error = ref<unknown>()

onErrorCaptured((e) => {
  error.value = e
  // console.log(e)
  return false
})

function retry() {
  error.value = undefined
}

const current = ref(1)
</script>

<template>
  <div>
    <h1>All posts</h1>
    <input type="number" min="0" v-model="current" />
    <Suspense>
      <template #fallback>
        <div>Loading post...</div>
      </template>
      <div v-if="error">
        <div>There was an error...</div>
        <button @click="retry">Retry</button>
      </div>
      <div v-else>
        <Post :id="current" />
      </div>
    </Suspense>
  </div>
</template>
