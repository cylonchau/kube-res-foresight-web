<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import { useFormRules, useNaiveForm } from '@/hooks/common/form';
import { $t } from '@/locales';

defineOptions({
  name: 'PwdLogin'
});

const authStore = useAuthStore();
const { formRef, validate } = useNaiveForm();

interface FormModel {
  userName: string;
  password: string;
  captchaCode: string;
}

const model: FormModel = reactive({
  userName: '',
  password: '',
  captchaCode: ''
});

const rules = computed<Partial<Record<keyof FormModel, App.Global.FormRule[]>>>(() => {
  // inside computed to make locale reactive, if not apply i18n, you can define it without computed
  const { formRules } = useFormRules();

  return {
    userName: formRules.userName,
    // 登录只要求非空，密码是否正确由服务端判断；复杂度只在设置密码时检查
    password: [formRules.pwd[0]],
    captchaCode: authStore.captchaRequired
      ? [{ required: true, message: $t('page.login.common.captchaPlaceholder') }]
      : []
  };
});

async function handleSubmit() {
  await validate();
  await authStore.login(model.userName, model.password, true, model.captchaCode);
  model.captchaCode = '';
}
</script>

<template>
  <NForm ref="formRef" :model="model" :rules="rules" size="large" :show-label="false" @keyup.enter="handleSubmit">
    <NFormItem path="userName">
      <NInput v-model:value="model.userName" :placeholder="$t('page.login.common.userNamePlaceholder')" />
    </NFormItem>
    <NFormItem path="password">
      <NInput
        v-model:value="model.password"
        type="password"
        show-password-on="click"
        :placeholder="$t('page.login.common.passwordPlaceholder')"
      />
    </NFormItem>
    <NFormItem v-if="authStore.captchaRequired" path="captchaCode">
      <div class="w-full flex items-center gap-10px">
        <NInput
          v-model:value="model.captchaCode"
          class="flex-1"
          maxlength="5"
          :placeholder="$t('page.login.common.captchaPlaceholder')"
        />
        <button class="captcha-image" type="button" @click="authStore.refreshLoginCaptcha(model.userName)">
          <img :src="authStore.loginCaptcha.image" :alt="$t('page.login.common.refreshCaptcha')" />
        </button>
      </div>
    </NFormItem>
    <NSpace vertical :size="24">
      <div class="flex-y-center justify-between">
        <NCheckbox>{{ $t('page.login.pwdLogin.rememberMe') }}</NCheckbox>
      </div>
      <NButton type="primary" size="large" round block :loading="authStore.loginLoading" @click="handleSubmit">
        {{ $t('common.confirm') }}
      </NButton>
    </NSpace>
  </NForm>
</template>

<style scoped>
.captcha-image {
  width: 132px;
  height: 40px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.captcha-image img {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
