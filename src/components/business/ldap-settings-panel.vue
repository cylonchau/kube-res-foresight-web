<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NCode,
  NDynamicInput,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import {
  fetchAllRoles,
  fetchGetLdapSettings,
  fetchSyncLdap,
  fetchTestLdap,
  fetchUpdateLdapSettings
} from '@/service/api';

defineOptions({ name: 'LdapSettingsPanel' });

const { t } = useI18n();
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const syncing = ref(false);

const stored = ref<Api.Ldap.Settings | null>(null);
const form = reactive({
  enabled: false,
  url: '',
  start_tls: false,
  skip_verify: false,
  ca_cert: '',
  clear_ca_cert: false,
  bind_dn: '',
  bind_password: '',
  user_base_dn: '',
  user_filter: '',
  display_name_attr: '',
  email_attr: '',
  phone_attr: '',
  group_base_dn: '',
  group_filter: '',
  group_name_attr: '',
  timeout_seconds: 10,
  default_role_code: null as string | null
});

/** One row per directory group: the group name and the role its members get. */
interface MappingRow {
  group: string;
  role: string | null;
}
const mappingRows = ref<MappingRow[]>([]);

const roles = ref<Api.System.Role[]>([]);
const roleOptions = computed(() =>
  roles.value.filter(role => role.status).map(role => ({ label: `${role.name} (${role.code})`, value: role.code }))
);

const testUser = ref('');
const testOutput = ref('');
const testOk = ref<boolean | null>(null);

function parseMappings(text: string): MappingRow[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const at = line.lastIndexOf('=');
      return at < 0
        ? { group: line, role: null }
        : { group: line.slice(0, at).trim(), role: line.slice(at + 1).trim() };
    });
}

/** The stored format: one "directory group=role code" per line; a half-filled row is dropped. */
function serializeMappings(rows: MappingRow[]) {
  return rows
    .filter(row => row.group.trim() && row.role)
    .map(row => `${row.group.trim()}=${row.role}`)
    .join('\n');
}

function apply(data: Api.Ldap.Settings) {
  stored.value = data;
  Object.assign(form, {
    enabled: data.enabled,
    url: data.url,
    start_tls: data.start_tls,
    skip_verify: data.skip_verify,
    ca_cert: '',
    clear_ca_cert: false,
    bind_dn: data.bind_dn,
    bind_password: '',
    user_base_dn: data.user_base_dn,
    user_filter: data.user_filter,
    display_name_attr: data.display_name_attr,
    email_attr: data.email_attr,
    phone_attr: data.phone_attr,
    group_base_dn: data.group_base_dn,
    group_filter: data.group_filter,
    group_name_attr: data.group_name_attr,
    timeout_seconds: data.timeout_seconds || 10,
    default_role_code: data.default_role_code || null
  });
  mappingRows.value = parseMappings(data.group_role_mappings || '');
}

async function load() {
  loading.value = true;
  try {
    const [settings, allRoles] = await Promise.all([fetchGetLdapSettings(), fetchAllRoles()]);
    if (settings.data) apply(settings.data);
    roles.value = allRoles.data || [];
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const payload: Api.Ldap.SettingsPayload = {
      ...form,
      default_role_code: form.default_role_code || '',
      group_role_mappings: serializeMappings(mappingRows.value)
    };
    const { data, error } = await fetchUpdateLdapSettings(payload);
    if (!error && data) {
      apply(data);
      message.success(t('common.modifySuccess'));
    }
  } finally {
    saving.value = false;
  }
}

async function runTest() {
  testing.value = true;
  try {
    const { data, error } = await fetchTestLdap({ username: testUser.value.trim() || undefined });
    if (error || !data) return;
    testOk.value = data.ok;
    testOutput.value = data.ok ? JSON.stringify(data.user ?? { connection: 'ok' }, null, 2) : data.error || '';
  } finally {
    testing.value = false;
  }
}

