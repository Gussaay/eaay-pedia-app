// Realtime Database access for CI, over REST rather than the Admin SDK.
//
// WHY NOT firebase-admin's getDatabase():
//
// Its database client treats a rejected credential as something worth
// retrying, and retries it for ever. When the service account was not
// authorised for the database, the deploy step did not fail — it printed
// "Provided authentication credentials ... are invalid" every few seconds and
// hung. Two runs sat there for over two hours each, and `continue-on-error`
// cannot rescue a step that never ends.
//
// The REST API answers 401 or 403 straight away, which is what a build step
// needs: a clear, immediate failure with a message saying what to fix.
import { cert } from 'firebase-admin/app';

const TIMEOUT_MS = 20_000;

/**
 * @param databaseURL e.g. https://easy-pedia.firebaseio.com
 * @param serviceAccount the parsed service account JSON
 */
export function restDb(databaseURL, serviceAccount) {
  // cert() also mints OAuth tokens, so no extra dependency is needed.
  const credential = cert(serviceAccount);
  let cached = null;

  const token = async () => {
    if (!cached) cached = (await credential.getAccessToken()).access_token;
    return cached;
  };

  const call = async (method, path, body) => {
    const res = await fetch(`${databaseURL}/${path}.json`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401 || res.status === 403) {
      const error = new Error(
        `The database refused the service account (HTTP ${res.status}). Grant it the ` +
          '"Firebase Realtime Database Admin" role: Google Cloud console -> IAM -> the ' +
          'service account this workflow uses -> Grant access.',
      );
      error.permission = true;
      throw error;
    }
    if (!res.ok) throw new Error(`Database ${method} ${path} failed: HTTP ${res.status}`);

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    get: (path) => call('GET', path),
    /** Merges into the node, like the SDK's update(). */
    update: (path, values) => call('PATCH', path, values),
    /** Replaces the node. */
    set: (path, value) => call('PUT', path, value),
    /** Multi-path atomic write: keys are paths relative to the root. */
    updateRoot: (updates) => call('PATCH', '', updates),
  };
}
