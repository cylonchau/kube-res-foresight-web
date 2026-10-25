<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NButton, NCard, NForm, NFormItem, NInput, NSpace, NTabPane, NTabs, useMessage, NPopconfirm } from 'naive-ui';
import { $t } from '@/locales';
import {
  fetchGetUserInfo,
  fetchUpdatePassword,
  fetchUpdateProfile,
  fetchGenerateOTP,
  fetchBindOTP,
  fetchUnbindOTP
} from '@/service/api';

defineOptions({
  name: 'UserCenter'
});

const message = useMessage();
const loading = ref(false);
const userInfo = ref<Api.Auth.UserInfo | null>(null);

// 密码修改
const pwdForm = ref({
  old_password: '',
  password: '',
  confirm_password: ''
});

async function handleUpdatePassword() {
  if (pwdForm.value.password !== pwdForm.value.confirm_password) {
    message.error($t('page.userCenter.passwordMismatch'));
    return;
  }
  loading.value = true;
  const { error } = await fetchUpdatePassword(pwdForm.value.old_password, pwdForm.value.password);
  loading.value = false;
  if (!error) {
    message.success($t('page.userCenter.updatePasswordSuccess'));
    pwdForm.value = { old_password: '', password: '', confirm_password: '' };
  }
}

// 绑定/解绑 OTP
const otpData = ref<Api.Auth.OtpResult | null>(null);
const otpCode = ref('');

async function loadOtpSecret() {
  const { data, error } = await fetchGenerateOTP();
  if (!error) {
    otpData.value = data;
  }
}

async function handleBindOTP() {
  if (!otpData.value || !otpCode.value) return;

  loading.value = true;
  const { error } = await fetchBindOTP(otpData.value.secret, otpCode.value);
  loading.value = false;

  if (!error) {
    message.success($t('page.userCenter.otpBindSuccess'));
    otpCode.value = '';
    loadData();
  }
}

async function handleUnbindOTP() {
  if (!otpCode.value) {
    message.warning($t('page.userCenter.otpUnbindWarning'));
    return;
  }

  loading.value = true;
  const { error } = await fetchUnbindOTP(otpCode.value);
  loading.value = false;

  if (!error) {
    message.success($t('page.userCenter.otpUnbindSuccess'));
    otpCode.value = '';
    loadData();
  }
}

// 联系方式
const contactForm = ref({
  email: '',
  phone: ''
});

async function handleUpdateContact() {
  loading.value = true;
  const { error } = await fetchUpdateProfile(contactForm.value.email, contactForm.value.phone);
  loading.value = false;
  if (!error) {
    message.success($t('page.userCenter.contactUpdateSuccess'));
    loadData();
  }
}

