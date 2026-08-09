// Dev stub for @tauri-apps/api/core - browser build should never invoke real Tauri
export const invoke = async (..._args: any[]): Promise<any> => {
  throw new Error('Tauri invoke not available in browser dev')
}
export default { invoke }
