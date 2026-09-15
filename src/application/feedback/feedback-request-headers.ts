import { getAppCheckToken } from "@/src/infrastructure/ai/utils/app-check"
import { getProxyAuthHeaders } from "@/src/infrastructure/ai/utils/proxy-auth"

/** Build the authenticated headers used by the production feedback Function. */
export async function getFeedbackRequestHeaders(): Promise<Record<string, string>> {
  const [authHeaders, appCheckToken] = await Promise.all([
    getProxyAuthHeaders(),
    getAppCheckToken(),
  ])
  const clientKey = process.env.NEXT_PUBLIC_PROXY_KEY || ""

  return {
    "Content-Type": "application/json",
    ...(clientKey && { "x-proxy-key": clientKey }),
    ...authHeaders,
    ...(appCheckToken && { "X-Firebase-AppCheck": appCheckToken }),
  }
}