async function runSync() {
  syncing.value = true;
  try {
    const { data, error } = await fetchSyncLdap();
    if (!error && data)
      message.success(
        t('page.ldap.syncDone', { checked: data.checked, disabled: data.disabled, enabled: data.enabled })
      );
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex-col gap-12px">
    <div class="flex items-center gap-8px px-4px">
      <span class="text-16px font-medium">{{ t('page.ldap.title') }}</span>
      <NTag size="small" :bordered="false" type="info">{{ t('page.ldap.localFirst') }}</NTag>
      <IconTooltip icon="mdi-help-circle" placement="top">
        <div class="max-w-360px leading-22px">{{ t('page.ldap.breakGlass') }}</div>
      </IconTooltip>
    </div>

    <NCard
      :bordered="false"
      size="small"
      class="rounded-16px shadow-sm"
      :title="t('page.ldap.connection')"
      :loading="loading"
    >
      <NForm :model="form" label-placement="top" class="ldap-form-grid">
        <NFormItem :label="t('page.datasource.connections.enabled')">
          <NSwitch v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              URL
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.ldap.urlHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.url" placeholder="ldaps://ldap.example.com:636" />
        </NFormItem>
        <NFormItem :label="t('page.ldap.startTls')"><NSwitch v-model:value="form.start_tls" /></NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.tlsSkipVerify') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.datasource.connections.tlsSkipVerifyHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSwitch v-model:value="form.skip_verify" />
        </NFormItem>
        <NFormItem class="ldap-form-wide">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.caCert') }}
              <NTag v-if="stored?.has_ca_cert && !form.clear_ca_cert" size="small" :bordered="false" type="success">
                {{ t('page.datasource.connections.caCertSaved') }}
              </NTag>
            </span>
          </template>
          <NInput
            v-model:value="form.ca_cert"
            type="textarea"
            :rows="3"
            :placeholder="
              stored?.has_ca_cert ? t('page.datasource.connections.secretKeep') : '-----BEGIN CERTIFICATE-----'
            "
          />
        </NFormItem>
        <NFormItem v-if="stored?.has_ca_cert" :label="t('page.datasource.connections.clearCaCert')">
          <NSwitch v-model:value="form.clear_ca_cert" />
        </NFormItem>
        <NFormItem label="Bind DN">
          <NInput v-model:value="form.bind_dn" placeholder="cn=svc-kubeforecast,ou=services,dc=example,dc=com" />
        </NFormItem>
        <NFormItem :label="t('page.ldap.bindPassword')">
          <NInput
            v-model:value="form.bind_password"
            type="password"
            show-password-on="click"
            :placeholder="stored?.has_bind_password ? t('page.datasource.connections.secretKeep') : ''"
          />
        </NFormItem>
        <NFormItem :label="t('page.datasource.connections.timeoutSeconds')">
          <NInputNumber v-model:value="form.timeout_seconds" :min="1" :max="120" class="w-full" />
        </NFormItem>
      </NForm>
    </NCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.ldap.users')">
      <NForm :model="form" label-placement="top" class="ldap-form-grid">
        <NFormItem :label="t('page.ldap.userBaseDn')">
          <NInput v-model:value="form.user_base_dn" placeholder="ou=people,dc=example,dc=com" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.ldap.userFilter') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.ldap.userFilterHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.user_filter" placeholder="(&(objectClass=person)(uid=%s))" />
        </NFormItem>
        <NFormItem :label="t('page.ldap.displayNameAttr')">
          <NInput v-model:value="form.display_name_attr" placeholder="cn" />
        </NFormItem>
        <NFormItem :label="t('page.ldap.emailAttr')">
          <NInput v-model:value="form.email_attr" placeholder="mail" />
        </NFormItem>
        <NFormItem :label="t('page.ldap.phoneAttr')">
          <NInput v-model:value="form.phone_attr" placeholder="telephoneNumber" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.ldap.defaultRole') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.ldap.defaultRoleHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect
            v-model:value="form.default_role_code"
            clearable
            :options="roleOptions"
            :placeholder="t('page.ldap.noDefaultRole')"
          />
        </NFormItem>
      </NForm>
    </NCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.ldap.groups')">
      <NForm :model="form" label-placement="top" class="ldap-form-grid">
        <NFormItem :label="t('page.ldap.groupBaseDn')">
          <NInput v-model:value="form.group_base_dn" placeholder="ou=groups,dc=example,dc=com" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.ldap.groupFilter') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.ldap.groupFilterHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.group_filter" placeholder="(&(objectClass=groupOfNames)(member=%s))" />
        </NFormItem>
        <NFormItem :label="t('page.ldap.groupNameAttr')">
          <NInput v-model:value="form.group_name_attr" placeholder="cn" />
        </NFormItem>
        <NFormItem class="ldap-form-wide">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.ldap.mappings') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.ldap.mappingsHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NDynamicInput v-model:value="mappingRows" :on-create="() => ({ group: '', role: null })" class="w-full">
            <template #default="{ value }">
              <div class="w-full flex gap-8px">
                <NInput v-model:value="value.group" :placeholder="t('page.ldap.groupPlaceholder')" />
                <NSelect
                  v-model:value="value.role"
                  class="w-280px"
                  :options="roleOptions"
                  :placeholder="t('common.selectField', { field: t('page.ldap.role') })"
                />
              </div>
            </template>
          </NDynamicInput>
        </NFormItem>
      </NForm>
      <NSpace justify="end" class="mt-8px">
        <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
      </NSpace>
    </NCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm" :title="t('page.ldap.testAndSync')">
      <NSpace align="center" wrap>
        <NInput v-model:value="testUser" class="w-280px" :placeholder="t('page.ldap.testUser')" />
        <NButton :loading="testing" @click="runTest">{{ t('page.datasource.connections.test') }}</NButton>
        <NButton :loading="syncing" @click="runSync">{{ t('page.ldap.syncNow') }}</NButton>
      </NSpace>
      <div v-if="testOk !== null" class="mt-12px">
        <NTag :type="testOk ? 'success' : 'error'" :bordered="false">
          {{ testOk ? t('page.ldap.testOk') : t('page.datasource.connections.testFailed') }}
        </NTag>
        <NCode class="mt-8px" :code="testOutput" language="json" word-wrap />
      </div>
      <div class="mt-8px text-13px opacity-70">{{ t('page.ldap.syncHint') }}</div>
    </NCard>
  </div>
</template>

<style scoped>
.ldap-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
}
.ldap-form-grid .ldap-form-wide {
  grid-column: 1 / -1;
}
@media (max-width: 720px) {
  .ldap-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
