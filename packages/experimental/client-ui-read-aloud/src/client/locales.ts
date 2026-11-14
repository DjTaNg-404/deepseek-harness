/** Read-aloud copy for every shipped interface language. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'read-aloud'


declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Read-aloud action copy. */
    'read-aloud': ReadAloudKey
  }
}

/** English copy; every other language must ship exactly these keys. */
export const en = {
  'action.read': 'Read aloud',
  'action.stop': 'Stop reading',
  'error.failed': 'Could not read the answer aloud',
} satisfies Record<string, string>

/** Copy keys the action renders, derived so a deleted key cannot typecheck. */
export type ReadAloudKey = keyof typeof en

/** Chinese copy. */
export const zh = {
  'action.read': '朗读回答',
  'action.stop': '停止朗读',
  'error.failed': '无法朗读这条回答',
} satisfies Record<ReadAloudKey, string>

/** Japanese copy. */
export const ja = {
  'action.read': '読み上げる', 'action.stop': '読み上げを停止', 'error.failed': '回答を読み上げできませんでした',
} satisfies Record<ReadAloudKey, string>


/** Spanish copy. */
export const es = {
  'action.read': 'Leer en voz alta', 'action.stop': 'Detener lectura', 'error.failed': 'No se pudo leer la respuesta',
} satisfies Record<ReadAloudKey, string>


/** French copy. */
export const fr = {
  'action.read': 'Lire à voix haute', 'action.stop': 'Arrêter la lecture', 'error.failed': 'Impossible de lire la réponse',
} satisfies Record<ReadAloudKey, string>


/** German copy. */
export const de = {
  'action.read': 'Vorlesen', 'action.stop': 'Vorlesen beenden', 'error.failed': 'Antwort konnte nicht vorgelesen werden',
} satisfies Record<ReadAloudKey, string>


/** Russian copy. */
export const ru = {
  'action.read': 'Прочитать вслух', 'action.stop': 'Остановить чтение', 'error.failed': 'Не удалось прочитать ответ',
} satisfies Record<ReadAloudKey, string>


/** Brazilian Portuguese copy. */
export const pt = {
  'action.read': 'Ler em voz alta', 'action.stop': 'Parar leitura', 'error.failed': 'Não foi possível ler a resposta',
} satisfies Record<ReadAloudKey, string>
