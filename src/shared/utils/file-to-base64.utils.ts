/**
 * File to Base64 Conversion Utility
 * 
 * Converts File objects to base64 data URLs for API transmission
 */

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function filesToBase64(files: File[]): Promise<string[]> {
  return Promise.all(files.map(file => fileToBase64(file)))
}
