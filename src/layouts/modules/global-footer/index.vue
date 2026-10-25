<script setup lang="ts">
defineOptions({ name: 'GlobalFooter' });
const currentYear = new Date().getFullYear();
</script>

<template>
  <DarkModeContainer class="h-full flex-center">
    <span>Copyright &copy; {{ currentYear }} kube-resource-fcst</span>
  </DarkModeContainer>
</template>
