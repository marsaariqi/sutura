import { safeStorage } from 'electron'
import { getSetting, setSetting } from './database'
import type { ProviderKey } from './ai/provider'

type KeyableProvider = Exclude<ProviderKey, 'ollama' | 'llamacpp'>

/**
 * Encrypt an API key using Electron's safeStorage and store the
 * encrypted buffer (as base64) in the project_settings table.
 * Never stores plaintext.
 */
export function storeApiKey(provider: KeyableProvider, plainKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system')
  }
  const encrypted = safeStorage.encryptString(plainKey)
  const base64 = encrypted.toString('base64')
  setSetting(`${provider}_api_key_encrypted`, base64)
}

/**
 * Retrieve and decrypt an API key for the given provider.
 * Returns empty string if no key is stored.
 */
export function getApiKey(provider: KeyableProvider): string {
  const base64 = getSetting(`${provider}_api_key_encrypted`)
  if (!base64) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system')
  }
  const encrypted = Buffer.from(base64, 'base64')
  return safeStorage.decryptString(encrypted)
}

/**
 * Check if an API key exists for the given provider (without decrypting).
 */
export function hasApiKey(provider: KeyableProvider): boolean {
  const base64 = getSetting(`${provider}_api_key_encrypted`)
  return !!base64 && base64.length > 0
}

/**
 * Remove stored API key for the given provider.
 */
export function removeApiKey(provider: KeyableProvider): void {
  setSetting(`${provider}_api_key_encrypted`, '')
}