async function loadData() {
  const { data, error } = await fetchGetUserInfo();
  if (!error && data) {
    userInfo.value = data;
    contactForm.value.email = data.email || '';
    contactForm.value.phone = data.phone || '';

    if (!data.otpEnabled) {
      loadOtpSecret();
    }
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="p-24px">
    <NCard :title="$t('page.userCenter.title')" :bordered="false" class="rounded-16px shadow-sm">
      <NTabs type="line" animated>
        <!-- 修改密码 -->
        <NTabPane name="password" :tab="$t('page.userCenter.updatePassword')">
          <div class="max-w-400px pt-16px">
            <NForm :model="pwdForm" label-placement="top">
              <NFormItem :label="$t('page.userCenter.oldPassword')">
                <NInput
                  v-model:value="pwdForm.old_password"
                  type="password"
                  :placeholder="$t('page.userCenter.placeholderOldPassword')"
                  show-password-on="click"
                />
              </NFormItem>
              <NFormItem :label="$t('page.userCenter.newPassword')">
                <NInput
                  v-model:value="pwdForm.password"
                  type="password"
                  :placeholder="$t('page.userCenter.placeholderNewPassword')"
                  show-password-on="click"
                />
              </NFormItem>
              <NFormItem :label="$t('page.userCenter.confirmPassword')">
                <NInput
                  v-model:value="pwdForm.confirm_password"
                  type="password"
                  :placeholder="$t('page.userCenter.placeholderConfirmPassword')"
                  show-password-on="click"
                />
              </NFormItem>
              <NSpace justify="end">
                <NButton type="primary" :loading="loading" @click="handleUpdatePassword">
                  {{ $t('page.userCenter.submitUpdate') }}
                </NButton>
              </NSpace>
            </NForm>
          </div>
        </NTabPane>

        <!-- 绑定 OTP -->
        <NTabPane name="otp" :tab="$t('page.userCenter.bindOtp')">
          <div class="max-w-400px pt-16px">
            <template v-if="userInfo && !userInfo.otpEnabled">
              <div class="mb-16px text-gray-600">
                {{ $t('page.userCenter.otpTip') }}
              </div>
              <div v-if="otpData" class="flex flex-col items-center mb-24px">
                <img :src="otpData.qr_code_data" class="w-200px h-200px mb-16px border rounded" />
                <div class="font-mono bg-gray-100 p-8px rounded w-full text-center">
                  {{ otpData.secret }}
                </div>
              </div>
              <NForm label-placement="top">
                <NFormItem :label="$t('page.userCenter.otpCode')">
                  <NInput v-model:value="otpCode" :placeholder="$t('page.userCenter.placeholderOtp')" />
                </NFormItem>
                <NSpace justify="end">
                  <NButton type="primary" :loading="loading" @click="handleBindOTP">
                    {{ $t('page.userCenter.submitBind') }}
                  </NButton>
                </NSpace>
              </NForm>
            </template>
            <template v-else-if="userInfo && userInfo.otpEnabled">
              <NCard :bordered="false" size="small" class="bg-primary-50">
                <template #header>
                  <div class="flex-y-center gap-2">
                    <div class="i-icon-park-outline:check-one text-primary text-20px" />
                    <span class="text-primary font-bold">{{ $t('page.userCenter.otpEnabled') }}</span>
                  </div>
                </template>
                <div class="pt-8px text-gray-600 mb-20px">
                  {{ $t('page.userCenter.otpDisableTip') }}
                </div>
                <NForm label-placement="top">
                  <NFormItem :label="$t('page.userCenter.otpCode')">
                    <NInput v-model:value="otpCode" :placeholder="$t('page.userCenter.placeholderOtp')" />
                  </NFormItem>
                  <NSpace justify="end">
                    <NPopconfirm @positive-click="handleUnbindOTP">
                      <template #trigger>
                        <NButton type="error" ghost :loading="loading">{{ $t('page.userCenter.disableOtp') }}</NButton>
                      </template>
                      {{ $t('page.userCenter.confirmDisableOtp') }}
                    </NPopconfirm>
                  </NSpace>
                </NForm>
              </NCard>
            </template>
          </div>
        </NTabPane>

        <!-- 联系方式 -->
        <NTabPane name="contact" :tab="$t('page.userCenter.contact')">
          <div class="max-w-400px pt-16px">
            <NForm :model="contactForm" label-placement="top">
              <NFormItem :label="$t('page.userCenter.email')">
                <NInput v-model:value="contactForm.email" :placeholder="$t('page.userCenter.placeholderEmail')" />
              </NFormItem>
              <NFormItem :label="$t('page.userCenter.phone')">
                <NInput v-model:value="contactForm.phone" :placeholder="$t('page.userCenter.placeholderPhone')" />
              </NFormItem>
              <NSpace justify="end">
                <NButton type="primary" :loading="loading" @click="handleUpdateContact">
                  {{ $t('page.userCenter.saveUpdate') }}
                </NButton>
              </NSpace>
            </NForm>
          </div>
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>

<style scoped></style>

<style scoped></style>
