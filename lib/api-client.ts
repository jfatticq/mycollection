export class ApiError extends Error {
  constructor(message: string, public status: number, public signInRequired = false) { super(message); }
}
/** The hosting gateway can return HTML for sign-in and transient failures. */
export async function requestJSON<T = any>(url: string, init: RequestInit = {}, retrySafe = false): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try { response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(25000), headers: { Accept: 'application/json', ...init.headers } }); }
    catch(e:any) { throw new ApiError(e.name==='TimeoutError'||e.name==='AbortError'?'The request timed out. Your details are still in the form; please retry.':'Could not reach the site. Your details are still in the form; please try again.', 0); }
    const body = await response.text();
    let data: any;
    try { data = JSON.parse(body); } catch { data = undefined; }
    const auth = response.status === 401 || /\/(?:signin-with-chatgpt|callback)(?:[/?]|$)/.test(response.url);
    if (auth) throw new ApiError('Your sign-in session needs to be renewed. Sign in again, then retry saving.', response.status, true);
    const transient = [502, 503, 504].includes(response.status) || (response.ok && data === undefined);
    if (retrySafe && transient && attempt === 0) continue;
    if (data === undefined) {
      if (response.status === 403) throw new ApiError('The site could not authorize this request. Reopen the site and sign in again, then retry.', 403, true);
      throw new ApiError('The site returned an unexpected response. Your details are still in the form; please try again.', response.status);
    }
    if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : 'The request could not be completed. Please try again.', response.status);
    return data as T;
  }
}
