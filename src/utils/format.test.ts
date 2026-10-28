import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCpuMilli, formatMemoryBytes } from './format.ts';

const MIB = 1024 * 1024;

test('a CPU request reads in millicores below a core and in cores from one', () => {
  assert.equal(formatCpuMilli(420), '420m');
  assert.equal(formatCpuMilli(10), '10m');
  assert.equal(formatCpuMilli(1000), '1 核');
  assert.equal(formatCpuMilli(1500), '1.5 核');
  assert.equal(formatCpuMilli(2050), '2.05 核');
  assert.equal(formatCpuMilli(1500, 'cores'), '1.5 cores');
  assert.equal(formatCpuMilli(0), '0m');
  assert.equal(formatCpuMilli(null), '-');
  assert.equal(formatCpuMilli(Number.NaN), '-');
});

test('a memory request reads as a manifest writes it', () => {
  assert.equal(formatMemoryBytes(320 * MIB), '320Mi');
  assert.equal(formatMemoryBytes(420 * MIB), '420Mi');
  assert.equal(formatMemoryBytes(1024 * MIB), '1Gi');
  assert.equal(formatMemoryBytes(2048 * MIB), '2Gi');
  assert.equal(formatMemoryBytes(1088 * MIB), '1088Mi');
  assert.equal(formatMemoryBytes(0), '0Mi');
  assert.equal(formatMemoryBytes(320.5 * MIB), '320.5Mi');
  assert.equal(formatMemoryBytes(undefined), '-');
});
