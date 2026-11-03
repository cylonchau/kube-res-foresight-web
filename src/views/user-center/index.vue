<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import {
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDynamicInput,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  NPopconfirm
} from 'naive-ui';
import { $t } from '@/locales';
import { formatDateTime } from '@/utils/date';
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
/** The usual kinds of contact, offered in the list; any other name can be typed, and it is stored as typed. */
const CONTACT_TYPES = [
  'email',
  'phone',
  'whatsapp',
  'telegram',
  'wechat',
  'wecom',
  'dingtalk',
  'feishu',
  'slack',
  'teams'
];
const contactTypeOptions = computed(() =>
  CONTACT_TYPES.map(value => ({ label: $t(`page.manage.user.contactType_${value}` as any), value }))
);
const contactForm = ref({ contacts: [] as Array<{ type: string; value: string }> });

async function handleUpdateContact() {
  loading.value = true;
  const { error } = await fetchUpdateProfile(contactForm.value.contacts);
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
    contactForm.value.contacts = (data.contacts || []).map(item => ({ ...item }));

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
    <!-- who the account is: read only; the cards below change it -->
    <NCard
      v-if="userInfo"
      :title="$t('page.userCenter.account')"
      :bordered="false"
      size="small"
      class="mb-16px rounded-8px shadow-sm"
    >
      <NDescriptions :column="3" size="small" label-placement="left" bordered>
        <NDescriptionsItem :label="$t('page.userCenter.userName')">{{ userInfo.userName }}</NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.userCenter.nickName')">{{ userInfo.nickName || '-' }}</NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.userCenter.roles')">
          <NSpace v-if="userInfo.roles?.length" :size="4">
            <NTag v-for="role in userInfo.roles" :key="role" size="small" :bordered="false" type="info">
              {{ role }}
            </NTag>
          </NSpace>
          <span v-else>{{ $t('page.userCenter.noRoles') }}</span>
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.userCenter.otpStatus')">
          <NTag size="small" :bordered="false" :type="userInfo.otpEnabled ? 'success' : 'default'">
            {{ userInfo.otpEnabled ? $t('page.userCenter.otpOn') : $t('page.userCenter.otpOff') }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.manage.user.source')">
          <NTag size="small" :bordered="false" :type="userInfo.source === 'ldap' ? 'info' : 'default'">
            {{ $t(`page.manage.user.source_${userInfo.source === 'ldap' ? 'ldap' : 'local'}`) }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.userCenter.language')">{{ userInfo.language || '-' }}</NDescriptionsItem>
        <NDescriptionsItem :label="$t('page.userCenter.lastLogin')">
          {{ userInfo.lastLoginAt ? `${formatDateTime(userInfo.lastLoginAt)} ${userInfo.lastLoginIp || ''}` : '-' }}
        </NDescriptionsItem>
      </NDescriptions>
    </NCard>
    <div class="grid grid-cols-1 items-start gap-16px xl:grid-cols-3 lg:grid-cols-2">
      <!-- 修改密码 -->
      <NCard :title="$t('page.userCenter.updatePassword')" :bordered="false" size="small" class="rounded-8px shadow-sm">
        <div v-if="userInfo?.source === 'ldap'" class="pt-4px text-gray-600">
          {{ $t('page.userCenter.directoryPassword') }}
        </div>
        <div v-else class="pt-4px">
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
      </NCard>

      <!-- 绑定 OTP -->
      <NCard :title="$t('page.userCenter.bindOtp')" :bordered="false" size="small" class="rounded-8px shadow-sm">
        <div class="pt-4px">
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
      </NCard>

      <!-- 联系方式 -->
      <NCard :title="$t('page.userCenter.contact')" :bordered="false" size="small" class="rounded-8px shadow-sm">
        <div class="pt-4px">
          <NForm :model="contactForm" label-placement="top">
            <NDynamicInput v-model:value="contactForm.contacts" :on-create="() => ({ type: 'email', value: '' })">
              <template #default="{ value }">
                <div class="w-full flex gap-8px">
                  <NSelect
                    v-model:value="value.type"
                    filterable
                    tag
                    :options="contactTypeOptions"
                    class="w-130px flex-shrink-0"
                  />
                  <NInput v-model:value="value.value" />
                </div>
              </template>
            </NDynamicInput>
            <NSpace justify="end">
              <NButton type="primary" :loading="loading" @click="handleUpdateContact">
                {{ $t('page.userCenter.saveUpdate') }}
              </NButton>
            </NSpace>
          </NForm>
        </div>
      </NCard>
    </div>
  </div>
</template>

<style scoped></style>
