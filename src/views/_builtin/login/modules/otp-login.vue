<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import { useRouterPush } from '@/hooks/common/router';
import { useFormRules, useNaiveForm } from '@/hooks/common/form';

defineOptions({
  name: 'OtpLogin'
});

const authStore = useAuthStore();
const { toggleLoginModule } = useRouterPush();
const { formRef, validate } = useNaiveForm();

interface FormModel {
  code: string;
}

const model: FormModel = reactive({
  code: ''
});

const rules = computed<Record<keyof FormModel, App.Global.FormRule[]>>(() => {
  const { formRules } = useFormRules();

  return {
    code: formRules.code
  };
});

async function handleSubmit() {
  await validate();

  // Use the cached values from authStore
  // We will assume authStore has cached the userName and password
  await authStore.loginByOTP(model.code);
}
</script>

<template>
  <div class="pt-24px">
    <div class="text-14px text-[#666] mb-24px">{{ $t('page.login.otpLogin.instructions') }}</div>

    <NForm ref="formRef" :model="model" :rules="rules" size="large" :show-label="false" @keyup.enter="handleSubmit">
      <NFormItem path="code">
        <NInput v-model:value="model.code" :placeholder="$t('page.login.otpLogin.placeholder')">
          <template #prefix>
            <div class="i-icon-park-outline:safe-retrieval text-16px text-[#666]" />
          </template>
        </NInput>
      </NFormItem>
      <NSpace vertical :size="18" class="mt-8px">
        <NButton type="primary" size="large" round block :loading="authStore.loginLoading" @click="handleSubmit">
          {{ $t('page.login.common.confirm') }}
        </NButton>
        <NButton size="large" round block @click="toggleLoginModule('pwd-login')">
          {{ $t('page.login.common.back') }}
        </NButton>
      </NSpace>
    </NForm>
  </div>
</template>

<style scoped></style>
